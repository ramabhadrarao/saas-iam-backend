// services/healthcare/hospitalService.js
const { 
  Hospital, 
  HospitalContact, 
  HospitalDepartment 
} = require('../../models/healthcare/hospital.model');
const ModuleManagerService = require('../moduleManager.service');
const mongoose = require('mongoose');

class HospitalService {
  /**
   * Create a new hospital
   * @param {object} hospitalData - Hospital data
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID creating the hospital
   */
  async createHospital(hospitalData, tenantId, userId) {
    // Check if tenant has exceeded hospital quota
    const hasExceeded = await ModuleManagerService.hasExceededQuota(tenantId, 'healthcare', 'hospitals');
    if (hasExceeded) {
      throw new Error('Hospital quota exceeded for this tenant');
    }
    
    // Create hospital record
    const hospital = new Hospital({
      ...hospitalData,
      createdBy: userId
    });
    
    await hospital.save();
    
    // Update usage stats
    await this.updateHospitalCount(tenantId);
    
    return hospital;
  }
  
  /**
   * Get hospital by ID
   * @param {string} hospitalId - Hospital ID
   */
  async getHospitalById(hospitalId) {
    return Hospital.findById(hospitalId);
  }
  
  /**
   * Get all hospitals for a tenant with pagination
   * @param {object} filters - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   */
  async getHospitals(filters = {}, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const query = { ...filters };
    
    const total = await Hospital.countDocuments(query);
    const hospitals = await Hospital.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    return {
      hospitals,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }
  
  /**
   * Update a hospital
   * @param {string} hospitalId - Hospital ID
   * @param {object} updateData - Update data
   */
  async updateHospital(hospitalId, updateData) {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      throw new Error('Hospital not found');
    }
    
    Object.assign(hospital, updateData);
    return hospital.save();
  }
  
  /**
   * Delete a hospital
   * @param {string} hospitalId - Hospital ID
   * @param {string} tenantId - Tenant ID
   */
  async deleteHospital(hospitalId, tenantId) {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      throw new Error('Hospital not found');
    }
    
    // Check if hospital has any associated doctors or cases
    // This would require importing the Doctor and Case models
    // For now, we'll just proceed with deletion
    
    // Delete hospital and related records
    await Hospital.deleteOne({ _id: hospitalId });
    await HospitalContact.deleteMany({ hospitalId });
    await HospitalDepartment.deleteMany({ hospitalId });
    
    // Update usage stats
    await this.updateHospitalCount(tenantId);
    
    return { success: true };
  }
  
  /**
   * Add contact to hospital
   * @param {string} hospitalId - Hospital ID
   * @param {object} contactData - Contact data
   */
  async addContact(hospitalId, contactData) {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      throw new Error('Hospital not found');
    }
    
    const contact = new HospitalContact({
      hospitalId,
      ...contactData
    });
    
    await contact.save();
    
    // If this is a primary contact, update all others to non-primary
    if (contact.isPrimary) {
      await HospitalContact.updateMany(
        { hospitalId, _id: { $ne: contact._id } },
        { $set: { isPrimary: false } }
      );
    }
    
    return contact;
  }
  
  /**
   * Update a hospital contact
   * @param {string} hospitalId - Hospital ID
   * @param {string} contactId - Contact ID
   * @param {object} updateData - Update data
   */
  async updateContact(hospitalId, contactId, updateData) {
    const contact = await HospitalContact.findOne({ 
      _id: contactId,
      hospitalId 
    });
    
    if (!contact) {
      throw new Error('Contact not found');
    }
    
    Object.assign(contact, updateData);
    
    // If setting this contact as primary, update all others to non-primary
    if (updateData.isPrimary) {
      await HospitalContact.updateMany(
        { hospitalId, _id: { $ne: contactId } },
        { $set: { isPrimary: false } }
      );
    }
    
    await contact.save();
    return contact;
  }
  
  /**
   * Delete a hospital contact
   * @param {string} hospitalId - Hospital ID
   * @param {string} contactId - Contact ID
   */
  async deleteContact(hospitalId, contactId) {
    const contact = await HospitalContact.findOne({ 
      _id: contactId,
      hospitalId 
    });
    
    if (!contact) {
      throw new Error('Contact not found');
    }
    
    await HospitalContact.deleteOne({ _id: contactId });
    return { success: true };
  }
  
  /**
   * Add department to hospital
   * @param {string} hospitalId - Hospital ID
   * @param {object} departmentData - Department data
   */
  async addDepartment(hospitalId, departmentData) {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      throw new Error('Hospital not found');
    }
    
    const department = new HospitalDepartment({
      hospitalId,
      ...departmentData
    });
    
    await department.save();
    return department;
  }
  
  /**
   * Update a hospital department
   * @param {string} hospitalId - Hospital ID
   * @param {string} departmentId - Department ID
   * @param {object} updateData - Update data
   */
  async updateDepartment(hospitalId, departmentId, updateData) {
    const department = await HospitalDepartment.findOne({ 
      _id: departmentId,
      hospitalId 
    });
    
    if (!department) {
      throw new Error('Department not found');
    }
    
    Object.assign(department, updateData);
    await department.save();
    return department;
  }
  
  /**
   * Delete a hospital department
   * @param {string} hospitalId - Hospital ID
   * @param {string} departmentId - Department ID
   */
  async deleteDepartment(hospitalId, departmentId) {
    const department = await HospitalDepartment.findOne({ 
      _id: departmentId,
      hospitalId 
    });
    
    if (!department) {
      throw new Error('Department not found');
    }
    
    await HospitalDepartment.deleteOne({ _id: departmentId });
    return { success: true };
  }
  
  /**
   * Get hospital statistics summary
   */
  async getHospitalStatistics() {
    const pipeline = [
      {
        $group: {
          _id: null,
          totalHospitals: { $sum: 1 },
          activeHospitals: { 
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } 
          }
        }
      }
    ];
    
    const result = await Hospital.aggregate(pipeline);
    return result[0] || { totalHospitals: 0, activeHospitals: 0 };
  }
  
  /**
   * Update the hospital count for a tenant
   * @param {string} tenantId - Tenant ID
   */
  async updateHospitalCount(tenantId) {
    try {
      // Get module ID for healthcare
      const Module = mongoose.model('Module');
      const moduleId = await Module.findOne({ name: 'healthcare' }, '_id');
      
      if (!moduleId) {
        console.error('Healthcare module not found');
        return;
      }
      
      // Count active hospitals
      const count = await Hospital.countDocuments({ isActive: true });
      
      // Update module usage stats
      await ModuleManagerService.updateUsageStats(tenantId, moduleId._id, 'currentHospitals', count);
      
      console.log(`Updated hospital count for tenant ${tenantId}: ${count}`);
    } catch (error) {
      console.error('Error updating hospital count:', error);
    }
  }
}

module.exports = new HospitalService();