// services/healthcare/doctorService.js
const { 
  Doctor, 
  DoctorHospitalAssociation, 
  DoctorSpecialty, 
  DoctorPreference,
  DoctorMeeting,
  DoctorDocument,
  DoctorCaseHistory
} = require('../../models/healthcare/doctor.model');
const ModuleManagerService = require('../moduleManager.service');
const mongoose = require('mongoose');

class DoctorService {
  /**
   * Create a new doctor
   * @param {object} doctorData - Doctor data
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID creating the doctor
   */
  async createDoctor(doctorData, tenantId, userId) {
    // Check if tenant has exceeded doctor quota
    const hasExceeded = await ModuleManagerService.hasExceededQuota(tenantId, 'healthcare', 'doctors');
    if (hasExceeded) {
      throw new Error('Doctor quota exceeded for this tenant');
    }
    
    // Create doctor record
    const doctor = new Doctor({
      ...doctorData,
      createdBy: userId
    });
    
    await doctor.save();
    
    // Update usage stats
    await this.updateDoctorCount(tenantId);
    
    return doctor;
  }
  
  /**
   * Get doctor by ID
   * @param {string} doctorId - Doctor ID
   */
  async getDoctorById(doctorId) {
    return Doctor.findById(doctorId);
  }
  
  /**
   * Get all doctors for a tenant with pagination
   * @param {object} filters - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   */
  async getDoctors(filters = {}, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const query = { ...filters };
    
    const total = await Doctor.countDocuments(query);
    const doctors = await Doctor.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    return {
      doctors,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }
  
  /**
   * Update a doctor
   * @param {string} doctorId - Doctor ID
   * @param {object} updateData - Update data
   */
  async updateDoctor(doctorId, updateData) {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }
    
    Object.assign(doctor, updateData);
    return doctor.save();
  }
  
  /**
   * Delete a doctor
   * @param {string} doctorId - Doctor ID
   * @param {string} tenantId - Tenant ID
   */
  async deleteDoctor(doctorId, tenantId) {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }
    
    // Check if doctor has any associated cases
    const caseCount = await DoctorCaseHistory.countDocuments({ doctorId });
    if (caseCount > 0) {
      // Instead of deleting, mark as inactive
      doctor.isActive = false;
      await doctor.save();
    } else {
      // Delete doctor and related records
      await Doctor.deleteOne({ _id: doctorId });
      await DoctorHospitalAssociation.deleteMany({ doctorId });
      await DoctorSpecialty.deleteMany({ doctorId });
      await DoctorPreference.deleteMany({ doctorId });
      await DoctorMeeting.deleteMany({ doctorId });
      await DoctorDocument.deleteMany({ doctorId });
      await DoctorCaseHistory.deleteMany({ doctorId });
    }
    
    // Update usage stats
    await this.updateDoctorCount(tenantId);
    
    return { success: true };
  }
  
  /**
   * Add hospital association to doctor
   * @param {string} doctorId - Doctor ID
   * @param {object} associationData - Hospital association data
   */
  async addHospitalAssociation(doctorId, associationData) {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }
    
    const association = new DoctorHospitalAssociation({
      doctorId,
      ...associationData
    });
    
    await association.save();
    
    // If this is a primary association, update the doctor's primary hospital
    if (association.isPrimary) {
      // Set all other associations to non-primary
      await DoctorHospitalAssociation.updateMany(
        { doctorId, _id: { $ne: association._id } },
        { $set: { isPrimary: false } }
      );
      
      // Update doctor record
      doctor.hospitalId = association.hospitalId;
      await doctor.save();
    }
    
    return association;
  }
  
  /**
   * Add specialty to doctor
   * @param {string} doctorId - Doctor ID
   * @param {object} specialtyData - Specialty data
   */
  async addSpecialty(doctorId, specialtyData) {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }
    
    const specialty = new DoctorSpecialty({
      doctorId,
      ...specialtyData
    });
    
    return specialty.save();
  }
  
  /**
   * Add meeting with doctor
   * @param {string} doctorId - Doctor ID
   * @param {object} meetingData - Meeting data
   * @param {string} userId - User ID creating the meeting
   */
  async addMeeting(doctorId, meetingData, userId) {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }
    
    const meeting = new DoctorMeeting({
      doctorId,
      userId,
      ...meetingData
    });
    
    return meeting.save();
  }
  
  /**
   * Upload document for doctor
   * @param {string} doctorId - Doctor ID
   * @param {object} documentData - Document metadata
   * @param {string} userId - User ID uploading the document
   */
  async uploadDocument(doctorId, documentData, userId) {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }
    
    const document = new DoctorDocument({
      doctorId,
      uploadedBy: userId,
      ...documentData
    });
    
    return document.save();
  }
  
  /**
   * Get upcoming follow-ups with doctors
   * @param {Date} startDate - Start date for follow-ups
   * @param {Date} endDate - End date for follow-ups
   * @param {string} userId - Optional user ID to filter by
   */
  async getUpcomingFollowUps(startDate = new Date(), endDate = null, userId = null) {
    const query = {
      followUpDate: { $gte: startDate }
    };
    
    if (endDate) {
      query.followUpDate.$lte = endDate;
    }
    
    if (userId) {
      query.userId = userId;
    }
    
    return DoctorMeeting.find(query)
      .populate('doctorId', 'name specialization')
      .populate('userId', 'firstName lastName')
      .sort({ followUpDate: 1 });
  }
  
  /**
   * Get doctor statistics summary
   */
  async getDoctorStatistics() {
    const pipeline = [
      {
        $group: {
          _id: null,
          totalDoctors: { $sum: 1 },
          activeDoctors: { 
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } 
          }
        }
      }
    ];
    
    const result = await Doctor.aggregate(pipeline);
    return result[0] || { totalDoctors: 0, activeDoctors: 0 };
  }
  
  /**
   * Get doctor case history
   * @param {string} doctorId - Doctor ID
   */
  async getDoctorCaseHistory(doctorId) {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }
    
    return DoctorCaseHistory.find({ doctorId })
      .populate('caseId')
      .populate('hospitalId', 'name')
      .sort({ surgeryDate: -1 });
  }
  
  /**
   * Update the doctor count for a tenant
   * @param {string} tenantId - Tenant ID
   */
  async updateDoctorCount(tenantId) {
    try {
      // Get module ID for healthcare
      const Module = mongoose.model('Module');
      const moduleId = await Module.findOne({ name: 'healthcare' }, '_id');
      
      if (!moduleId) {
        console.error('Healthcare module not found');
        return;
      }
      
      // Count active doctors
      const count = await Doctor.countDocuments({ isActive: true });
      
      // Update module usage stats
      await ModuleManagerService.updateUsageStats(tenantId, moduleId._id, 'currentDoctors', count);
      
      console.log(`Updated doctor count for tenant ${tenantId}: ${count}`);
    } catch (error) {
      console.error('Error updating doctor count:', error);
    }
  }
}

module.exports = new DoctorService();