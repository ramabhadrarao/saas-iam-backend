// models/healthcare/medicalCase.model.js
const mongoose = require('mongoose');

const caseSchema = new mongoose.Schema({
  surgeryDate: {
    type: Date,
    required: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
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
  subcategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory'
  },
  dpValue: {
    type: Number, // Dealer price
    required: true
  },
  sellingPrice: {
    type: Number,
    required: true
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
  },
  status: {
    type: String,
    default: 'Active',
    enum: ['Active', 'Pending', 'Completed', 'Cancelled']
  }
});

// Case products
const caseProductSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true
  },
  dpValue: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    get: function() {
      return this.quantity * this.unitPrice;
    }
  },
  batchNumber: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Case notes
const caseNoteSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  noteText: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Case status history
const caseStatusHistorySchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  previousStatus: String,
  newStatus: {
    type: String,
    required: true
  },
  changedAt: {
    type: Date,
    default: Date.now
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String
});

// Case documents
const caseDocumentSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  documentName: {
    type: String,
    required: true
  },
  documentType: String,
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

// Case followups
const caseFollowupSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  followupDate: {
    type: Date,
    required: true
  },
  description: String,
  status: {
    type: String,
    default: 'Pending',
    enum: ['Pending', 'Completed', 'Cancelled']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  completedAt: Date,
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Pre-save middleware to update timestamps
caseSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Ensure selling price >= dpValue
  if (this.sellingPrice < this.dpValue) {
    return next(new Error('Selling price must be greater than or equal to dealer price'));
  }
  
  next();
});

const Case = mongoose.model('Case', caseSchema);
const CaseProduct = mongoose.model('CaseProduct', caseProductSchema);
const CaseNote = mongoose.model('CaseNote', caseNoteSchema);
const CaseStatusHistory = mongoose.model('CaseStatusHistory', caseStatusHistorySchema);
const CaseDocument = mongoose.model('CaseDocument', caseDocumentSchema);
const CaseFollowup = mongoose.model('CaseFollowup', caseFollowupSchema);

module.exports = {
  Case,
  CaseProduct,
  CaseNote,
  CaseStatusHistory,
  CaseDocument,
  CaseFollowup
};