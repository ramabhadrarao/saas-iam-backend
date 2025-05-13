// controllers/healthcare/doctor.controller.js
const doctorService = require('../../services/healthcare/doctorService');
const { validationResult } = require('express-validator');

class DoctorController {
  /**
   * Create a new doctor
   */
  async createDoctor(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const doctor = await doctorService.createDoctor(
        req.body,
        req.tenantId,
        req.user.id
      );
      
      res.status(201).json({ success: true, data: doctor });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get doctor by ID
   */
  async getDoctor(req, res, next) {
    try {
      const doctor = await doctorService.getDoctorById(req.params.id);
      
      if (!doctor) {
        return res.status(404).json({ message: 'Doctor not found' });
      }
      
      res.json({ success: true, data: doctor });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get all doctors with pagination and filtering
   */
  async getDoctors(req, res, next) {
    try {
      const { page = 1, limit = 10, name, specialization, hospitalId, isActive } = req.query;
      
      // Build filters
      const filters = {};
      if (name) {
        filters.name = { $regex: name, $options: 'i' };
      }
      if (specialization) {
        filters.specialization = { $regex: specialization, $options: 'i' };
      }
      if (hospitalId) {
        filters.hospitalId = hospitalId;
      }
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }
      
      const result = await doctorService.getDoctors(
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
   * Update a doctor
   */
  async updateDoctor(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const doctor = await doctorService.updateDoctor(
        req.params.id,
        req.body
      );
      
      res.json({ success: true, data: doctor });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete a doctor
   */
  async deleteDoctor(req, res, next) {
    try {
      await doctorService.deleteDoctor(req.params.id, req.tenantId);
      res.json({ success: true, message: 'Doctor deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Add hospital association
   */
  async addHospitalAssociation(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const association = await doctorService.addHospitalAssociation(
        req.params.id,
        req.body
      );
      
      res.status(201).json({ success: true, data: association });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Add specialty
   */
  async addSpecialty(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const specialty = await doctorService.addSpecialty(
        req.params.id,
        req.body
      );
      
      res.status(201).json({ success: true, data: specialty });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Add meeting
   */
  async addMeeting(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const meeting = await doctorService.addMeeting(
        req.params.id,
        req.body,
        req.user.id
      );
      
      res.status(201).json({ success: true, data: meeting });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Upload document
   */
  async uploadDocument(req, res, next) {
    try {
      // Assuming file upload middleware has processed the file
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const documentData = {
        documentType: req.body.documentType,
        documentName: req.body.documentName || req.file.originalname,
        filePath: req.file.path
      };
      
      const document = await doctorService.uploadDocument(
        req.params.id,
        documentData,
        req.user.id
      );
      
      res.status(201).json({ success: true, data: document });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get doctor case history
   */
  async getCaseHistory(req, res, next) {
    try {
      const history = await doctorService.getDoctorCaseHistory(req.params.id);
      res.json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get upcoming follow-ups
   */
  async getUpcomingFollowUps(req, res, next) {
    try {
      const { startDate, endDate, userId } = req.query;
      
      const startDateObj = startDate ? new Date(startDate) : new Date();
      const endDateObj = endDate ? new Date(endDate) : null;
      
      const followUps = await doctorService.getUpcomingFollowUps(
        startDateObj,
        endDateObj,
        userId
      );
      
      res.json({ success: true, data: followUps });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get doctor statistics
   */
  async getDoctorStatistics(req, res, next) {
    try {
      const stats = await doctorService.getDoctorStatistics();
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DoctorController();