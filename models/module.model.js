// models/module.model.js
const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  displayName: {
    type: String,
    required: true
  },
  description: String,
  version: String,
  isCore: {
    type: Boolean,
    default: false
  },
  dependencies: [{
    type: String,
    ref: 'Module'
  }],
  requiredPermissions: [{
    type: String
  }],
  defaultRoles: [{
    type: String
  }],
  defaultMenuItems: [{
    title: String,
    route: String,
    icon: String,
    permissions: [String],
    subItems: [{
      title: String,
      route: String,
      permissions: [String]
    }]
  }],
  schemas: [{
    name: String,
    fields: Object
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Module', moduleSchema);