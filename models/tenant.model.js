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

// Add virtual for full domain
tenantSchema.virtual('domain').get(function() {
  return `${this.subdomain}.example.com`;
});

// Index for faster lookup
tenantSchema.index({ subdomain: 1 });

const Tenant = mongoose.model('Tenant', tenantSchema);

module.exports = Tenant;