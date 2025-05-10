// File: backend/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const UserRole = require('../models/userRole.model');
const Role = require('../models/role.model');

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
    
    // Find user
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ message: 'User account is disabled' });
    }
    
    // Attach user info to request
    req.user = {
      id: user._id,
      email: user.email,
      userType: user.userType,
      tenantId: user.tenantId
    };
    
    next();
    
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

exports.authorize = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      // Skip permission check if no permissions required
      if (requiredPermissions.length === 0) {
        return next();
      }
      
      // Super admin bypass - master admins have all permissions
      if (req.user.userType === 'master_admin') {
        return next();
      }
      
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
      res.status(500).json({ message: 'Internal server error' });
    }
  };
};