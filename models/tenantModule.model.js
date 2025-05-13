// models/tenantModule.model.js
const mongoose = require('mongoose');

const tenantModuleSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  usageQuota: {
    maxCases: Number,
    maxProducts: Number,
    maxHospitals: Number,
    maxDoctors: Number,
    maxUsers: Number
  },
  usageStats: {
    currentCases: {
      type: Number,
      default: 0
    },
    currentProducts: {
      type: Number,
      default: 0
    },
    currentHospitals: {
      type: Number,
      default: 0
    },
    currentDoctors: {
      type: Number,
      default: 0
    },
    currentUsers: {
      type: Number,
      default: 0
    }
  },
  settings: {
    type: Object,
    default: {}
  },
  backupData: {
    lastBackupDate: Date,
    backupPath: String
  },
  activatedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound index for tenant and module
tenantModuleSchema.index({ tenantId: 1, moduleId: 1 }, { unique: true });

module.exports = mongoose.model('TenantModule', tenantModuleSchema);