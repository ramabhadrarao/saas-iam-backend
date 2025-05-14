// models/healthcare/department.model.js
const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  parentDepartmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
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

// Department employees
const departmentEmployeeSchema = new mongoose.Schema({
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: String,
  startDate: {
    type: Date,
    required: true
  },
  endDate: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  target: Number,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Department targets
const departmentTargetSchema = new mongoose.Schema({
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  targetType: {
    type: String,
    required: true,
    enum: ['Sales', 'Cases', 'Revenue', 'Profit', 'Doctors', 'Hospitals']
  },
  targetValue: {
    type: Number,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  achievedValue: Number,
  achievementPercentage: {
    type: Number,
    get: function() {
      return this.targetValue > 0 ? ((this.achievedValue || 0) / this.targetValue * 100) : 0;
    }
  },
  notes: String,
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

// Employee targets
const employeeTargetSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  targetType: {
    type: String,
    required: true,
    enum: ['Sales', 'Cases', 'Revenue', 'Profit', 'Doctors', 'Hospitals']
  },
  targetValue: {
    type: Number,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  achievedValue: Number,
  achievementPercentage: {
    type: Number,
    get: function() {
      return this.targetValue > 0 ? ((this.achievedValue || 0) / this.targetValue * 100) : 0;
    }
  },
  notes: String,
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

// Department activities
const departmentActivitySchema = new mongoose.Schema({
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  activityType: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  activityDate: {
    type: Date,
    required: true
  },
  location: String,
  status: {
    type: String,
    default: 'Planned',
    enum: ['Planned', 'In Progress', 'Completed', 'Cancelled']
  },
  outcome: String,
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

// Department territories
const departmentTerritorySchema = new mongoose.Schema({
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  territoryName: {
    type: String,
    required: true
  },
  city: String,
  state: String,
  region: String,
  description: String,
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
  }
});

// Territory hospitals
const territoryHospitalSchema = new mongoose.Schema({
  territoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DepartmentTerritory',
    required: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  assignedEmployeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update timestamps
departmentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

departmentEmployeeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

departmentTargetSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

employeeTargetSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

departmentActivitySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

departmentTerritorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Validate date ranges
const validateDateRange = function(startDate, endDate) {
  return !endDate || startDate <= endDate;
};

departmentTargetSchema.path('startDate').validate(function(value) {
  return validateDateRange(value, this.endDate);
}, 'Start date must be before end date');

employeeTargetSchema.path('startDate').validate(function(value) {
  return validateDateRange(value, this.endDate);
}, 'Start date must be before end date');

const Department = mongoose.model('Department', departmentSchema);
const DepartmentEmployee = mongoose.model('DepartmentEmployee', departmentEmployeeSchema);
const DepartmentTarget = mongoose.model('DepartmentTarget', departmentTargetSchema);
const EmployeeTarget = mongoose.model('EmployeeTarget', employeeTargetSchema);
const DepartmentActivity = mongoose.model('DepartmentActivity', departmentActivitySchema);
const DepartmentTerritory = mongoose.model('DepartmentTerritory', departmentTerritorySchema);
const TerritoryHospital = mongoose.model('TerritoryHospital', territoryHospitalSchema);

module.exports = {
  Department,
  DepartmentEmployee,
  DepartmentTarget,
  EmployeeTarget,
  DepartmentActivity,
  DepartmentTerritory,
  TerritoryHospital
};