// File: backend/routes/tenant.routes.js
const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenant.controller');
const { authenticate, authorize,checkTenantAccess  } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Tenant CRUD operations
router.post('/', 
  authenticate, 
  authorize(['create_tenant']), 
  asyncHandler(tenantController.createTenant)
);

router.get('/', 
  authenticate, 
  authorize(['read_tenant']), 
  asyncHandler(tenantController.getTenants)
);

router.get('/:id', 
  authenticate, 
  authorize(['read_tenant']),
  checkTenantAccess,  
  asyncHandler(tenantController.getTenantById)
);

router.patch('/:id', 
  authenticate, 
  authorize(['update_tenant']),
  checkTenantAccess,  // Add this middleware
  asyncHandler(tenantController.updateTenant)
);

router.delete('/:id', 
  authenticate, 
  authorize(['delete_tenant']),
  checkTenantAccess,  // Add this middleware
  asyncHandler(tenantController.deleteTenant)
);

// Tenant status management
router.post('/:id/suspend', 
  authenticate, 
  authorize(['manage_tenant']), 
  asyncHandler(tenantController.suspendTenant)
);

router.post('/:id/restore', 
  authenticate, 
  authorize(['manage_tenant']), 
  asyncHandler(tenantController.restoreTenant)
);

// Tenant metrics
router.get('/:id/metrics', 
  authenticate, 
  authorize(['read_tenant']), 
  asyncHandler(tenantController.getTenantMetrics)
);

router.get('/:id/usage', 
  authenticate, 
  authorize(['read_tenant']), 
  asyncHandler(tenantController.getTenantUsage)
);

router.patch('/:id/limits', 
  authenticate, 
  authorize(['manage_tenant']), 
  asyncHandler(tenantController.updateTenantLimits)
);

// Get detailed tenant usage data
router.get('/:id/usage-details', 
  authenticate, 
  authorize(['read_tenant']),
  checkTenantAccess,
  asyncHandler(tenantController.getTenantUsageDetails)
);

// Update tenant settings
router.patch('/:id/settings', 
  authenticate, 
  authorize(['update_tenant']),
  checkTenantAccess,
  asyncHandler(tenantController.updateTenantSettings)
);

// Get available tenant plans
router.get('/plans', 
  authenticate, 
  asyncHandler(tenantController.getTenantPlans)
);
module.exports = router;