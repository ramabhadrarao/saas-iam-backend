// File: backend/models/user.model.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  userType: {
    type: String,
    enum: ['master_admin', 'tenant_admin', 'tenant_user'],
    required: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    // Make tenantId required only for tenant_admin and tenant_user
    required: function() {
      return this.userType === 'tenant_admin' || this.userType === 'tenant_user';
    },
    // Set to null for master_admin
    default: function() {
      return this.userType === 'master_admin' ? null : undefined;
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
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

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    console.log(`Comparing passwords for user: ${this.email}`);
    console.log(`Stored password hash: ${this.password.substring(0, 10)}...`);
    
    // Use bcrypt.compare to check the password
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    
    console.log(`Password match result: ${isMatch}`);
    return isMatch;
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

const User = mongoose.model('User', userSchema);

module.exports = User;