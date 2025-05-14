// controllers/healthcare/hospital.controller.js
const hospitalService = require('../../services/healthcare/hospitalService');
const { validationResult } = require('express-validator');

class HospitalController {
  /**
   * Create a new hospital
   */
  async createHospital(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const hospital = await hospitalService.createHospital(
        req.body,
        req.tenantId,
        req.user.id
      );
      
      res.status(201).json({ success: true, data: hospital });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get hospital by ID
   */
  async getHospital(req, res, next) {
    try {
      const hospital = await hospitalService.getHospitalById(req.params.id);
      
      if (!hospital) {
        return res.status(404).json({ message: 'Hospital not found' });
      }
      
      res.json({ success: true, data: hospital });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get all hospitals with pagination and filtering
   */
  async getHospitals(req, res, next) {
    try {
      const { page = 1, limit = 10, name, city, state, isActive } = req.query;
      
      // Build filters
      const filters = {};
      if (name) {
        filters.name = { $regex: name, $options: 'i' };
      }
      if (city) {
        filters.city = { $regex: city, $options: 'i' };
      }
      if (state) {
        filters.state = { $regex: state, $options: 'i' };
      }
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }
      
      const result = await hospitalService.getHospitals(
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
   * Update a hospital
   */
  async updateHospital(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const hospital = await hospitalService.updateHospital(
        req.params.id,
        req.body
      );
      
      res.json({ success: true, data: hospital });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete a hospital
   */
  async deleteHospital(req, res, next) {
    try {
      await hospitalService.deleteHospital(req.params.id, req.tenantId);
      res.json({ success: true, message: 'Hospital deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Add contact to hospital
   */
  async addContact(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const contact = await hospitalService.addContact(
        req.params.id,
        req.body
      );
      
      res.status(201).json({ success: true, data: contact });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update contact
   */
  async updateContact(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const contact = await hospitalService.updateContact(
        req.params.id,
        req.params.contactId,
        req.body
      );
      
      res.json({ success: true, data: contact });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete contact
   */
  async deleteContact(req, res, next) {
    try {
      await hospitalService.deleteContact(
        req.params.id,
        req.params.contactId
      );
      
      res.json({ success: true, message: 'Contact deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Add department to hospital
   */
  async addDepartment(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const department = await hospitalService.addDepartment(
        req.params.id,
        req.body
      );
      
      res.status(201).json({ success: true, data: department });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update department
   */
  async updateDepartment(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const department = await hospitalService.updateDepartment(
        req.params.id,
        req.params.departmentId,
        req.body
      );
      
      res.json({ success: true, data: department });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete department
   */
  async deleteDepartment(req, res, next) {
    try {
      await hospitalService.deleteDepartment(
        req.params.id,
        req.params.departmentId
      );
      
      res.json({ success: true, message: 'Department deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get hospital statistics
   */
  async getHospitalStatistics(req, res, next) {
    try {
      const stats = await hospitalService.getHospitalStatistics();
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new HospitalController();