// routes/healthcare/case.routes.js
const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const CaseController = require('../../controllers/healthcare/case.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { requireModuleAccess } = require('../../middleware/moduleAccess.middleware');
const { checkQuota } = require('../../middleware/usageQuota.middleware');

// Apply module access check to all routes
router.use(requireModuleAccess('healthcare'));

// Create case
router.post(
  '/',
  [
    authenticate,
    authorize(['manage_cases']),
    checkQuota('healthcare', 'cases'),
    check('surgeryDate', 'Surgery date is required').isISO8601(),
    check('hospitalId', 'Hospital ID is required').notEmpty(),
    check('doctorId', 'Doctor ID is required').notEmpty(),
    check('principleId', 'Principle (Supplier) ID is required').notEmpty(),
    check('categoryId', 'Category ID is required').notEmpty(),
    check('dpValue', 'Dealer price is required').isNumeric(),
    check('sellingPrice', 'Selling price is required').isNumeric()
  ],
  CaseController.createCase
);

// Get all cases
router.get(
  '/',
  authenticate,
  authorize(['view_cases']),
  CaseController.getCases
);

// Get case by ID
router.get(
  '/:id',
  authenticate,
  authorize(['view_cases']),
  CaseController.getCase
);

// Update case
router.put(
  '/:id',
  [
    authenticate,
    authorize(['manage_cases']),
    check('surgeryDate', 'Surgery date must be a valid date').optional().isISO8601(),
    check('hospitalId', 'Hospital ID must not be empty').optional().notEmpty(),
    check('doctorId', 'Doctor ID must not be empty').optional().notEmpty(),
    check('principleId', 'Principle ID must not be empty').optional().notEmpty(),
    check('categoryId', 'Category ID must not be empty').optional().notEmpty(),
    check('dpValue', 'Dealer price must be a number').optional().isNumeric(),
    check('sellingPrice', 'Selling price must be a number').optional().isNumeric()
  ],
  CaseController.updateCase
);

// Delete case
router.delete(
  '/:id',
  authenticate,
  authorize(['manage_cases']),
  CaseController.deleteCase
);

// Case products management
router.post(
  '/:id/products',
  [
    authenticate,
    authorize(['manage_cases']),
    check('productId', 'Product ID is required').notEmpty(),
    check('quantity', 'Quantity must be a number').isNumeric(),
    check('unitPrice', 'Unit price must be a number').isNumeric(),
    check('dpValue', 'Dealer price must be a number').isNumeric()
  ],
  CaseController.addProduct
);

router.put(
  '/:id/products/:productId',
  [
    authenticate,
    authorize(['manage_cases']),
    check('quantity', 'Quantity must be a number').optional().isNumeric(),
    check('unitPrice', 'Unit price must be a number').optional().isNumeric(),
    check('dpValue', 'Dealer price must be a number').optional().isNumeric()
  ],
  CaseController.updateProduct
);

router.delete(
  '/:id/products/:productId',
  authenticate,
  authorize(['manage_cases']),
  CaseController.deleteProduct
);

// Case status management
router.post(
  '/:id/status',
  [
    authenticate,
    authorize(['manage_cases']),
    check('status', 'Status is required').isIn(['Active', 'Pending', 'Completed', 'Cancelled'])
  ],
  CaseController.updateStatus
);

// Case analytics
router.get(
  '/analytics/by-doctor',
  authenticate,
  authorize(['view_cases']),
  CaseController.getCasesByDoctor
);

router.get(
  '/analytics/by-hospital',
  authenticate,
  authorize(['view_cases']),
  CaseController.getCasesByHospital
);

router.get(
  '/analytics/by-product',
  authenticate,
  authorize(['view_cases']),
  CaseController.getCasesByProduct
);

module.exports = router;