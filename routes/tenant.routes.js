// File: backend/routes/tenant.routes.js
const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenant.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
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
  asyncHandler(tenantController.getTenantById)
);

router.patch('/:id', 
  authenticate, 
  authorize(['update_tenant']), 
  asyncHandler(tenantController.updateTenant)
);

router.delete('/:id', 
  authenticate, 
  authorize(['delete_tenant']), 
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

module.exports = router;