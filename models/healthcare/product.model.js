// models/healthcare/product.model.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  principleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Principle',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  productCode: {
    type: String,
    required: true
  },
  batchNumber: String,
  dpValue: {
    type: Number,
    required: true
  },
  mrp: {
    type: Number,
    required: true
  },
  expiryDate: Date,
  quantity: {
    type: Number,
    default: 1
  },
  description: String,
  reorderPoint: Number,
  safetyStock: Number,
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

// Product specifications
const productSpecificationSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  specName: {
    type: String,
    required: true
  },
  specValue: {
    type: String,
    required: true
  },
  specUnit: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Product images
const productImageSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  imagePath: {
    type: String,
    required: true
  },
  imageType: String,
  displayOrder: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Product documents
const productDocumentSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
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

// Product inventory
const productInventorySchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  batchNumber: String,
  location: String,
  quantity: {
    type: Number,
    required: true
  },
  dpValue: Number,
  expiryDate: Date,
  receivedDate: Date,
  status: {
    type: String,
    default: 'Available',
    enum: ['Available', 'Reserved', 'Sold', 'Expired', 'Damaged']
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Product inventory transactions
const productInventoryTransactionSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  transactionType: {
    type: String,
    required: true,
    enum: ['Received', 'Used', 'Transferred', 'Expired', 'Damaged', 'Returned', 'Stock Increase', 'Stock Decrease', 'Initial Stock']
  },
  quantity: {
    type: Number,
    required: true
  },
  transactionDate: {
    type: Date,
    default: Date.now
  },
  referenceId: mongoose.Schema.Types.ObjectId,
  referenceType: String,
  batchNumber: String,
  locationFrom: String,
  locationTo: String,
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Product usage
const productUsageSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  quantity: {
    type: Number,
    default: 1,
    required: true
  },
  batchNumber: String,
  usedDate: {
    type: Date,
    required: true
  },
  dpValue: Number,
  sellingPrice: Number,
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Product alternatives
const productAlternativeSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  alternativeProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  compatibilityLevel: {
    type: String,
    enum: ['Full', 'Partial', 'Emergency Only']
  },
  priceDifference: Number,
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update timestamps and validate
productSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Ensure MRP >= dpValue
  if (this.mrp < this.dpValue) {
    return next(new Error('MRP must be greater than or equal to dealer price'));
  }
  
  next();
});

productSpecificationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Product = mongoose.model('Product', productSchema);
const ProductSpecification = mongoose.model('ProductSpecification', productSpecificationSchema);
const ProductImage = mongoose.model('ProductImage', productImageSchema);
const ProductDocument = mongoose.model('ProductDocument', productDocumentSchema);
const ProductInventory = mongoose.model('ProductInventory', productInventorySchema);
const ProductInventoryTransaction = mongoose.model('ProductInventoryTransaction', productInventoryTransactionSchema);
const ProductUsage = mongoose.model('ProductUsage', productUsageSchema);
const ProductAlternative = mongoose.model('ProductAlternative', productAlternativeSchema);

module.exports = {
  Product,
  ProductSpecification,
  ProductImage,
  ProductDocument,
  ProductInventory,
  ProductInventoryTransaction,
  ProductUsage,
  ProductAlternative
};