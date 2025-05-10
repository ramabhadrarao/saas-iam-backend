// File: backend/controllers/tenant.controller.js
const mongoose = require('mongoose');  // Add this line to import mongoose
const Tenant = require('../models/tenant.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const UserRole = require('../models/userRole.model');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * Create a new tenant
 */
exports.createTenant = async (req, res) => {
  try {
    const { 
      name, 
      subdomain, 
      plan = 'free',
      contactEmail,
      contactPhone,
      address,
      adminEmail,
      adminFirstName,
      adminLastName,
      adminPassword
    } = req.body;
    
    // Check if tenant with the same subdomain already exists
    const existingTenant = await Tenant.findOne({ subdomain });
    if (existingTenant) {
      return res.status(400).json({ message: 'Tenant with this subdomain already exists' });
    }
    
    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // 1. Create the tenant
      const tenant = new Tenant({
        name,
        subdomain,
        plan,
        contactEmail,
        contactPhone,
        address,
        createdBy: req.user.id
      });
      
      await tenant.save({ session });
      
      // 2. Create tenant admin user if admin details provided
      if (adminEmail && adminPassword) {
        // Check if user with email already exists
        const existingUser = await User.findOne({ email: adminEmail });
        if (existingUser) {
          throw new Error('User with this email already exists');
        }
        
        // Create tenant admin user
        const adminUser = new User({
          firstName: adminFirstName || 'Admin',
          lastName: adminLastName || 'User',
          email: adminEmail,
          password: adminPassword, // Will be hashed by the pre-save hook
          userType: 'tenant_admin',
          tenantId: tenant._id,
          isActive: true
        });
        
        await adminUser.save({ session });
        
        // 3. Assign tenant admin role to the user
        // Find the Tenant Admin role
        const tenantAdminRole = await Role.findOne({ 
          name: 'Tenant Admin',
          isSystemRole: true
        });
        
        if (tenantAdminRole) {
          const userRole = new UserRole({
            userId: adminUser._id,
            roleId: tenantAdminRole._id,
            tenantId: tenant._id
          });
          
          await userRole.save({ session });
        }
      }
      
      // Commit the transaction
      await session.commitTransaction();
      session.endSession();
      
      // Log tenant creation
      await createAuditLog({
        userId: req.user.id,
        action: 'CREATE',
        module: 'TENANT',
        description: `Tenant ${name} (${subdomain}) created`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.status(201).json({
        message: 'Tenant created successfully',
        tenant: {
          id: tenant._id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          domain: tenant.domain,
          plan: tenant.plan,
          isActive: tenant.isActive,
          createdAt: tenant.createdAt
        }
      });
      
    } catch (err) {
      // Abort transaction on error
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
    
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

/**
 * Get all tenants with pagination and filtering
 */
exports.getTenants = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, plan, isActive } = req.query;
    
    // Build query based on filters
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { subdomain: { $regex: search, $options: 'i' } },
        { contactEmail: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (plan) {
      query.plan = plan;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    // Get tenants with pagination
    const tenants = await Tenant.find(query)
      .populate('createdBy', 'firstName lastName email')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
    // Get total count for pagination
    const total = await Tenant.countDocuments(query);
    
    res.status(200).json({
      tenants,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get a single tenant by ID
 */
exports.getTenantById = async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    const tenant = await Tenant.findById(tenantId)
      .populate('createdBy', 'firstName lastName email');
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Count users in this tenant
    const userCount = await User.countDocuments({ tenantId: tenant._id });
    
    res.status(200).json({
      tenant: {
        ...tenant.toObject(),
        userCount
      }
    });
    
  } catch (error) {
    console.error('Get tenant by ID error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update a tenant
 */
exports.updateTenant = async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { 
      name, 
      subdomain, 
      plan,
      contactEmail,
      contactPhone,
      address,
      isActive,
      settings,
      logo
    } = req.body;
    
    const tenant = await Tenant.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // If subdomain is being changed, check if it's already in use
    if (subdomain && subdomain !== tenant.subdomain) {
      const existingTenant = await Tenant.findOne({ 
        subdomain,
        _id: { $ne: tenantId } 
      });
      
      if (existingTenant) {
        return res.status(400).json({ message: 'Subdomain is already in use' });
      }
      
      tenant.subdomain = subdomain;
    }
    
    // Update tenant fields
    if (name) tenant.name = name;
    if (plan) tenant.plan = plan;
    if (contactEmail) tenant.contactEmail = contactEmail;
    if (contactPhone) tenant.contactPhone = contactPhone;
    if (address) tenant.address = address;
    if (isActive !== undefined) tenant.isActive = isActive;
    if (settings) tenant.settings = { ...tenant.settings, ...settings };
    if (logo) tenant.logo = logo;
    
    await tenant.save();
    
    // Log tenant update
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'TENANT',
      description: `Tenant ${tenant.name} (${tenant.subdomain}) updated`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: 'Tenant updated successfully',
      tenant: {
        id: tenant._id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        domain: tenant.domain,
        plan: tenant.plan,
        isActive: tenant.isActive,
        updatedAt: tenant.updatedAt
      }
    });
    
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Suspend a tenant
 */
exports.suspendTenant = async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    const tenant = await Tenant.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    tenant.isActive = false;
    await tenant.save();
    
    // Log tenant suspension
    await createAuditLog({
      userId: req.user.id,
      action: 'SUSPEND',
      module: 'TENANT',
      description: `Tenant ${tenant.name} (${tenant.subdomain}) suspended`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: 'Tenant suspended successfully',
      tenant: {
        id: tenant._id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        isActive: tenant.isActive
      }
    });
    
  } catch (error) {
    console.error('Suspend tenant error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Restore a suspended tenant
 */
exports.restoreTenant = async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    const tenant = await Tenant.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    tenant.isActive = true;
    await tenant.save();
    
    // Log tenant restoration
    await createAuditLog({
      userId: req.user.id,
      action: 'RESTORE',
      module: 'TENANT',
      description: `Tenant ${tenant.name} (${tenant.subdomain}) restored`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: 'Tenant restored successfully',
      tenant: {
        id: tenant._id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        isActive: tenant.isActive
      }
    });
    
  } catch (error) {
    console.error('Restore tenant error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Delete a tenant (soft delete by deactivating)
 */
exports.deleteTenant = async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    const tenant = await Tenant.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // For safety, we'll perform a soft delete by deactivating
    tenant.isActive = false;
    await tenant.save();
    
    // Log tenant deletion
    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE',
      module: 'TENANT',
      description: `Tenant ${tenant.name} (${tenant.subdomain}) deleted (soft delete)`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: 'Tenant deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete tenant error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get tenant dashboard metrics
 */
exports.getTenantMetrics = async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    const tenant = await Tenant.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Count users by user type
    const userCounts = await User.aggregate([
      { $match: { tenantId: mongoose.Types.ObjectId(tenantId) } },
      { $group: { _id: '$userType', count: { $sum: 1 } } }
    ]);
    
    // Format user counts
    const userStats = {
      total: 0,
      admins: 0,
      users: 0
    };
    
    userCounts.forEach(stat => {
      if (stat._id === 'tenant_admin') {
        userStats.admins = stat.count;
      } else if (stat._id === 'tenant_user') {
        userStats.users = stat.count;
      }
      userStats.total += stat.count;
    });
    
    // Get recent user activity
    const recentActivity = await User.find({ tenantId })
      .select('firstName lastName email lastLogin')
      .sort({ lastLogin: -1 })
      .limit(5);
    
    res.status(200).json({
      tenant: {
        id: tenant._id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        domain: tenant.domain,
        plan: tenant.plan,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt
      },
      metrics: {
        userStats,
        recentActivity
      }
    });
    
  } catch (error) {
    console.error('Get tenant metrics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};