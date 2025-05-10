// File: backend/routes/permission.routes.js
const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Permission routes
router.get('/', authenticate, asyncHandler(permissionController.getPermissions));

module.exports = router;