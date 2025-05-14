// services/healthcare/caseService.js
const { 
  Case, 
  CaseProduct 
} = require('../../models/healthcare/medicalCase.model');
const ModuleManagerService = require('../moduleManager.service');
const mongoose = require('mongoose');

class CaseService {
  /**
   * Create a new medical case
   * @param {object} caseData - Case data
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID creating the case
   */
  async createCase(caseData, tenantId, userId) {
    // Check if tenant has exceeded case quota
    const hasExceeded = await ModuleManagerService.hasExceededQuota(tenantId, 'healthcare', 'cases');
    if (hasExceeded) {
      throw new Error('Case quota exceeded for this tenant');
    }
    
    // Create case record
    const medicalCase = new Case({
      ...caseData,
      createdBy: userId
    });
    
    await medicalCase.save();
    
    // Update usage stats
    await this.updateCaseCount(tenantId);
    
    return medicalCase;
  }
  
  /**
   * Get case by ID
   * @param {string} caseId - Case ID
   */
  async getCaseById(caseId) {
    return Case.findById(caseId)
      .populate('doctorId', 'name email specialization')
      .populate('hospitalId', 'name address');
  }
  
  /**
   * Get all cases for a tenant with pagination
   * @param {object} filters - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   */
  async getCases(filters = {}, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const query = { ...filters };
    
    const total = await Case.countDocuments(query);
    const cases = await Case.find(query)
      .populate('doctorId', 'name')
      .populate('hospitalId', 'name')
      .populate('principleId', 'name')
      .skip(skip)
      .limit(limit)
      .sort({ surgeryDate: -1 });
    
    return {
      cases,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }
  
  /**
   * Update a case
   * @param {string} caseId - Case ID
   * @param {object} updateData - Update data
   */
  async updateCase(caseId, updateData) {
    const medicalCase = await Case.findById(caseId);
    if (!medicalCase) {
      throw new Error('Case not found');
    }
    
    Object.assign(medicalCase, updateData);
    return medicalCase.save();
  }
  
  /**
   * Delete a case
   * @param {string} caseId - Case ID
   * @param {string} tenantId - Tenant ID
   */
  async deleteCase(caseId, tenantId) {
    const medicalCase = await Case.findById(caseId);
    if (!medicalCase) {
      throw new Error('Case not found');
    }
    
    // Delete case and related products
    await Case.deleteOne({ _id: caseId });
    await CaseProduct.deleteMany({ caseId });
    
    // Update usage stats
    await this.updateCaseCount(tenantId);
    
    return { success: true };
  }
  
  /**
   * Add product to case
   * @param {string} caseId - Case ID
   * @param {object} productData - Product data
   */
  async addProductToCase(caseId, productData) {
    const medicalCase = await Case.findById(caseId);
    if (!medicalCase) {
      throw new Error('Case not found');
    }
    
    const caseProduct = new CaseProduct({
      caseId,
      ...productData
    });
    
    await caseProduct.save();
    return caseProduct;
  }
  
  /**
   * Update a product in a case
   * @param {string} caseId - Case ID
   * @param {string} productId - Case product ID
   * @param {object} updateData - Update data
   */
  async updateCaseProduct(caseId, productId, updateData) {
    const caseProduct = await CaseProduct.findOne({
      _id: productId,
      caseId
    });
    
    if (!caseProduct) {
      throw new Error('Product not found in case');
    }
    
    Object.assign(caseProduct, updateData);
    await caseProduct.save();
    return caseProduct;
  }
  
  /**
   * Delete a product from a case
   * @param {string} caseId - Case ID
   * @param {string} productId - Case product ID
   */
  async deleteCaseProduct(caseId, productId) {
    const caseProduct = await CaseProduct.findOne({
      _id: productId,
      caseId
    });
    
    if (!caseProduct) {
      throw new Error('Product not found in case');
    }
    
    await CaseProduct.deleteOne({ _id: productId });
    return { success: true };
  }
  
  /**
   * Update case status
   * @param {string} caseId - Case ID
   * @param {string} status - New status
   */
  async updateCaseStatus(caseId, status) {
    const validStatuses = ['Active', 'Pending', 'Completed', 'Cancelled'];
    
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status');
    }
    
    const medicalCase = await Case.findById(caseId);
    if (!medicalCase) {
      throw new Error('Case not found');
    }
    
    medicalCase.status = status;
    await medicalCase.save();
    
    return medicalCase;
  }
  
  /**
   * Get cases by doctor
   * @param {string} doctorId - Doctor ID
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   */
  async getCasesByDoctor(doctorId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const query = { doctorId };
    
    const total = await Case.countDocuments(query);
    const cases = await Case.find(query)
      .populate('hospitalId', 'name')
      .populate('principleId', 'name')
      .skip(skip)
      .limit(limit)
      .sort({ surgeryDate: -1 });
    
    return {
      cases,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }
  
  /**
   * Get cases by hospital
   * @param {string} hospitalId - Hospital ID
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   */
  async getCasesByHospital(hospitalId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const query = { hospitalId };
    
    const total = await Case.countDocuments(query);
    const cases = await Case.find(query)
      .populate('doctorId', 'name')
      .populate('principleId', 'name')
      .skip(skip)
      .limit(limit)
      .sort({ surgeryDate: -1 });
    
    return {
      cases,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }
  
  /**
   * Get cases by product
   * @param {string} productId - Product ID
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   */
  async getCasesByProduct(productId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    // Find all case products with this product ID
    const caseProducts = await CaseProduct.find({ productId });
    const caseIds = caseProducts.map(cp => cp.caseId);
    
    const query = { _id: { $in: caseIds } };
    
    const total = await Case.countDocuments(query);
    const cases = await Case.find(query)
      .populate('doctorId', 'name')
      .populate('hospitalId', 'name')
      .populate('principleId', 'name')
      .skip(skip)
      .limit(limit)
      .sort({ surgeryDate: -1 });
    
    return {
      cases,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }
  
  /**
   * Update the case count for a tenant
   * @param {string} tenantId - Tenant ID
   */
  async updateCaseCount(tenantId) {
    try {
      // Get module ID for healthcare
      const Module = mongoose.model('Module');
      const moduleId = await Module.findOne({ name: 'healthcare' }, '_id');
      
      if (!moduleId) {
        console.error('Healthcare module not found');
        return;
      }
      
      // Count cases
      const count = await Case.countDocuments({});
      
      // Update module usage stats
      await ModuleManagerService.updateUsageStats(tenantId, moduleId._id, 'currentCases', count);
      
      console.log(`Updated case count for tenant ${tenantId}: ${count}`);
    } catch (error) {
      console.error('Error updating case count:', error);
    }
  }
}

module.exports = new CaseService();