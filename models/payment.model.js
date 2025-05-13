// File: models/payment.model.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Relationships
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  
  // Payment details
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  
  // Payment information
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'bank_transfer', 'paypal', 'manual', 'other'],
    required: true
  },
  paymentMethodDetails: {
    // Credit card details (last 4 digits, brand, etc.)
    cardBrand: String,
    cardLast4: String,
    cardExpMonth: Number,
    cardExpYear: Number,
    
    // Bank transfer details
    bankName: String,
    accountLast4: String,
    
    // Other payment methods
    paypalEmail: String,
    
    // For internal tracking
    description: String
  },
  
  // Payment gateway information
  gateway: {
    type: String,
    enum: ['stripe', 'paypal', 'manual', 'other'],
    required: true
  },
  gatewayPaymentId: {
    type: String
  },
  gatewayResponse: mongoose.Schema.Types.Mixed,
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'partially_refunded'],
    default: 'pending'
  },
  
  // Reference information
  reference: {
    type: String
  },
  
  // Date information
  paymentDate: {
    type: Date,
    default: Date.now
  },
  
  // Refund information
  refundedAmount: {
    type: Number,
    default: 0
  },
  refunds: [{
    amount: Number,
    date: Date,
    reason: String,
    gatewayRefundId: String
  }],
  
  // Receipt information
  receiptUrl: String,
  receiptNumber: String,
  
  // Fees
  processingFee: {
    type: Number,
    default: 0
  },
  
  // Notes
  notes: String,
  
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
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ status: 1 });

// Virtual for net amount (after fees)
paymentSchema.virtual('netAmount').get(function() {
  return this.amount - this.processingFee;
});

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;