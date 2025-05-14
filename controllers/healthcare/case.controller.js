// controllers/healthcare/case.controller.js
const caseService = require('../../services/healthcare/caseService');
const { validationResult } = require('express-validator');

class CaseController {
  /**
   * Create a new medical case
   */
  async createCase(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const medicalCase = await caseService.createCase(
        req.body,
        req.tenantId,
        req.user.id
      );
      
      res.status(201).json({ success: true, data: medicalCase });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get case by ID
   */
  async getCase(req, res, next) {
    try {
      const medicalCase = await caseService.getCaseById(req.params.id);
      
      if (!medicalCase) {
        return res.status(404).json({ message: 'Case not found' });
      }
      
      res.json({ success: true, data: medicalCase });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get all cases with pagination and filtering
   */
  async getCases(req, res, next) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        doctorId, 
        hospitalId, 
        principleId,
        status 
      } = req.query;
      
      // Build filters
      const filters = {};
      if (doctorId) {
        filters.doctorId = doctorId;
      }
      if (hospitalId) {
        filters.hospitalId = hospitalId;
      }
      if (principleId) {
        filters.principleId = principleId;
      }
      if (status) {
        filters.status = status;
      }
      
      const result = await caseService.getCases(
        filters,
        parseInt(page, 10),
        parseInt(limit, 10)
      );
      
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update a case
   */
  async updateCase(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const medicalCase = await caseService.updateCase(
        req.params.id,
        req.body
      );
      
      res.json({ success: true, data: medicalCase });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete a case
   */
  async deleteCase(req, res, next) {
    try {
      await caseService.deleteCase(req.params.id, req.tenantId);
      res.json({ success: true, message: 'Case deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Add product to case
   */
  async addProduct(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const product = await caseService.addProductToCase(
        req.params.id,
        req.body
      );
      
      res.status(201).json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update product in case
   */
  async updateProduct(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const product = await caseService.updateCaseProduct(
        req.params.id,
        req.params.productId,
        req.body
      );
      
      res.json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete product from case
   */
  async deleteProduct(req, res, next) {
    try {
      await caseService.deleteCaseProduct(
        req.params.id,
        req.params.productId
      );
      
      res.json({ success: true, message: 'Product removed from case successfully' });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update case status
   */
  async updateStatus(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { status } = req.body;
      
      const medicalCase = await caseService.updateCaseStatus(
        req.params.id,
        status
      );
      
      res.json({ success: true, data: medicalCase });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get cases by doctor
   */
  async getCasesByDoctor(req, res, next) {
    try {
      const { doctorId, page = 1, limit = 10 } = req.query;
      
      if (!doctorId) {
        return res.status(400).json({ message: 'Doctor ID is required' });
      }
      
      const result = await caseService.getCasesByDoctor(
        doctorId,
        parseInt(page, 10),
        parseInt(limit, 10)
      );
      
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get cases by hospital
   */
  async getCasesByHospital(req, res, next) {
    try {
      const { hospitalId, page = 1, limit = 10 } = req.query;
      
      if (!hospitalId) {
        return res.status(400).json({ message: 'Hospital ID is required' });
      }
      
      const result = await caseService.getCasesByHospital(
        hospitalId,
        parseInt(page, 10),
        parseInt(limit, 10)
      );
      
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get cases by product
   */
  async getCasesByProduct(req, res, next) {
    try {
      const { productId, page = 1, limit = 10 } = req.query;
      
      if (!productId) {
        return res.status(400).json({ message: 'Product ID is required' });
      }
      
      const result = await caseService.getCasesByProduct(
        productId,
        parseInt(page, 10),
        parseInt(limit, 10)
      );
      
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CaseController();