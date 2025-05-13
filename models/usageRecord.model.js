// File: models/usageRecord.model.js
const mongoose = require('mongoose');

const usageRecordSchema = new mongoose.Schema({
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
  
  // Time period
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Usage metrics
  metrics: {
    // User accounts
    activeUsers: {
      count: Number,
      limit: Number,
      overageCount: Number
    },
    
    // Storage usage
    storage: {
      usedBytes: Number,
      limitBytes: Number,
      overageBytes: Number
    },
    
    // API calls
    apiCalls: {
      count: Number,
      limit: Number,
      overageCount: Number
    },
    
    // Any additional usage metrics
    additionalMetrics: mongoose.Schema.Types.Mixed
  },
  
  // Billing status
  billingStatus: {
    type: String,
    enum: ['pending', 'billed', 'no_charge'],
    default: 'pending'
  },
  
  // Invoice reference (if billed)
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
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
usageRecordSchema.index({ startDate: 1, endDate: 1 });
usageRecordSchema.index({ billingStatus: 1 });

// Virtual for checking if usage exceeds limits
usageRecordSchema.virtual('hasOverages').get(function() {
  const metrics = this.metrics;
  
  // Check user overage
  if (metrics.activeUsers && metrics.activeUsers.overageCount > 0) {
    return true;
  }
  
  // Check storage overage
  if (metrics.storage && metrics.storage.overageBytes > 0) {
    return true;
  }
  
  // Check API calls overage
  if (metrics.apiCalls && metrics.apiCalls.overageCount > 0) {
    return true;
  }
  
  return false;
});

const UsageRecord = mongoose.model('UsageRecord', usageRecordSchema);

module.exports = UsageRecord;