// File: backend/controllers/user.controller.js
const User = require('../models/user.model');
const Role = require('../models/role.model');
const UserRole = require('../models/userRole.model');
const { createAuditLog } = require('../utils/auditLogger');

// Fixed createUser function for user.controller.js
exports.createUser = async (req, res) => {
  try {
    const { 
      firstName, lastName, email, password, userType, tenantId 
    } = req.body;
    
    // Check if user with the same email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Handle tenant ID assignment
    let userTenantId;
    
    if (userType === 'master_admin') {
      // Master admins don't need a tenant ID
      userTenantId = null;
    } else if (userType === 'tenant_admin' || userType === 'tenant_user') {
      // For tenant users, if a tenantId is specified, use it
      if (tenantId) {
        userTenantId = tenantId;
      } 
      // Otherwise, if the current user is a tenant admin, use their tenant ID
      else if (req.user.userType === 'tenant_admin' && req.user.tenantId) {
        userTenantId = req.user.tenantId;
      } 
      // If no tenant ID available, return error
      else {
        return res.status(400).json({ message: 'Tenant ID is required for tenant users and admins' });
      }
    }
    
    // Create new user
    const newUser = new User({
      firstName,
      lastName,
      email,
      password, // Will be hashed by the pre-save hook
      userType,
      tenantId: userTenantId
    });
    
    await newUser.save();
    
    // Log user creation
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      module: 'USER',
      description: `User ${email} created`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });
    
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        userType: newUser.userType,
        tenantId: newUser.tenantId
      }
    });
    
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
exports.getUsers = async (req, res) => {
  try {
    const { userType, tenantId, page = 1, limit = 10 } = req.query;
    
    // Build query based on filters
    const query = {};
    
    if (userType) {
      query.userType = userType;
    }
    
    // For tenant-specific users, only return users from that tenant
    if (req.user.userType !== 'master_admin') {
      query.tenantId = req.user.tenantId;
    } else if (tenantId) {
      query.tenantId = tenantId;
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    // Get users with pagination
    const users = await User.find(query)
      .select('-password')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
    // Get total count for pagination
    const total = await User.countDocuments(query);
    
    res.status(200).json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id;
    
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check authorization - master admin can access any user, tenant admin can only access users in their tenant
    if (req.user.userType !== 'master_admin' && 
        user.tenantId && 
        user.tenantId.toString() !== req.user.tenantId) {
      return res.status(403).json({ message: 'Not authorized to access this user' });
    }
    
    // Get roles assigned to the user
    const userRoles = await UserRole.find({ userId })
      .populate('roleId', 'name description');
      
    const roles = userRoles.map(ur => ur.roleId);
    
    res.status(200).json({
      user: {
        ...user.toObject(),
        roles
      }
    });
    
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { firstName, lastName, email, isActive } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check authorization
    if (req.user.userType !== 'master_admin' && 
        user.tenantId && 
        user.tenantId.toString() !== req.user.tenantId) {
      return res.status(403).json({ message: 'Not authorized to update this user' });
    }
    
    // If email is being changed, ensure it's not already in use
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email is already in use' });
      }
      user.email = email;
    }
    
    // Update user fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (isActive !== undefined) user.isActive = isActive;
    
    await user.save();
    
    // Log user update
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'USER',
      description: `User ${userId} updated`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });
    
    res.status(200).json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
        isActive: user.isActive,
        tenantId: user.tenantId
      }
    });
    
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// File: backend/controllers/user.controller.js (additional method)

exports.getCurrentUser = async (req, res) => {
  try {
    // Get user from database
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get roles assigned to the user
    const userRoles = await UserRole.find({ userId: user._id })
      .populate({
        path: 'roleId',
        populate: {
          path: 'permissions',
          model: 'Permission'
        }
      });
    
    // Extract roles and permissions
    const roles = userRoles.map(ur => ur.roleId);
    
    // Get unique permissions
    const permissions = [];
    const permissionSet = new Set();
    
    roles.forEach(role => {
      role.permissions.forEach(permission => {
        if (!permissionSet.has(permission.name)) {
          permissionSet.add(permission.name);
          permissions.push(permission.name);
        }
      });
    });
    
    res.status(200).json({
      user: {
        ...user.toObject(),
        roles,
        permissions
      }
    });
    
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.assignRole = async (req, res) => {
  try {
    const { userId, roleId } = req.body;
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if role exists
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    
    // Check if user-role assignment already exists
    const existingUserRole = await UserRole.findOne({
      userId,
      roleId
    });
    
    if (existingUserRole) {
      return res.status(400).json({ message: 'User already has this role' });
    }
    
    // Create user-role assignment
    const userRole = new UserRole({
      userId,
      roleId,
      tenantId: user.tenantId
    });
    
    await userRole.save();
    
    // Log role assignment
    await createAuditLog({
      userId: req.user.id,
      action: 'ASSIGN',
      module: 'ROLE',
      description: `Role ${role.name} assigned to user ${userId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });
    
    res.status(200).json({
      message: 'Role assigned successfully',
      userRole
    });
    
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.removeRole = async (req, res) => {
  try {
    const { userId, roleId } = req.body;
    
    // Check if user-role assignment exists
    const userRole = await UserRole.findOne({
      userId,
      roleId
    });
    
    if (!userRole) {
      return res.status(404).json({ message: 'User does not have this role' });
    }
    
    // Get role name for audit log
    const role = await Role.findById(roleId);
    
    // Delete user-role assignment
    await userRole.deleteOne();
    
    // Log role removal
    await createAuditLog({
      userId: req.user.id,
      action: 'REMOVE',
      module: 'ROLE',
      description: `Role ${role?.name || roleId} removed from user ${userId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });
    
    res.status(200).json({
      message: 'Role removed successfully'
    });
    
  } catch (error) {
    console.error('Remove role error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};