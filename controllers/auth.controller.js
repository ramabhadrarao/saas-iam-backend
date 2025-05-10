// File: backend/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const AuditLog = require('../models/auditLog.model');
const { createAuditLog } = require('../utils/auditLogger');
const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const Tenant = require('../models/tenant.model');
const DbConnectionManager = require('../services/dbConnectionManager');
const emailService = require('../services/emailService');
exports.login = async (req, res) => {
  try {
    const { email, password, tenantId, subdomain } = req.body;
    
    // Log the login attempt for debugging
    console.log(`Login attempt for: ${email}`);
    
    // Determine if this is a tenant-specific login
    let tenant = null;
    let isTenantLogin = false;
    
    // Check if tenant context is provided
    if (tenantId) {
      tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        return res.status(401).json({ message: 'Tenant not found' });
      }
      isTenantLogin = true;
    } else if (subdomain) {
      tenant = await Tenant.findOne({ subdomain });
      if (!tenant) {
        return res.status(401).json({ message: 'Tenant not found' });
      }
      isTenantLogin = true;
    } else if (req.tenant) {
      // Use tenant from middleware
      tenant = req.tenant;
      isTenantLogin = true;
    }
    
    // Handle tenant-specific login
    if (isTenantLogin) {
      return await handleTenantLogin(req, res, email, password, tenant);
    }
    
    // Handle master login (non-tenant)
    return await handleMasterLogin(req, res, email, password);
    
  } catch (error) {
    console.error('Login error:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Handle login for master users (non-tenant)
 */
async function handleMasterLogin(req, res, email, password) {
  // Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    console.log(`User not found: ${email}`);
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  
  // Check if user is a tenant user
  if (user.userType !== 'master_admin') {
    console.log(`User is not a master admin: ${email}`);
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  
  // Check if user is active
  if (!user.isActive) {
    console.log(`User account is disabled: ${email}`);
    return res.status(401).json({ message: 'Account is disabled. Please contact administrator.' });
  }
  
  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    console.log(`Invalid password for: ${email}`);
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  
  console.log(`Successful login for: ${email}`);
  
  // Update last login time
  user.lastLogin = new Date();
  await user.save();
  
  // Generate JWT
  const token = jwt.sign(
    { 
      id: user._id,
      email: user.email,
      userType: user.userType,
      tenantId: null
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  
  // Create refresh token
  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );
  
  // Log successful login
  await createAuditLog({
    userId: user._id,
    action: 'LOGIN',
    module: 'AUTH',
    description: 'Master admin logged in successfully',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  res.status(200).json({
    message: 'Login successful',
    token,
    refreshToken,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      userType: user.userType,
      isMasterAdmin: true
    }
  });
}

/**
 * Handle login for tenant users
 */
async function handleTenantLogin(req, res, email, password, tenant) {
  // Check if tenant is active
  if (!tenant.isActive) {
    console.log(`Tenant is inactive: ${tenant.subdomain}`);
    return res.status(401).json({ message: 'Tenant is inactive. Please contact administrator.' });
  }
  
  try {
    // Get tenant database connection
    const tenantDb = await DbConnectionManager.getTenantConnection(tenant._id);
    
    // Get User model for tenant database
    const TenantUser = tenantDb.model('User');
    
    // Find user in tenant database
    const user = await TenantUser.findOne({ email });
    
    if (!user) {
      console.log(`User not found in tenant: ${email}`);
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Check if user is active
    if (!user.isActive) {
      console.log(`User account is disabled: ${email}`);
      return res.status(401).json({ message: 'Account is disabled. Please contact administrator.' });
    }
    
    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log(`Invalid password for: ${email}`);
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    console.log(`Successful tenant login for: ${email}`);
    
    // Update last login time
    user.lastLogin = new Date();
    await user.save();
    
    // Get user roles and permissions
    const TenantUserRole = tenantDb.model('UserRole');
    const userRoles = await TenantUserRole.find({ userId: user._id })
      .populate({
        path: 'roleId',
        populate: {
          path: 'permissions'
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
    
    // Generate JWT with tenant info
    const token = jwt.sign(
      { 
        id: user._id.toString(),
        email: user.email,
        userType: user.userType,
        tenantId: tenant._id.toString(),
        permissions: permissions
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    // Create refresh token
    const refreshToken = jwt.sign(
      { 
        id: user._id.toString(),
        tenantId: tenant._id.toString()
      },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: '7d' }
    );
    
    // Log successful login in tenant database
    const TenantAuditLog = tenantDb.model('AuditLog');
    await TenantAuditLog.create({
      userId: user._id,
      action: 'LOGIN',
      module: 'AUTH',
      description: 'User logged in successfully',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    // Also log in master database
    await createAuditLog({
      userId: user._id.toString(),
      action: 'LOGIN',
      module: 'AUTH',
      description: `Tenant user logged in: ${email} (${tenant.subdomain})`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: tenant._id
    });
    
    res.status(200).json({
      message: 'Login successful',
      token,
      refreshToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
        tenant: {
          id: tenant._id,
          name: tenant.name,
          subdomain: tenant.subdomain
        },
        permissions: permissions,
        roles: roles.map(role => ({
          id: role._id,
          name: role.name,
          description: role.description
        }))
      }
    });
  } catch (error) {
    console.error(`Tenant login error:`, error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
}

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token is required' });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    
    // Check if this is a tenant-specific token
    if (decoded.tenantId) {
      // Get tenant
      const tenant = await Tenant.findById(decoded.tenantId);
      if (!tenant || !tenant.isActive) {
        return res.status(401).json({ message: 'Invalid refresh token or inactive tenant' });
      }
      
      // Get tenant database connection
      const tenantDb = await DbConnectionManager.getTenantConnection(tenant._id);
      
      // Get User model for tenant database
      const TenantUser = tenantDb.model('User');
      
      // Find user in tenant database
      const user = await TenantUser.findById(decoded.id);
      
      if (!user || !user.isActive) {
        return res.status(401).json({ message: 'Invalid refresh token or inactive user' });
      }
      
      // Get user permissions
      const TenantUserRole = tenantDb.model('UserRole');
      const userRoles = await TenantUserRole.find({ userId: user._id })
        .populate({
          path: 'roleId',
          populate: {
            path: 'permissions'
          }
        });
      
      // Extract permissions
      const permissions = [];
      const permissionSet = new Set();
      
      userRoles.forEach(ur => {
        ur.roleId.permissions.forEach(permission => {
          if (!permissionSet.has(permission.name)) {
            permissionSet.add(permission.name);
            permissions.push(permission.name);
          }
        });
      });
      
      // Generate new access token
      const token = jwt.sign(
        { 
          id: user._id.toString(),
          email: user.email,
          userType: user.userType,
          tenantId: tenant._id.toString(),
          permissions: permissions
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );
      
      res.status(200).json({
        token,
        user: {
          id: user._id,
          email: user.email,
          userType: user.userType,
          tenant: {
            id: tenant._id,
            name: tenant.name,
            subdomain: tenant.subdomain
          }
        }
      });
    } else {
      // This is a master admin token
      const user = await User.findById(decoded.id);
      
      if (!user || !user.isActive) {
        return res.status(401).json({ message: 'Invalid refresh token' });
      }
      
      // Generate new access token
      const token = jwt.sign(
        { 
          id: user._id,
          email: user.email,
          userType: user.userType,
          tenantId: null
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );
      
      res.status(200).json({
        token,
        user: {
          id: user._id,
          email: user.email,
          userType: user.userType,
          isMasterAdmin: true
        }
      });
    }
    
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

exports.logout = async (req, res) => {
  try {
    // In a stateless JWT-based auth system, the client is responsible for discarding the token
    // However, we can log the logout event for audit purposes
    
    // Check if this is a tenant-specific logout
    if (req.user.tenantId) {
      // Get tenant
      const tenant = await Tenant.findById(req.user.tenantId);
      if (tenant && tenant.isActive) {
        // Get tenant database connection
        const tenantDb = await DbConnectionManager.getTenantConnection(tenant._id);
        
        // Log logout in tenant database
        const TenantAuditLog = tenantDb.model('AuditLog');
        await TenantAuditLog.create({
          userId: req.user.id,
          action: 'LOGOUT',
          module: 'AUTH',
          description: 'User logged out',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
      }
    }
    
    // Always log in master database
    await createAuditLog({
      userId: req.user.id,
      action: 'LOGOUT',
      module: 'AUTH',
      description: req.user.tenantId ? 'Tenant user logged out' : 'Master admin logged out',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });
    
    res.status(200).json({ message: 'Logout successful' });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Updated forgotPassword with email functionality
exports.forgotPassword = async (req, res) => {
  try {
    const { email, tenantId, subdomain } = req.body;
    
    // Determine if this is a tenant-specific request
    let tenant = null;
    let isTenantRequest = false;
    
    // Check if tenant context is provided
    if (tenantId) {
      tenant = await Tenant.findById(tenantId);
      if (!tenant || !tenant.isActive) {
        // Don't reveal that tenant doesn't exist or is inactive
        return res.status(200).json({ message: 'If email exists, a password reset link has been sent' });
      }
      isTenantRequest = true;
    } else if (subdomain) {
      tenant = await Tenant.findOne({ subdomain });
      if (!tenant || !tenant.isActive) {
        return res.status(200).json({ message: 'If email exists, a password reset link has been sent' });
      }
      isTenantRequest = true;
    } else if (req.tenant) {
      // Use tenant from middleware
      tenant = req.tenant;
      isTenantRequest = true;
    }
    
    if (isTenantRequest) {
      // Handle tenant-specific password reset
      await handleTenantForgotPassword(req, res, email, tenant);
    } else {
      // Handle master password reset
      await handleMasterForgotPassword(req, res, email);
    }
    
  } catch (error) {
    console.error('Forgot password error:', error);
    // Always return the same message to prevent email enumeration
    res.status(200).json({ message: 'If email exists, a password reset link has been sent' });
  }
};


/**
 * Handle forgot password for master users
 */
async function handleMasterForgotPassword(req, res, email) {
  // Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(200).json({ message: 'If email exists, a password reset link has been sent' });
  }
  
  // Generate password reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Hash token and save to user
  user.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
      
  user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
  
  await user.save();
  
  try {
    // Send password reset email
    await emailService.sendPasswordResetEmail(user, resetToken);
    
    // Log password reset request
    await createAuditLog({
      userId: user._id,
      action: 'REQUEST',
      module: 'AUTH',
      description: 'Password reset requested',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({ message: 'If email exists, a password reset link has been sent' });
  } catch (err) {
    console.error('Error sending password reset email:', err);
    
    // Reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    throw new Error('Error sending password reset email');
  }
}

/**
 * Handle forgot password for tenant users
 */
async function handleTenantForgotPassword(req, res, email, tenant) {
  // Get tenant database connection
  const tenantDb = await DbConnectionManager.getTenantConnection(tenant._id);
  
  // Get User model for tenant database
  const TenantUser = tenantDb.model('User');
  
  // Find user in tenant database
  const user = await TenantUser.findOne({ email });
  if (!user) {
    return res.status(200).json({ message: 'If email exists, a password reset link has been sent' });
  }
  
  // Generate password reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Hash token and save to user
  user.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
  
  await user.save();
  
  try {
    // Send password reset email
    await emailService.sendPasswordResetEmail(user, resetToken, tenant);
    
    // Log password reset request in tenant database
    const TenantAuditLog = tenantDb.model('AuditLog');
    await TenantAuditLog.create({
      userId: user._id,
      action: 'REQUEST',
      module: 'AUTH',
      description: 'Password reset requested',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    // Also log in master database
    await createAuditLog({
      userId: user._id.toString(),
      action: 'REQUEST',
      module: 'AUTH',
      description: `Tenant user password reset requested: ${email} (${tenant.subdomain})`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: tenant._id
    });
    
    res.status(200).json({ message: 'If email exists, a password reset link has been sent' });
  } catch (err) {
    console.error('Error sending password reset email:', err);
    
    // Reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    throw new Error('Error sending password reset email');
  }
}

// Updated resetPassword with email confirmation
exports.resetPassword = async (req, res) => {
  try {
    const { password, tenantId, subdomain } = req.body;
    const { token } = req.params;
    
    // Hash token from params
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    // Determine if this is a tenant-specific request
    let tenant = null;
    let isTenantRequest = false;
    
    // Check if tenant context is provided
    if (tenantId) {
      tenant = await Tenant.findById(tenantId);
      if (!tenant || !tenant.isActive) {
        return res.status(400).json({ message: 'Invalid or expired reset token' });
      }
      isTenantRequest = true;
    } else if (subdomain) {
      tenant = await Tenant.findOne({ subdomain });
      if (!tenant || !tenant.isActive) {
        return res.status(400).json({ message: 'Invalid or expired reset token' });
      }
      isTenantRequest = true;
    } else if (req.tenant) {
      // Use tenant from middleware
      tenant = req.tenant;
      isTenantRequest = true;
    }
    
    if (isTenantRequest) {
      // Handle tenant-specific password reset
      await handleTenantResetPassword(req, res, password, resetPasswordToken, tenant);
    } else {
      // Handle master password reset
      await handleMasterResetPassword(req, res, password, resetPasswordToken);
    }
    
  } catch (error) {
    console.error('Reset password error:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Handle reset password for master users
 */
async function handleMasterResetPassword(req, res, password, resetPasswordToken) {
  // Find user by token and check expiration
  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired reset token' });
  }
  
  // Set new password
  user.password = password; // Will be hashed by pre-save hook
  
  // Clear reset token fields
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  
  await user.save();
  
  // Send confirmation email
  try {
    await emailService.sendTemplateEmail({
      to: user.email,
      subject: 'Your Password Has Been Reset',
      templateName: 'password-changed',
      templateData: {
        firstName: user.firstName,
        year: new Date().getFullYear()
      }
    });
  } catch (error) {
    console.error('Error sending password change confirmation email:', error);
    // Continue with the process even if email fails
  }
  
  // Log password reset
  await createAuditLog({
    userId: user._id,
    action: 'RESET',
    module: 'AUTH',
    description: 'Password reset completed',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  res.status(200).json({ message: 'Password reset successful' });
}

/**
 * Handle reset password for tenant users
 */
async function handleTenantResetPassword(req, res, password, resetPasswordToken, tenant) {
  // Get tenant database connection
  const tenantDb = await DbConnectionManager.getTenantConnection(tenant._id);
  
  // Get User model for tenant database
  const TenantUser = tenantDb.model('User');
  
  // Find user by token and check expiration
  const user = await TenantUser.findOne({
    resetPasswordToken,
    resetPasswordExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired reset token' });
  }
  
  // Set new password
  user.password = password; // Will be hashed by pre-save hook
  
  // Clear reset token fields
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  
  await user.save();
  
  // Send confirmation email
  try {
    await emailService.sendTemplateEmail({
      to: user.email,
      subject: 'Your Password Has Been Reset',
      templateName: 'password-changed',
      templateData: {
        firstName: user.firstName,
        tenantName: tenant.name,
        year: new Date().getFullYear()
      }
    });
  } catch (error) {
    console.error('Error sending password change confirmation email:', error);
    // Continue with the process even if email fails
  }
  
  // Log password reset in tenant database
  const TenantAuditLog = tenantDb.model('AuditLog');
  await TenantAuditLog.create({
    userId: user._id,
    action: 'RESET',
    module: 'AUTH',
    description: 'Password reset completed',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  // Also log in master database
  await createAuditLog({
    userId: user._id.toString(),
    action: 'RESET',
    module: 'AUTH',
    description: `Tenant user password reset completed: ${user.email} (${tenant.subdomain})`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    tenantId: tenant._id
  });
  
  res.status(200).json({ message: 'Password reset successful' });
}