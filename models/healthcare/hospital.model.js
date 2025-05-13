// models/healthcare/hospital.model.js
const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: String,
  phone: String,
  address: String,
  location: String,
  city: String,
  state: String,
  pincode: String,
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Hospital contacts
const hospitalContactSchema = new mongoose.Schema({
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  contactName: {
    type: String,
    required: true
  },
  designation: String,
  department: String,
  email: String,
  phone: String,
  isPrimary: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Hospital departments
const hospitalDepartmentSchema = new mongoose.Schema({
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  departmentName: {
    type: String,
    required: true
  },
  deptHead: String,
  phone: String,
  email: String,
  locationWithinHospital: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update timestamps
hospitalSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Hospital = mongoose.model('Hospital', hospitalSchema);
const HospitalContact = mongoose.model('HospitalContact', hospitalContactSchema);
const HospitalDepartment = mongoose.model('HospitalDepartment', hospitalDepartmentSchema);

module.exports = {
  Hospital,
  HospitalContact,
  HospitalDepartment
};