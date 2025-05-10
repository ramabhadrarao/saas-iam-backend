// File: backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Auth routes
router.post('/login', asyncHandler(authController.login));
router.post('/refresh-token', asyncHandler(authController.refreshToken));
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.post('/forgot-password', asyncHandler(authController.forgotPassword));
router.post('/reset-password/:token', asyncHandler(authController.resetPassword));

module.exports = router;