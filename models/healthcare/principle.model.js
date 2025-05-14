// models/healthcare/principle.model.js
const mongoose = require('mongoose');

const principleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  contactPerson: String,
  email: String,
  phone: String,
  address: String,
  website: String,
  gstNumber: String,
  paymentTerms: String,
  creditDays: Number,
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

// Principle contacts
const principleContactSchema = new mongoose.Schema({
  principleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Principle',
    required: true
  },
  name: {
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

// Principle categories
const principleCategorySchema = new mongoose.Schema({
  principleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Principle',
    required: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  terms: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Principle agreements
const principleAgreementSchema = new mongoose.Schema({
  principleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Principle',
    required: true
  },
  agreementType: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: Date,
  terms: String,
  discountPercentage: Number,
  paymentTerms: String,
  status: {
    type: String,
    default: 'Active',
    enum: ['Active', 'Pending', 'Expired', 'Terminated']
  },
  documentPath: String,
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

// Principle visits
const principleVisitSchema = new mongoose.Schema({
  principleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Principle',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  visitDate: {
    type: Date,
    required: true
  },
  visitType: {
    type: String,
    required: true
  },
  location: String,
  contactsMet: String,
  discussion: String,
  outcome: String,
  followUpDate: Date,
  followUpAction: String,
  status: {
    type: String,
    default: 'Completed',
    enum: ['Planned', 'Completed', 'Cancelled', 'Rescheduled']
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

// Principle products
const principleProductSchema = new mongoose.Schema({
  principleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Principle',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  principleProductCode: String,
  principleProductName: String,
  unitCost: Number,
  minimumOrderQuantity: Number,
  leadTimeDays: Number,
  isPreferred: {
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

// Principle documents
const principleDocumentSchema = new mongoose.Schema({
  principleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Principle',
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

// Pre-save middleware to update timestamps
principleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Principle = mongoose.model('Principle', principleSchema);
const PrincipleContact = mongoose.model('PrincipleContact', principleContactSchema);
const PrincipleCategory = mongoose.model('PrincipleCategory', principleCategorySchema);
const PrincipleAgreement = mongoose.model('PrincipleAgreement', principleAgreementSchema);
const PrincipleVisit = mongoose.model('PrincipleVisit', principleVisitSchema);
const PrincipleProduct = mongoose.model('PrincipleProduct', principleProductSchema);
const PrincipleDocument = mongoose.model('PrincipleDocument', principleDocumentSchema);

module.exports = {
  Principle,
  PrincipleContact,
  PrincipleCategory,
  PrincipleAgreement,
  PrincipleVisit,
  PrincipleProduct,
  PrincipleDocument
};