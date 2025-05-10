// File: backend/models/userRole.model.js
const mongoose = require('mongoose');

const userRoleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null
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

// Compound index to ensure a user doesn't have the same role twice for a tenant
userRoleSchema.index({ userId: 1, roleId: 1, tenantId: 1 }, { unique: true });

const UserRole = mongoose.model('UserRole', userRoleSchema);

module.exports = UserRole;