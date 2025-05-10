// File: backend/services/usageTracking.service.js
const mongoose = require('mongoose');
const User = require('../models/user.model');
const AuditLog = require('../models/auditLog.model');
const Tenant = require('../models/tenant.model');

/**
 * Service for tracking tenant usage metrics
 */
class UsageTrackingService {
  /**
   * Track API call usage for a tenant
   * @param {string} tenantId - ID of the tenant
   * @param {string} endpoint - API endpoint called
   * @param {number} responseTime - Response time in ms
   * @returns {Promise<void>}
   */
  static async trackApiCall(tenantId, endpoint, responseTime) {
    try {
      // Update the tenant's API call count
      await Tenant.findByIdAndUpdate(tenantId, {
        $inc: {
          'usageMetrics.apiCalls.count': 1,
          'usageMetrics.apiCalls.totalResponseTime': responseTime
        },
        $push: {
          'usageMetrics.apiCalls.history': {
            endpoint,
            responseTime,
            timestamp: new Date()
          }
        }
      });
    } catch (error) {
      console.error('Error tracking API call:', error);
    }
  }

  /**
   * Track storage usage for a tenant
   * @param {string} tenantId - ID of the tenant
   * @param {number} bytes - Bytes stored
   * @returns {Promise<void>}
   */
  static async trackStorageUsage(tenantId, bytes) {
    try {
      await Tenant.findByIdAndUpdate(tenantId, {
        $inc: {
          'usageMetrics.storage.bytes': bytes
        }
      });
    } catch (error) {
      console.error('Error tracking storage usage:', error);
    }
  }

  /**
   * Get current usage metrics for a tenant
   * @param {string} tenantId - ID of the tenant
   * @returns {Promise<Object>} Usage metrics
   */
  static async getUsageMetrics(tenantId) {
    try {
      // Get user count
      const userCount = await User.countDocuments({ 
        tenantId, 
        isActive: true 
      });

      // Get API call metrics for last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const apiCallCount = await AuditLog.countDocuments({ 
        tenantId,
        createdAt: { $gte: thirtyDaysAgo }
      });

      // Get storage usage (placeholder for actual storage calculation)
      // This would need to be implemented based on your storage model
      const storageBytes = 0;

      // Get tenant for plan details
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Calculate plan limits
      const planLimits = {
        free: {
          userLimit: 5,
          storageLimit: 1 * 1024 * 1024 * 1024, // 1GB in bytes
          apiCallsLimit: 1000
        },
        starter: {
          userLimit: 20,
          storageLimit: 10 * 1024 * 1024 * 1024, // 10GB
          apiCallsLimit: 10000
        },
        professional: {
          userLimit: 100,
          storageLimit: 50 * 1024 * 1024 * 1024, // 50GB
          apiCallsLimit: 100000
        },
        enterprise: {
          userLimit: 500,
          storageLimit: 500 * 1024 * 1024 * 1024, // 500GB
          apiCallsLimit: 1000000
        }
      };

      // Get base limits from plan
      const baseLimits = planLimits[tenant.plan] || planLimits.free;

      // Apply custom limits if available
      const hasCustomLimits = tenant.overrideLimits && tenant.overrideLimits.hasCustomLimits;
      const actualLimits = hasCustomLimits ? 
        tenant.overrideLimits : 
        baseLimits;

      return {
        tenant: {
          id: tenant._id,
          name: tenant.name,
          plan: tenant.plan,
          isActive: tenant.isActive
        },
        users: {
          current: userCount,
          limit: actualLimits.userLimit || baseLimits.userLimit,
          percentage: Math.round((userCount / (actualLimits.userLimit || baseLimits.userLimit)) * 100)
        },
        storage: {
          current: storageBytes,
          limit: actualLimits.storageLimit || baseLimits.storageLimit,
          percentage: Math.round((storageBytes / (actualLimits.storageLimit || baseLimits.storageLimit)) * 100),
          formattedCurrent: this.formatBytes(storageBytes),
          formattedLimit: this.formatBytes(actualLimits.storageLimit || baseLimits.storageLimit)
        },
        apiCalls: {
          current: apiCallCount,
          limit: actualLimits.apiCallsLimit || baseLimits.apiCallsLimit,
          percentage: Math.round((apiCallCount / (actualLimits.apiCallsLimit || baseLimits.apiCallsLimit)) * 100)
        }
      };
    } catch (error) {
      console.error('Error getting usage metrics:', error);
      throw error;
    }
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted size
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = UsageTrackingService;