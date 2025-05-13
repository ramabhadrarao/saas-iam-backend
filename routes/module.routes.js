// routes/module.routes.js
const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const ModuleController = require('../controllers/module.controller');
const auth = require('../middleware/auth.middleware');

// Get all modules
router.get(
  '/',
  auth(['view_modules']),
  ModuleController.getAllModules
);

// Get modules for a tenant
router.get(
  '/tenant/:tenantId',
  auth(['view_modules']),
  ModuleController.getTenantModules
);

// Activate module for tenant
router.post(
  '/activate',
  [
    auth(['manage_modules']),
    check('tenantId', 'Tenant ID is required').notEmpty(),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('quotaLimits', 'Quota limits must be an object').optional().isObject()
  ],
  ModuleController.activateModule
);

// Deactivate module for tenant
router.post(
  '/deactivate',
  [
    auth(['manage_modules']),
    check('tenantId', 'Tenant ID is required').notEmpty(),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('backup', 'Backup flag must be boolean').optional().isBoolean()
  ],
  ModuleController.deactivateModule
);

// Update module quota
router.put(
  '/quota',
  [
    auth(['manage_modules']),
    check('tenantId', 'Tenant ID is required').notEmpty(),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('quotaLimits', 'Quota limits must be an object').isObject()
  ],
  ModuleController.updateModuleQuota
);

// Get module usage stats
router.get(
  '/stats/:tenantId/:moduleId',
  auth(['view_modules']),
  ModuleController.getModuleUsageStats
);

module.exports = router;