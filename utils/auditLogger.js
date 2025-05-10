// File: backend/utils/auditLogger.js
// Update your existing auditLogger.js file
const AuditLog = require('../models/auditLog.model');
const AuditEventEmitter = require('../services/auditEventEmitter.service');

/**
 * Create an audit log entry
 * @param {Object} logData - Audit log data
 * @param {string} logData.userId - ID of the user performing the action
 * @param {string} logData.action - Action performed (CREATE, READ, UPDATE, DELETE, LOGIN, LOGOUT, etc.)
 * @param {string} logData.module - Module where action was performed (USER, ROLE, AUTH, etc.)
 * @param {string} logData.description - Description of the action
 * @param {string} [logData.ipAddress] - IP address of the user
 * @param {string} [logData.userAgent] - User agent of the user
 * @param {string} [logData.tenantId] - ID of the tenant
 * @returns {Promise<Object>} Created audit log
 */
exports.createAuditLog = async (logData) => {
  try {
    const auditLog = new AuditLog({
      userId: logData.userId,
      action: logData.action,
      module: logData.module,
      description: logData.description,
      ipAddress: logData.ipAddress,
      userAgent: logData.userAgent,
      tenantId: logData.tenantId || null
    });
    
    await auditLog.save();
    
    // Emit real-time events based on this audit log
    AuditEventEmitter.processAuditLog(auditLog);
    
    return auditLog;
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw the error to prevent affecting the main request flow
    return null;
  }
};