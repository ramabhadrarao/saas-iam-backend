// models/healthcare/category.model.js
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
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
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Subcategories
const subcategorySchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  name: {
    type: String,
    required: true
  },
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
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Category applications
const categoryApplicationSchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory'
  },
  applicationName: {
    type: String,
    required: true
  },
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

// Category-product relationship
const categoryProductSchema = new mongoose.Schema({
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
    ref: 'Product',
    required: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  displayOrder: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Category specifications
const categorySpecificationSchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory'
  },
  specName: {
    type: String,
    required: true
  },
  specType: {
    type: String,
    required: true,
    enum: ['text', 'number', 'boolean', 'enum']
  },
  specUnit: String,
  specOptions: String,  // For enum types, comma-separated options
  isRequired: {
    type: Boolean,
    default: false
  },
  displayOrder: Number,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Category procedures
const categoryProcedureSchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory'
  },
  procedureName: {
    type: String,
    required: true
  },
  description: String,
  estimatedDurationMinutes: Number,
  complexityLevel: String,
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
categorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

subcategorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Define a middleware to handle category deactivation
categorySchema.post('save', async function(doc) {
  if (doc.isActive === false) {
    // Deactivate all subcategories if category is deactivated
    await Subcategory.updateMany(
      { categoryId: doc._id, isActive: true },
      { isActive: false, updatedAt: new Date() }
    );
  }
});

const Category = mongoose.model('Category', categorySchema);
const Subcategory = mongoose.model('Subcategory', subcategorySchema);
const CategoryApplication = mongoose.model('CategoryApplication', categoryApplicationSchema);
const CategoryProduct = mongoose.model('CategoryProduct', categoryProductSchema);
const CategorySpecification = mongoose.model('CategorySpecification', categorySpecificationSchema);
const CategoryProcedure = mongoose.model('CategoryProcedure', categoryProcedureSchema);

module.exports = {
  Category,
  Subcategory,
  CategoryApplication,
  CategoryProduct,
  CategorySpecification,
  CategoryProcedure
};