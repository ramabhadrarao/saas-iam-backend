// File: models/billingPlan.model.js
const mongoose = require('mongoose');

const billingPlanSchema = new mongoose.Schema({
  // Plan identifier
  planId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Plan details
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  
  // Availability
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Pricing tiers
  pricingTiers: [{
    cycle: {
      type: String,
      enum: ['monthly', 'annual', 'custom'],
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    setupFee: {
      type: Number,
      default: 0
    },
    trialDays: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    billingTerm: {
      type: Number, // Number of days (30 for monthly, 365 for annual)
      required: true
    },
    annualDiscount: {
      type: Number,
      default: 0
    },
    stripeProductId: String,
    stripePriceId: String
  }],
  
  // Resource limits
  limits: {
    users: {
      type: Number,
      required: true
    },
    storage: {
      type: Number, // In GB
      required: true
    },
    apiCalls: {
      type: Number, // Per day
      required: true
    }
  },
  
  // Feature flags
  features: [{
    name: {
      type: String,
      required: true
    },
    description: String,
    included: {
      type: Boolean,
      default: true
    },
    limit: Number
  }],
  
  // Upgrade/downgrade rules
  upgradeEligibility: [{
    type: String, // planId values that can upgrade to this plan
  }],
  
  // Display settings
  displayOrder: {
    type: Number,
    default: 1
  },
  highlight: {
    type: Boolean,
    default: false
  },
  badge: String,
  
  // External IDs
  stripeProductId: String,
  
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
billingPlanSchema.index({ isActive: 1, displayOrder: 1 });

// Static method to get available plans
billingPlanSchema.statics.getAvailablePlans = async function() {
  return this.find({ isActive: true }).sort({ displayOrder: 1 });
};

// Get monthly price
billingPlanSchema.methods.getMonthlyPrice = function() {
  const monthlyTier = this.pricingTiers.find(tier => tier.cycle === 'monthly');
  return monthlyTier ? monthlyTier.price : null;
};

// Get annual price
billingPlanSchema.methods.getAnnualPrice = function() {
  const annualTier = this.pricingTiers.find(tier => tier.cycle === 'annual');
  return annualTier ? annualTier.price : null;
};

const BillingPlan = mongoose.model('BillingPlan', billingPlanSchema);

module.exports = BillingPlan;