// File: models/ticketSettings.model.js
const mongoose = require('mongoose');

const ticketSettingsSchema = new mongoose.Schema({
  // Which tenant these settings apply to (null for global settings)
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true
  },
  
  // SLA configuration
  slaLevels: [{
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true
    },
    responseTime: {
      type: Number, // Time in minutes
      required: true
    },
    resolutionTime: {
      type: Number, // Time in minutes
      required: true
    }
  }],
  
  // Auto-assignment rules
  autoAssignmentRules: {
    enabled: {
      type: Boolean,
      default: false
    },
    assignmentStrategy: {
      type: String,
      enum: ['round_robin', 'load_balanced', 'skills_based', 'none'],
      default: 'none'
    },
    defaultAssignees: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  
  // Category configuration
  categories: [{
    name: String,
    description: String,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Email notification settings
  notificationSettings: {
    notifyOnTicketCreation: {
      type: Boolean,
      default: true
    },
    notifyOnTicketAssignment: {
      type: Boolean,
      default: true
    },
    notifyOnTicketComment: {
      type: Boolean, 
      default: true
    },
    notifyOnStatusChange: {
      type: Boolean,
      default: true
    },
    notifyOnSlaWarning: {
      type: Boolean,
      default: true
    }
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

const TicketSettings = mongoose.model('TicketSettings', ticketSettingsSchema);

module.exports = TicketSettings;