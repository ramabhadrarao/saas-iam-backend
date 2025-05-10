// File: backend/routes/user.routes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Get current user
router.get('/me', authenticate, asyncHandler(userController.getCurrentUser));

// User CRUD operations
router.post('/', authenticate, authorize(['create_user']), asyncHandler(userController.createUser));
router.get('/', authenticate, authorize(['read_user']), asyncHandler(userController.getUsers));
router.get('/:id', authenticate, authorize(['read_user']), asyncHandler(userController.getUserById));
router.put('/:id', authenticate, authorize(['update_user']), asyncHandler(userController.updateUser));
router.delete('/:id', authenticate, authorize(['delete_user']), asyncHandler(userController.deleteUser));

// Role assignment
router.post('/assign-role', authenticate, authorize(['manage_user']), asyncHandler(userController.assignRole));
router.post('/remove-role', authenticate, authorize(['manage_user']), asyncHandler(userController.removeRole));

module.exports = router;