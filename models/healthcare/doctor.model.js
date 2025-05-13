// models/healthcare/doctor.model.js
const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: String,
  phone: String,
  specialization: String,
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
  },
  location: String,
  committedCases: {
    type: Number,
    default: 0
  },
  remarks: String,
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

// Hospital associations
const doctorHospitalAssociationSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  role: String,
  department: String,
  schedule: String,
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

// Doctor specialties
const doctorSpecialtySchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  specialtyName: {
    type: String,
    required: true
  },
  expertiseLevel: String,
  yearsExperience: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Doctor preferences
const doctorPreferenceSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory'
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  preferenceNotes: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Doctor meetings
const doctorMeetingSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  meetingDate: {
    type: Date,
    required: true
  },
  meetingType: {
    type: String,
    required: true
  },
  location: String,
  discussion: String,
  outcome: String,
  followUpDate: Date,
  followUpAction: String,
  status: {
    type: String,
    default: 'Completed'
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

// Doctor documents
const doctorDocumentSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  documentType: {
    type: String,
    required: true
  },
  documentName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Doctor case history
const doctorCaseHistorySchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  surgeryDate: {
    type: Date,
    required: true
  },
  procedureName: String,
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
  },
  outcome: String,
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update timestamps
doctorSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Doctor = mongoose.model('Doctor', doctorSchema);
const DoctorHospitalAssociation = mongoose.model('DoctorHospitalAssociation', doctorHospitalAssociationSchema);
const DoctorSpecialty = mongoose.model('DoctorSpecialty', doctorSpecialtySchema);
const DoctorPreference = mongoose.model('DoctorPreference', doctorPreferenceSchema);
const DoctorMeeting = mongoose.model('DoctorMeeting', doctorMeetingSchema);
const DoctorDocument = mongoose.model('DoctorDocument', doctorDocumentSchema);
const DoctorCaseHistory = mongoose.model('DoctorCaseHistory', doctorCaseHistorySchema);

module.exports = {
  Doctor,
  DoctorHospitalAssociation,
  DoctorSpecialty,
  DoctorPreference,
  DoctorMeeting,
  DoctorDocument,
  DoctorCaseHistory
};