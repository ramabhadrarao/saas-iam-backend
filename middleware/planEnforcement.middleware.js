// File: backend/middleware/planEnforcement.middleware.js
const UsageTrackingService = require('../services/usageTracking.service');
const { AppError } = require('./errorHandler');

/**
 * Middleware to enforce plan limits
 */
exports.enforcePlanLimits = async (req, res, next) => {
  try {
    // Skip for master admin or if no tenant
    if (req.user.userType === 'master_admin' || !req.user.tenantId) {
      return next();
    }

    // For user creation, check user limits
    if (req.method === 'POST' && req.path === '/api/v1/users') {
      const usageMetrics = await UsageTrackingService.getUsageMetrics(req.user.tenantId);
      
      if (usageMetrics.users.current >= usageMetrics.users.limit) {
        return next(new AppError('User limit reached for your plan. Please upgrade to add more users.', 403));
      }
    }

    // Track API call after response is sent
    const startTime = Date.now();
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      UsageTrackingService.trackApiCall(req.user.tenantId, req.path, responseTime)
        .catch(err => console.error('Error tracking API call:', err));
    });

    next();
  } catch (error) {
    console.error('Plan enforcement error:', error);
    next(error);
  }
};