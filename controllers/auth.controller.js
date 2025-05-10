// File: backend/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const AuditLog = require('../models/auditLog.model');
const { createAuditLog } = require('../utils/auditLogger');
const crypto = require('crypto');
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Log the login attempt for debugging
    console.log(`Login attempt for: ${email}`);
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`User not found: ${email}`);
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
        tenantId: user.tenantId
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
      description: 'User logged in successfully',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: user.tenantId
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
        tenantId: user.tenantId
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token is required' });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    
    // Generate new access token
    const newToken = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        userType: user.userType,
        tenantId: user.tenantId
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    res.status(200).json({
      token: newToken
    });
    
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

exports.logout = async (req, res) => {
  try {
    // In a stateless JWT-based auth system, the client is responsible for discarding the token
    // However, we can log the logout event for audit purposes
    
    await createAuditLog({
      userId: req.user.id,
      action: 'LOGOUT',
      module: 'AUTH',
      description: 'User logged out',
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

// File: backend/controllers/auth.controller.js (additional methods)

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
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
    
    // Create password reset URL
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
    
    // Send email with reset URL
    try {
      // Email sending logic would go here
      // For now, we'll just log the reset URL
      console.log('Password reset URL:', resetUrl);
      
      // Log password reset request
      await createAuditLog({
        userId: user._id,
        action: 'REQUEST',
        module: 'AUTH',
        description: 'Password reset requested',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        tenantId: user.tenantId
      });
      
      res.status(200).json({ message: 'If email exists, a password reset link has been sent' });
    } catch (err) {
      console.error('Error sending password reset email:', err);
      
      // Reset token fields
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      
      res.status(500).json({ message: 'Error sending password reset email' });
    }
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const { token } = req.params;
    
    // Hash token from params
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
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
    
    // Log password reset
    await createAuditLog({
      userId: user._id,
      action: 'RESET',
      module: 'AUTH',
      description: 'Password reset completed',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: user.tenantId
    });
    
    res.status(200).json({ message: 'Password reset successful' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};