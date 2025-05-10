// File: backend/models/tenant.model.js
const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  subdomain: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  plan: {
    type: String,
    enum: ['free', 'starter', 'professional', 'enterprise'],
    default: 'free'
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  logo: {
    type: String,
    trim: true
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  contactPhone: {
    type: String,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // User limit fields
  userLimit: {
    type: Number,
    default: 5, // Default limit for free plan
    min: 1
  },
  // Override limits (for custom plans)
  overrideLimits: {
    hasCustomLimits: {
      type: Boolean,
      default: false
    },
    userLimit: Number,
    storageLimit: Number,
    apiCallsLimit: Number
  },
  usageMetrics: {
    apiCalls: {
      count: { type: Number, default: 0 },
      totalResponseTime: { type: Number, default: 0 },
      history: [{
        endpoint: String,
        responseTime: Number,
        timestamp: Date
      }]
    },
    storage: {
      bytes: { type: Number, default: 0 }
    },
    lastUpdated: { type: Date, default: Date.now }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Middleware to validate subdomain format
tenantSchema.pre('validate', function(next) {
  if (this.subdomain) {
    // Ensure subdomain follows valid format (alphanumeric, hyphens)
    const subdomainRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if (!subdomainRegex.test(this.subdomain)) {
      this.invalidate('subdomain', 'Subdomain must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.');
    }
  }
  next();
});

// Add method to check if a tenant has reached the user limit
tenantSchema.methods.hasReachedUserLimit = async function() {
  const userCount = await mongoose.model('User').countDocuments({ 
    tenantId: this._id,
    isActive: true
  });
  
  // Get the effective user limit
  let effectiveUserLimit;
  if (this.overrideLimits && this.overrideLimits.hasCustomLimits && this.overrideLimits.userLimit) {
    effectiveUserLimit = this.overrideLimits.userLimit;
  } else {
    // Use the plan-based limits if no custom limits
    const planLimits = {
      free: 5,
      starter: 20,
      professional: 100,
      enterprise: 500
    };
    effectiveUserLimit = planLimits[this.plan] || 5; // Default to free plan limit
  }
  
  return userCount >= effectiveUserLimit;
};

// Add method to get current user count
tenantSchema.methods.getUserCount = async function() {
  return mongoose.model('User').countDocuments({ 
    tenantId: this._id,
    isActive: true
  });
};

// Add method to get effective user limit
tenantSchema.methods.getEffectiveUserLimit = function() {
  if (this.overrideLimits && this.overrideLimits.hasCustomLimits && this.overrideLimits.userLimit) {
    return this.overrideLimits.userLimit;
  }
  
  // Use the plan-based limits if no custom limits
  const planLimits = {
    free: 5,
    starter: 20,
    professional: 100,
    enterprise: 500
  };
  
  return planLimits[this.plan] || 5; // Default to free plan limit
};

// Add virtual for full domain
tenantSchema.virtual('domain').get(function() {
  return `${this.subdomain}.example.com`;
});

// Index for faster lookup
tenantSchema.index({ subdomain: 1 });

const Tenant = mongoose.model('Tenant', tenantSchema);

module.exports = Tenant;