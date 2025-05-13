// File: backend/routes/module.routes.js
const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const moduleController = require('../controllers/module.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Get all modules
router.get(
  '/',
  authenticate,
  authorize(['read_module']),
  asyncHandler(moduleController.getAllModules)
);

// Get modules for a tenant
router.get(
  '/tenant/:tenantId',
  authenticate,
  authorize(['read_module']),
  asyncHandler(moduleController.getTenantModules)
);

// Activate module for tenant
router.post(
  '/activate',
  [
    authenticate,
    authorize(['manage_module']),
    check('tenantId', 'Tenant ID is required').notEmpty(),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('quotaLimits', 'Quota limits must be an object').optional().isObject()
  ],
  asyncHandler(moduleController.activateModule)
);

// Deactivate module for tenant
router.post(
  '/deactivate',
  [
    authenticate,
    authorize(['manage_module']),
    check('tenantId', 'Tenant ID is required').notEmpty(),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('backup', 'Backup flag must be boolean').optional().isBoolean()
  ],
  asyncHandler(moduleController.deactivateModule)
);

// Update module quota
router.put(
  '/quota',
  [
    authenticate,
    authorize(['manage_module']),
    check('tenantId', 'Tenant ID is required').notEmpty(),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('quotaLimits', 'Quota limits must be an object').isObject()
  ],
  asyncHandler(moduleController.updateModuleQuota)
);

// Get module usage stats
router.get(
  '/stats/:tenantId/:moduleId',
  authenticate,
  authorize(['read_module']),
  asyncHandler(moduleController.getModuleUsageStats)
);

module.exports = router;