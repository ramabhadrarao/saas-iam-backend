// File: backend/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const UserRole = require('../models/userRole.model');
const Role = require('../models/role.model');
const mongoose = require('mongoose');
const Tenant = require('../models/tenant.model');
const DbConnectionManager = require('../services/dbConnectionManager');
const { AppError } = require('./errorHandler');

exports.authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if this is a tenant-specific token
    if (decoded.tenantId) {
      await authenticateTenantUser(req, decoded, next);
    } else {
      await authenticateMasterUser(req, decoded, next);
    }
    
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/**
 * Authenticate a master (non-tenant) user
 */
async function authenticateMasterUser(req, decoded, next) {
  // Find user in master database
  const user = await User.findById(decoded.id).select('-password');
  
  if (!user) {
    throw new AppError('User not found', 401);
  }
  
  if (!user.isActive) {
    throw new AppError('User account is disabled', 401);
  }
  
  // Attach user info to request
  req.user = {
    id: user._id,
    email: user.email,
    userType: user.userType,
    tenantId: null,
    isMasterAdmin: true
  };
  
  next();
}

/**
 * Authenticate a tenant user
 */
async function authenticateTenantUser(req, decoded, next) {
  // Find tenant
  const tenant = await Tenant.findById(decoded.tenantId);
  
  if (!tenant) {
    throw new AppError('Tenant not found', 401);
  }
  
  if (!tenant.isActive) {
    throw new AppError('Tenant is inactive', 401);
  }
  
  // Get tenant database connection
  const tenantDb = await DbConnectionManager.getTenantConnection(tenant._id);
  
  // Find user in tenant database
  const TenantUser = tenantDb.model('User');
  const user = await TenantUser.findById(decoded.id).select('-password');
  
  if (!user) {
    throw new AppError('User not found', 401);
  }
  
  if (!user.isActive) {
    throw new AppError('User account is disabled', 401);
  }
  
  // Add tenant database to request
  req.tenantDb = tenantDb;
  req.tenant = tenant;
  
  // Attach user info to request
  req.user = {
    id: user._id.toString(),
    email: user.email,
    userType: user.userType,
    tenantId: tenant._id,
    permissions: decoded.permissions || []
  };
  
  next();
}

exports.authorize = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      // Skip permission check if no permissions required
      if (requiredPermissions.length === 0) {
        return next();
      }
      
      // Super admin bypass - master admins have all permissions
      if (req.user.isMasterAdmin) {
        return next();
      }
      
      // For tenant users, check permissions from the token
      if (req.user.tenantId && req.user.permissions) {
        // Check if user has any of the required permissions
        const hasPermission = requiredPermissions.some(permission => 
          req.user.permissions.includes(permission)
        );
        
        if (!hasPermission) {
          return res.status(403).json({ message: 'Permission denied' });
        }
        
        return next();
      }
      
      // If we're here, it's a master user without the master admin type,
      // so we need to check their permissions from the database
      
      // Get user roles
      const userRoles = await UserRole.find({ userId: req.user.id });
      const roleIds = userRoles.map(ur => ur.roleId);
      
      // Get permissions assigned to these roles
      const roles = await Role.find({
        _id: { $in: roleIds }
      }).populate('permissions');
      
      // Extract all permission IDs
      const userPermissions = new Set();
      roles.forEach(role => {
        role.permissions.forEach(permission => {
          userPermissions.add(permission.name);
        });
      });
      
      // Check if user has any of the required permissions
      const hasPermission = requiredPermissions.some(permission => 
        userPermissions.has(permission)
      );
      
      if (!hasPermission) {
        return res.status(403).json({ message: 'Permission denied' });
      }
      
      next();
      
    } catch (error) {
      console.error('Authorization error:', error);
      
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      
      res.status(500).json({ message: 'Internal server error' });
    }
  };
};

// Middleware to check tenant access
exports.checkTenantAccess = async (req, res, next) => {
  try {
    // Master admins have access to all tenants
    if (req.user.isMasterAdmin) {
      return next();
    }
    
    // For tenant operations with an ID parameter, check access
    if (req.params.id) {
      // Ensure tenant users can only access their own tenant
      if (!req.user.tenantId || req.params.id !== req.user.tenantId.toString()) {
        return res.status(403).json({ message: 'Access denied: You can only access your own tenant' });
      }
    }
    
    next();
  } catch (error) {
    console.error('Tenant access check error:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};