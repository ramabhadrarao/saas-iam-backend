// File: models/subscription.model.js
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  // Tenant relationship
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  
  // Subscription details
  plan: {
    type: String,
    enum: ['free', 'starter', 'professional', 'enterprise', 'custom'],
    required: true
  },
  
  // Billing cycle
  billingCycle: {
    type: String,
    enum: ['monthly', 'annual', 'custom'],
    default: 'monthly'
  },
  
  // Pricing details
  basePrice: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  
  // Stripe information
  stripeCustomerId: {
    type: String
  },
  stripeSubscriptionId: {
    type: String
  },
  
  // Date tracking
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date
  },
  trialEndDate: {
    type: Date
  },
  canceledAt: {
    type: Date
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'past_due', 'canceled', 'trialing', 'unpaid', 'incomplete'],
    default: 'active'
  },
  
  // Auto-renewal
  autoRenew: {
    type: Boolean,
    default: true
  },
  
  // Additional data
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'bank_transfer', 'paypal', 'manual', 'none'],
    default: 'none'
  },
  
  // Custom plan details
  customPlan: {
    userLimit: Number,
    storageLimit: Number, // in GB
    apiCallsLimit: Number,
    additionalFeatures: [String],
    notes: String
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

// Index for efficient lookups
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ endDate: 1 });

// Virtual for price calculation
subscriptionSchema.virtual('totalPrice').get(function() {
  return this.basePrice - this.discount;
});

// Methods
subscriptionSchema.methods.isActive = function() {
  return ['active', 'trialing'].includes(this.status);
};

subscriptionSchema.methods.isTrialing = function() {
  return this.status === 'trialing';
};

subscriptionSchema.methods.daysTillExpiration = function() {
  if (!this.endDate) return null;
  
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// For calculating proration when upgrading/downgrading
subscriptionSchema.methods.calculateProration = function(newPlanPrice) {
  // If no end date, no proration
  if (!this.endDate) return 0;
  
  const now = new Date();
  const end = new Date(this.endDate);
  
  // If already expired, no proration
  if (now > end) return 0;
  
  // Calculate days remaining in current subscription
  const totalDays = Math.ceil((end - this.startDate) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  
  // Calculate daily rate for current subscription
  const currentDailyRate = this.totalPrice / totalDays;
  
  // Calculate remaining value of current subscription
  const remainingValue = currentDailyRate * daysRemaining;
  
  // Calculate daily rate for new plan
  const newDailyRate = newPlanPrice / totalDays;
  
  // Calculate cost of new plan for remaining days
  const newPlanCost = newDailyRate * daysRemaining;
  
  // Calculate proration amount (positive means credit, negative means charge)
  return remainingValue - newPlanCost;
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;