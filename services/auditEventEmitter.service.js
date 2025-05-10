// File: backend/services/auditEventEmitter.service.js
const socketService = require('../utils/socketService');

/**
 * Service for emitting real-time audit events
 */
class AuditEventEmitter {
  /**
   * Emit a login event
   * @param {Object} logData - Audit log data
   */
  static emitLoginEvent(logData) {
    const isSuccessful = logData.description.includes('successfully');
    
    // Emit to dashboard
    socketService.emitAuditLog({
      type: 'login',
      success: isSuccessful,
      user: logData.userId,
      tenant: logData.tenantId,
      ip: logData.ipAddress,
      timestamp: new Date()
    });
    
    // If failed login, emit security alert
    if (!isSuccessful) {
      socketService.emitSecurityAlert({
        type: 'failed_login',
        user: logData.userId,
        tenant: logData.tenantId,
        ip: logData.ipAddress,
        userAgent: logData.userAgent,
        timestamp: new Date(),
        message: 'Failed login attempt detected'
      });
    }
  }
  
  /**
   * Emit a user event (create, update, delete)
   * @param {Object} logData - Audit log data
   */
  static emitUserEvent(logData) {
    socketService.emitUserActivity({
      type: logData.action.toLowerCase(),
      user: logData.userId,
      tenant: logData.tenantId,
      description: logData.description,
      timestamp: new Date()
    });
  }
  
  /**
   * Emit a tenant event
   * @param {Object} logData - Audit log data
   */
  static emitTenantEvent(logData) {
    // Extract tenant ID from description if possible
    let tenantId = logData.tenantId;
    if (!tenantId && logData.description.includes('Tenant')) {
      // Try to extract from description (this is a simplistic approach)
      const match = logData.description.match(/Tenant\s+(\w+)/);
      if (match && match[1]) {
        // This would need to be refined for your actual description format
      }
    }
    
    socketService.emitTenantUpdate(tenantId, {
      type: logData.action.toLowerCase(),
      user: logData.userId,
      description: logData.description,
      timestamp: new Date()
    });
  }
  
  /**
   * Process audit log and emit appropriate events
   * @param {Object} logData - Audit log data
   */
  static processAuditLog(logData) {
    // Emit different events based on module
    switch (logData.module) {
      case 'AUTH':
        this.emitLoginEvent(logData);
        break;
      case 'USER':
        this.emitUserEvent(logData);
        break;
      case 'TENANT':
        this.emitTenantEvent(logData);
        break;
      default:
        // For all other events, just emit the audit log
        socketService.emitAuditLog(logData);
    }
    
    // Always update dashboard data
    socketService.emitDashboardUpdate();
  }
}

module.exports = AuditEventEmitter;