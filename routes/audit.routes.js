// File: backend/routes/audit.routes.js
const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Audit log routes
router.get('/', authenticate, authorize(['read_audit']), asyncHandler(auditController.getAuditLogs));
router.get('/export', authenticate, authorize(['read_audit']), asyncHandler(auditController.exportAuditLogs));

module.exports = router;