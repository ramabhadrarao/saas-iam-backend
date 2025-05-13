// File: backend/controllers/tenant.controller.js
const mongoose = require('mongoose');
const Tenant = require('../models/tenant.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const UserRole = require('../models/userRole.model');
const { createAuditLog } = require('../utils/auditLogger');
const UsageTrackingService = require('../services/usageTracking.service');
const DbConnectionManager = require('../services/dbConnectionManager');
const TenantDbInitializer = require('../services/tenantDbInitializer');
const { AppError } = require('../middleware/errorHandler');
const emailService = require('../services/emailService');

/**
 * Create a new tenant
 */
exports.createTenant = async (req, res, next) => {
  // Start a session for transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  
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
    
    // 1. Create the tenant in the master database
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
    
    // 2. Prepare admin user data if provided
    let adminUser = null;
    if (adminEmail && adminPassword) {
      // Check if user with email already exists
      const existingUser = await User.findOne({ email: adminEmail });
      if (existingUser) {
        throw new AppError('User with this email already exists', 400);
      }
      
      adminUser = {
        firstName: adminFirstName || 'Admin',
        lastName: adminLastName || 'User',
        email: adminEmail,
        password: adminPassword,
        userType: 'tenant_admin'
      };
    }
    
    // 3. Create and initialize tenant database
    await TenantDbInitializer.initializeTenantDatabase(tenant, adminUser);
    
    // 4. Create a reference to the tenant admin in the master database if admin details provided
    if (adminUser) {
      const adminUserMaster = new User({
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        email: adminUser.email,
        password: adminUser.password, // Will be hashed by the pre-save hook
        userType: 'tenant_admin',
        tenantId: tenant._id,
        isActive: true
      });
      
      await adminUserMaster.save({ session });
      
      // Assign tenant admin role to the user in master DB
      const tenantAdminRole = await Role.findOne({ 
        name: 'Tenant Admin',
        isSystemRole: true
      });
      
      if (tenantAdminRole) {
        const userRole = new UserRole({
          userId: adminUserMaster._id,
          roleId: tenantAdminRole._id,
          tenantId: tenant._id
        });
        
        await userRole.save({ session });
      }
    }
    
    // Commit the transaction
    await session.commitTransaction();
    session.endSession();
    //Send welcome email to tenant admin
    if (adminUser) {
      try {
        await emailService.sendTenantWelcomeEmail(tenant, {
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          email: adminUser.email
        }, adminPassword);
        
        console.log(`Welcome email sent to ${adminUser.email}`);
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError);
        // Continue even if email fails
      }
    }
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
    
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();
    
    console.error('Create tenant error:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
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
    
    // For tenant_admin and tenant_user, only show their own tenant
    if (req.user.userType !== 'master_admin') {
      query._id = req.user.tenantId;
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
    
    // Get tenant database connection to count users
    const tenantConnection = await DbConnectionManager.getTenantConnection(tenant._id);
    const TenantUser = tenantConnection.model('User');
    
    // Count users in this tenant
    const userCount = await TenantUser.countDocuments();
    
    res.status(200).json({
      tenant: {
        ...tenant.toObject(),
        userCount
      }
    });
    
  } catch (error) {
    console.error('Get tenant by ID error:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
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
    
    // If tenant was activated or deactivated, update the tenant connection
    if (isActive !== undefined) {
      if (isActive) {
        // If tenant was reactivated, ensure we have a connection
        if (!DbConnectionManager.getActiveTenantConnections()[tenantId]) {
          await DbConnectionManager.getTenantConnection(tenantId);
        }
      } else {
        // If tenant was deactivated, remove the connection
        DbConnectionManager.removeTenantConnection(tenantId);
      }
    }
    
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
    
    // Remove tenant connection
    DbConnectionManager.removeTenantConnection(tenantId);
    // Send suspension email to tenant admin users
    try {
      // Find tenant admin users
      const adminUsers = await User.find({ 
        tenantId: tenant._id,
        userType: 'tenant_admin'
      });
      
      // Send emails to all admins
      for (const admin of adminUsers) {
        await emailService.sendTenantSuspensionEmail(tenant, admin, reason);
      }
    } catch (emailError) {
      console.error('Error sending suspension emails:', emailError);
      // Continue even if emails fail
    }
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
    // Send restoration emails to tenant admin users
    try {
      // Find tenant admin users
      const adminUsers = await User.find({ 
        tenantId: tenant._id,
        userType: 'tenant_admin'
      });
      
      // Send emails to all admins
      for (const admin of adminUsers) {
        await emailService.sendTemplateEmail({
          to: admin.email,
          subject: `Your Tenant Account Has Been Restored - ${tenant.name}`,
          templateName: 'tenant-restoration',
          templateData: {
            firstName: admin.firstName,
            tenantName: tenant.name,
            loginUrl: `https://${tenant.subdomain}.${process.env.APP_DOMAIN || 'example.com'}/login`,
            year: new Date().getFullYear()
          }
        });
      }
    } catch (emailError) {
      console.error('Error sending restoration emails:', emailError);
      // Continue even if emails fail
    }
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
 * Delete a tenant (Hard delete - use with caution)
 */
exports.deleteTenant = async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    const tenant = await Tenant.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Remove tenant connection
      DbConnectionManager.removeTenantConnection(tenantId);
      
      // Delete tenant users in master DB
      await User.deleteMany({ tenantId: tenant._id }, { session });
      
      // Delete tenant roles in master DB
      await UserRole.deleteMany({ tenantId: tenant._id }, { session });
      
      // Delete the tenant record
      await tenant.deleteOne({ session });
      
      // Commit the transaction
      await session.commitTransaction();
      session.endSession();
      
      // Log tenant deletion
      await createAuditLog({
        userId: req.user.id,
        action: 'DELETE',
        module: 'TENANT',
        description: `Tenant ${tenant.name} (${tenant.subdomain}) deleted`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.status(200).json({
        message: 'Tenant deleted successfully'
      });
      
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
    
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
    
    // Get tenant database connection
    const tenantConnection = await DbConnectionManager.getTenantConnection(tenantId);
    const TenantUser = tenantConnection.model('User');
    
    // Count users by user type
    const userCounts = await TenantUser.aggregate([
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
    const recentActivity = await TenantUser.find()
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
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get tenant usage data
 */
exports.getTenantUsage = async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    const tenant = await Tenant.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Get tenant database connection
    const tenantConnection = await DbConnectionManager.getTenantConnection(tenantId);
    const TenantUser = tenantConnection.model('User');
    
    // Get current usage
    const userCount = await TenantUser.countDocuments({ 
      isActive: true
    });
    
    // Get plan limits
    const planLimits = {
      free: {
        userLimit: 5,
        storageLimit: 1, // GB
        apiCallsLimit: 1000 // per day
      },
      starter: {
        userLimit: 20,
        storageLimit: 10, // GB
        apiCallsLimit: 10000 // per day
      },
      professional: {
        userLimit: 100,
        storageLimit: 50, // GB
        apiCallsLimit: 100000 // per day
      },
      enterprise: {
        userLimit: 500,
        storageLimit: 500, // GB
        apiCallsLimit: 1000000 // per day
      }
    };
    
    // Default to free plan if plan doesn't exist
    const baseLimits = planLimits[tenant.plan] || planLimits.free;
    
    // Check if tenant has custom limits
    const hasCustomLimits = tenant.overrideLimits && tenant.overrideLimits.hasCustomLimits;
    
    // Use custom limits if available, otherwise use plan defaults
    const actualLimits = hasCustomLimits ? 
      tenant.overrideLimits : 
      { userLimit: baseLimits.userLimit };
    
    res.status(200).json({
      tenant: {
        ...tenant.toObject(),
        planLimits
      },
      usage: {
        users: {
          current: userCount,
          limit: actualLimits.userLimit || baseLimits.userLimit
        },
        storage: {
          current: 0.1, // Placeholder for actual storage calculation
          limit: actualLimits.storageLimit || baseLimits.storageLimit
        },
        apiCalls: {
          current: 145, // Placeholder for actual API call counting
          limit: actualLimits.apiCallsLimit || baseLimits.apiCallsLimit
        }
      }
    });
    
  } catch (error) {
    console.error('Get tenant usage error:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update tenant limits
 */
exports.updateTenantLimits = async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { 
      hasCustomLimits, 
      userLimit, 
      storageLimit, 
      apiCallsLimit 
    } = req.body;
    
    const tenant = await Tenant.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Update tenant limits
    if (!tenant.overrideLimits) {
      tenant.overrideLimits = {};
    }
    
    tenant.overrideLimits.hasCustomLimits = hasCustomLimits;
    
    if (hasCustomLimits) {
      tenant.overrideLimits.userLimit = userLimit;
      tenant.overrideLimits.storageLimit = storageLimit;
      tenant.overrideLimits.apiCallsLimit = apiCallsLimit;
    } else {
      // Reset to plan defaults
      tenant.overrideLimits.userLimit = undefined;
      tenant.overrideLimits.storageLimit = undefined;
      tenant.overrideLimits.apiCallsLimit = undefined;
    }
    
    await tenant.save();
    
    // Log tenant limits update
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'TENANT',
      description: `Tenant ${tenant.name} limits updated`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: 'Tenant limits updated successfully',
      tenant: {
        id: tenant._id,
        name: tenant.name,
        overrideLimits: tenant.overrideLimits
      }
    });
    
  } catch (error) {
    console.error('Update tenant limits error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get detailed tenant usage data
 */
exports.getTenantUsageDetails = async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    // Check if tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Get usage metrics
    const usageMetrics = await UsageTrackingService.getUsageMetrics(tenantId);
    
    // Get tenant database connection
    const tenantConnection = await DbConnectionManager.getTenantConnection(tenantId);
    const TenantAuditLog = tenantConnection.model('AuditLog');
    const TenantUser = tenantConnection.model('User');
    
    // Get historical usage data (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Get API call history by day
    const apiCallsByDay = await TenantAuditLog.aggregate([
      { $match: { 
        createdAt: { $gte: thirtyDaysAgo } 
      }},
      { $group: {
        _id: { 
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } 
        },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Get user growth
    const userGrowth = await TenantUser.aggregate([
      { $match: { 
        createdAt: { $gte: thirtyDaysAgo } 
      }},
      { $group: {
        _id: { 
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } 
        },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    res.status(200).json({
      usageMetrics,
      historicalData: {
        apiCallsByDay,
        userGrowth
      }
    });
    
  } catch (error) {
    console.error('Get tenant usage details error:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update tenant settings
 */
exports.updateTenantSettings = async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { settings } = req.body;
    
    const tenant = await Tenant.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Update settings (merge with existing)
    tenant.settings = { ...tenant.settings, ...settings };
    await tenant.save();
    
    // Update settings in tenant database
    const tenantConnection = await DbConnectionManager.getTenantConnection(tenantId);
    const TenantSettings = tenantConnection.model('Settings');
    
    // Update or create tenant_info settings
    await TenantSettings.updateOne(
      { key: 'tenant_info' },
      { 
        $set: { 
          value: {
            name: tenant.name,
            subdomain: tenant.subdomain,
            plan: tenant.plan,
            settings: tenant.settings
          }
        }
      },
      { upsert: true }
    );
    
    // Log tenant settings update
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'TENANT',
      description: `Tenant ${tenant.name} settings updated`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });
    
    res.status(200).json({
      message: 'Tenant settings updated successfully',
      settings: tenant.settings
    });
    
  } catch (error) {
    console.error('Update tenant settings error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get available tenant plans
 */
exports.getTenantPlans = async (req, res) => {
  try {
    // Define available plans
    const plans = [
      {
        id: 'free',
        name: 'Free',
        description: 'Basic plan for small teams',
        price: 0,
        features: [
          { name: 'Users', value: '5 users' },
          { name: 'Storage', value: '1 GB' },
          { name: 'API Calls', value: '1,000 per day' }
        ]
      },
      {
        id: 'starter',
        name: 'Starter',
        description: 'For growing teams',
        price: 49,
        features: [
          { name: 'Users', value: '20 users' },
          { name: 'Storage', value: '10 GB' },
          { name: 'API Calls', value: '10,000 per day' },
          { name: 'Priority Support', value: 'Email support' }
        ]
      },
      {
        id: 'professional',
        name: 'Professional',
        description: 'For established businesses',
        price: 199,
        features: [
          { name: 'Users', value: '100 users' },
          { name: 'Storage', value: '50 GB' },
          { name: 'API Calls', value: '100,000 per day' },
          { name: 'Priority Support', value: 'Email & phone support' },
          { name: 'Advanced Analytics', value: 'Included' }
        ]
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'For large organizations',
        price: 499,
        features: [
          { name: 'Users', value: '500 users' },
          { name: 'Storage', value: '500 GB' },
          { name: 'API Calls', value: '1,000,000 per day' },
          { name: 'Priority Support', value: 'Dedicated support manager' },
          { name: 'Advanced Analytics', value: 'Included' },
          { name: 'Custom Integrations', value: 'Included' }
        ]
      }
    ];
    
    res.status(200).json({ plans });
    
  } catch (error) {
    console.error('Get tenant plans error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};