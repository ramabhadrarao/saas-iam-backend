// File: backend/routes/dashboard.routes.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Get dashboard metrics - requires read_dashboard permission
router.get('/metrics', authenticate, authorize(['read_dashboard']), asyncHandler(dashboardController.getDashboardMetrics));

module.exports = router;