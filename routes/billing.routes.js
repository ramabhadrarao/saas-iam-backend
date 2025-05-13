// File: routes/billing.routes.js
const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billing.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Get billing plans
router.get('/plans', 
  authenticate, 
  asyncHandler(billingController.getBillingPlans)
);

// Get tenant subscription information
router.get('/subscriptions/tenant/:tenantId', 
  authenticate, 
  asyncHandler(billingController.getTenantSubscription)
);

// Create a new subscription
router.post('/subscriptions', 
  authenticate, 
  authorize(['create_subscription']), 
  asyncHandler(billingController.createSubscription)
);

// Update a subscription
router.put('/subscriptions/:id', 
  authenticate, 
  authorize(['update_subscription']), 
  asyncHandler(billingController.updateSubscription)
);

// Cancel a subscription
router.post('/subscriptions/:id/cancel', 
  authenticate, 
  authorize(['cancel_subscription']), 
  asyncHandler(billingController.cancelSubscription)
);

// Get invoices with filtering
router.get('/invoices', 
  authenticate, 
  authorize(['read_invoice']), 
  asyncHandler(billingController.getInvoices)
);

// Get a specific invoice
router.get('/invoices/:id', 
  authenticate, 
  authorize(['read_invoice']), 
  asyncHandler(billingController.getInvoiceById)
);

// Generate invoice PDF
router.get('/invoices/:id/pdf', 
  authenticate, 
  authorize(['read_invoice']), 
  asyncHandler(billingController.generateInvoicePdf)
);

// Process a payment
router.post('/payments', 
  authenticate, 
  authorize(['create_payment']), 
  asyncHandler(billingController.processPayment)
);

// Get payment methods for a tenant
router.get('/payment-methods/tenant/:tenantId?', 
  authenticate, 
  authorize(['read_payment_method']), 
  asyncHandler(billingController.getPaymentMethods)
);

// Add a payment method
router.post('/payment-methods', 
  authenticate, 
  authorize(['create_payment_method']), 
  asyncHandler(billingController.addPaymentMethod)
);

// Set default payment method
router.post('/payment-methods/default', 
  authenticate, 
  authorize(['update_payment_method']), 
  asyncHandler(billingController.setDefaultPaymentMethod)
);

// Remove a payment method
router.delete('/payment-methods/:id', 
  authenticate, 
  authorize(['delete_payment_method']), 
  asyncHandler(billingController.removePaymentMethod)
);

// Get billing metrics (admin only)
router.get('/metrics', 
  authenticate, 
  authorize(['read_billing_metrics']), 
  asyncHandler(billingController.getBillingMetrics)
);

module.exports = router;