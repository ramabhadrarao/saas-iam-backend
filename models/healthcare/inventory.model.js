// models/healthcare/inventory.model.js
const mongoose = require('mongoose');

const inventoryPhysicalCountSchema = new mongoose.Schema({
  countDate: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  status: {
    type: String,
    default: 'In Progress',
    enum: ['In Progress', 'Completed', 'Cancelled']
  },
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  completedAt: Date
});

const inventoryCountItemSchema = new mongoose.Schema({
  countId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryPhysicalCount',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  batchNumber: String,
  systemQuantity: {
    type: Number,
    required: true
  },
  actualQuantity: {
    type: Number,
    required: true
  },
  variance: {
    type: Number,
    get: function() {
      return this.actualQuantity - this.systemQuantity;
    }
  },
  varianceReason: String,
  status: {
    type: String,
    default: 'Pending',
    enum: ['Pending', 'Approved', 'Rejected']
  }
});

const inventoryAdjustmentSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  batchNumber: String,
  location: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  adjustmentType: {
    type: String,
    required: true,
    enum: ['Damage', 'Return', 'Missing', 'Expired']
  },
  reason: {
    type: String,
    required: true
  },
  adjustmentDate: {
    type: Date,
    default: Date.now
  },
  adjustedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// System notifications
const systemNotificationSchema = new mongoose.Schema({
  notificationType: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  readAt: Date
});

// Audit log
const auditLogSchema = new mongoose.Schema({
  tableName: {
    type: String,
    required: true
  },
  recordId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  operation: {
    type: String,
    required: true,
    enum: ['INSERT', 'UPDATE', 'DELETE']
  },
  oldData: mongoose.Schema.Types.Mixed,
  newData: mongoose.Schema.Types.Mixed,
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  changedAt: {
    type: Date,
    default: Date.now
  }
});

const InventoryPhysicalCount = mongoose.model('InventoryPhysicalCount', inventoryPhysicalCountSchema);
const InventoryCountItem = mongoose.model('InventoryCountItem', inventoryCountItemSchema);
const InventoryAdjustment = mongoose.model('InventoryAdjustment', inventoryAdjustmentSchema);
const SystemNotification = mongoose.model('SystemNotification', systemNotificationSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = {
  InventoryPhysicalCount,
  InventoryCountItem,
  InventoryAdjustment,
  SystemNotification,
  AuditLog
};