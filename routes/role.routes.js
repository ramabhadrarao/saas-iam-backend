// File: backend/routes/role.routes.js
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/role.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Role CRUD operations
router.post('/', authenticate, authorize(['create_role']), asyncHandler(roleController.createRole));
router.get('/', authenticate, authorize(['read_role']), asyncHandler(roleController.getRoles));
router.get('/:id', authenticate, authorize(['read_role']), asyncHandler(roleController.getRoleById));
router.put('/:id', authenticate, authorize(['update_role']), asyncHandler(roleController.updateRole));
router.delete('/:id', authenticate, authorize(['delete_role']), asyncHandler(roleController.deleteRole));

module.exports = router;