// File: models/ticket.model.js
const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  // Basic ticket information
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'pending', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['technical', 'billing', 'account', 'feature_request', 'other'],
    required: true
  },
  
  // Relationships
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Metadata
  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    mimetype: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  tags: [String],
  
  // Activity tracking
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true
    },
    isInternal: {
      type: Boolean,
      default: false
    },
    attachments: [{
      filename: String,
      originalName: String,
      path: String,
      mimetype: String,
      size: Number
    }],
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Time tracking
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: {
    type: Date
  },
  closedAt: {
    type: Date
  },
  
  // SLA tracking
  slaStatus: {
    type: String,
    enum: ['within_sla', 'warning', 'breached', 'not_applicable'],
    default: 'not_applicable'
  },
  slaResponseDeadline: {
    type: Date
  },
  slaResolutionDeadline: {
    type: Date
  },
  firstResponseTime: {
    type: Number // Time in seconds
  }
}, { timestamps: true });

// Indexes for performance
ticketSchema.index({ tenantId: 1, status: 1 });
ticketSchema.index({ assignedTo: 1, status: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ status: 1, priority: 1 });

// Virtual for time since creation
ticketSchema.virtual('ageSinceCreation').get(function() {
  return new Date() - this.createdAt;
});

const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = Ticket;