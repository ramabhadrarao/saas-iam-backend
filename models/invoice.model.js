// File: models/invoice.model.js
const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  // Invoice identifiers
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  
  // Relationships
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  
  // Invoice details
  items: [{
    description: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      default: 1
    },
    unitPrice: {
      type: Number,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['subscription', 'usage', 'one_time', 'setup', 'adjustment'],
      default: 'subscription'
    },
    periodStart: Date,
    periodEnd: Date,
    details: mongoose.Schema.Types.Mixed
  }],
  
  // Billing info
  subtotal: {
    type: Number,
    required: true
  },
  discounts: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  taxRate: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  
  // Dates
  issueDate: {
    type: Date,
    required: true
  },
  dueDate: {
    type: Date, 
    required: true
  },
  paidDate: {
    type: Date
  },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'issued', 'paid', 'void', 'uncollectible'],
    default: 'draft'
  },
  
  // Payment info
  paymentIntentId: {
    type: String
  },
  paymentMethod: {
    type: String
  },
  
  // Stripe info
  stripeInvoiceId: {
    type: String
  },
  
  // Billing address
  billingAddress: {
    name: String,
    address1: String,
    address2: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  
  // Notes
  notes: {
    type: String
  },
  
  // Internal use
  attemptCount: {
    type: Number,
    default: 0
  },
  lastAttemptDate: {
    type: Date
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Indexes
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ dueDate: 1 });
invoiceSchema.index({ issueDate: -1 });

// Generate PDF filename
invoiceSchema.virtual('pdfFilename').get(function() {
  return `invoice-${this.invoiceNumber}.pdf`;
});

// Check if invoice is overdue
invoiceSchema.virtual('isOverdue').get(function() {
  if (this.status !== 'issued') return false;
  return new Date() > this.dueDate;
});

// Days overdue
invoiceSchema.virtual('daysOverdue').get(function() {
  if (!this.isOverdue) return 0;
  
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffTime = now - due;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;