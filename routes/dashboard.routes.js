// File: backend/routes/dashboard.routes.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Get dashboard metrics - requires read_dashboard permission
router.get('/metrics', authenticate, authorize(['read_dashboard']), asyncHandler(dashboardController.getDashboardMetrics));
// File: backend/routes/dashboard.routes.js
// Add these routes to your existing dashboard routes

// Get system health metrics
router.get('/system-health', 
  authenticate, 
  authorize(['read_dashboard']), 
  asyncHandler(dashboardController.getSystemHealth)
);

// Get tenant comparison metrics
router.get('/tenant-comparison', 
  authenticate, 
  authorize(['read_dashboard']), 
  asyncHandler(dashboardController.getTenantComparison)
);

// Get security metrics
router.get('/security-metrics', 
  authenticate, 
  authorize(['read_dashboard']), 
  asyncHandler(dashboardController.getSecurityMetrics)
);
module.exports = router;