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

module.exports = {
  Case,
  CaseProduct
};