// services/moduleManager.service.js
const mongoose = require('mongoose');
const Module = require('../models/module.model');
const TenantModule = require('../models/tenantModule.model');
const DbConnectionManager = require('./dbConnectionManager');
const UsageTrackingService = require('./usageTracking.service');
const fs = require('fs').promises;
const path = require('path');
const { backup, restore } = require('../utils/dbBackup');

class ModuleManagerService {
  /**
   * Get all available modules
   */
  async getAllModules() {
    return Module.find({});
  }
  
  /**
   * Get modules activated for a specific tenant
   * @param {string} tenantId - The tenant ID
   */
  async getTenantModules(tenantId) {
    return TenantModule.find({ tenantId, isActive: true })
      .populate('moduleId')
      .lean();
  }

  /**
   * Activate a module for a tenant
   * @param {string} tenantId - The tenant ID
   * @param {string} moduleId - The module ID
   * @param {object} quotaLimits - The usage quota limits
   */
  async activateModule(tenantId, moduleId, quotaLimits = {}) {
    // Get module definition
    const module = await Module.findById(moduleId);
    if (!module) {
      throw new Error('Module not found');
    }
    
    // Check if dependencies are activated
    if (module.dependencies && module.dependencies.length > 0) {
      const dependencyModules = await Module.find({ name: { $in: module.dependencies } });
      const dependencyIds = dependencyModules.map(m => m._id);
      
      const activatedDependencies = await TenantModule.find({
        tenantId,
        moduleId: { $in: dependencyIds },
        isActive: true
      });
      
      if (activatedDependencies.length !== dependencyModules.length) {
        throw new Error('Required module dependencies not activated');
      }
    }
    
    // Check if module is already activated
    const existingModule = await TenantModule.findOne({ tenantId, moduleId });
    if (existingModule && existingModule.isActive) {
      throw new Error('Module already activated for this tenant');
    }
    
    // Get tenant DB connection
    const tenantDb = await DbConnectionManager.getTenantConnection(tenantId);
    if (!tenantDb) {
      throw new Error('Tenant database connection not found');
    }
    
    // Create collections for the module schemas
    for (const schema of module.schemas) {
      try {
        const collectionExists = await tenantDb.db.listCollections({ name: schema.name }).hasNext();
        if (!collectionExists) {
          await tenantDb.db.createCollection(schema.name);
          console.log(`Created collection ${schema.name} for tenant ${tenantId}`);
        }
      } catch (error) {
        console.error(`Error creating collection ${schema.name}:`, error);
        // Continue with activation even if collection creation fails
      }
    }
    
    // If module was previously deactivated, try to restore data
    if (existingModule && existingModule.backupData && existingModule.backupData.backupPath) {
      try {
        await restore(tenantId, existingModule.backupData.backupPath, module.schemas.map(s => s.name));
      } catch (error) {
        console.error('Failed to restore module data:', error);
        // Continue with activation even if restore fails
      }
    }
    
    // Create or update module activation
    if (existingModule) {
      existingModule.isActive = true;
      existingModule.usageQuota = quotaLimits;
      existingModule.activatedAt = new Date();
      existingModule.updatedAt = new Date();
      await existingModule.save();
      return existingModule;
    } else {
      const newModuleActivation = new TenantModule({
        tenantId,
        moduleId,
        isActive: true,
        usageQuota: quotaLimits
      });
      await newModuleActivation.save();
      return newModuleActivation;
    }
  }

  /**
   * Deactivate a module for a tenant
   * @param {string} tenantId - The tenant ID
   * @param {string} moduleId - The module ID
   * @param {boolean} shouldBackup - Whether to backup the data
   */
  async deactivateModule(tenantId, moduleId, shouldBackup = true) {
    // Get module activation record
    const tenantModule = await TenantModule.findOne({ tenantId, moduleId, isActive: true });
    if (!tenantModule) {
      throw new Error('Module not active for this tenant');
    }
    
    // Get module definition
    const module = await Module.findById(moduleId);
    if (!module) {
      throw new Error('Module not found');
    }
    
    // Check if other modules depend on this module
    const dependentModules = await Module.find({ dependencies: module.name });
    if (dependentModules.length > 0) {
      const activeDependents = await TenantModule.find({
        tenantId,
        moduleId: { $in: dependentModules.map(m => m._id) },
        isActive: true
      });
      
      if (activeDependents.length > 0) {
        throw new Error('Cannot deactivate module: other active modules depend on it');
      }
    }
    
    // Backup data if requested
    if (shouldBackup) {
      const backupDir = path.join('backups', tenantId.toString(), moduleId.toString());
      const backupPath = path.join(backupDir, Date.now().toString());
      
      try {
        // Ensure the backup directory exists
        await fs.mkdir(backupDir, { recursive: true });
        
        await backup(tenantId, backupPath, module.schemas.map(s => s.name));
        tenantModule.backupData = {
          lastBackupDate: new Date(),
          backupPath
        };
      } catch (error) {
        console.error('Failed to backup module data:', error);
        // Continue with deactivation even if backup fails
      }
    }
    
    // Deactivate module
    tenantModule.isActive = false;
    tenantModule.updatedAt = new Date();
    await tenantModule.save();
    
    return tenantModule;
  }
  
  /**
   * Update module usage stats
   * @param {string} tenantId - The tenant ID
   * @param {string} moduleId - The module ID
   * @param {string} metric - The metric to update
   * @param {number} value - The new value
   */
  async updateUsageStats(tenantId, moduleId, metric, value) {
    const validMetrics = ['currentCases', 'currentProducts', 'currentHospitals', 'currentDoctors', 'currentUsers'];
    
    if (!validMetrics.includes(metric)) {
      throw new Error('Invalid metric');
    }
    
    const updateObj = {};
    updateObj[`usageStats.${metric}`] = value;
    
    const updated = await TenantModule.findOneAndUpdate(
      { tenantId, moduleId, isActive: true },
      { $set: updateObj, updatedAt: new Date() },
      { new: true }
    );
    
    if (!updated) {
      throw new Error('Module not active for this tenant');
    }
    
    // Check if over quota
    if (updated.usageQuota && updated.usageQuota[metric.replace('current', 'max')] < value) {
      // Log the overage
      await UsageTrackingService.logOverage(tenantId, 'module_quota', {
        moduleId,
        metric,
        value,
        quota: updated.usageQuota[metric.replace('current', 'max')]
      });
    }
    
    return updated;
  }
  
  /**
   * Check if a tenant has access to a specific module
   * @param {string} tenantId - The tenant ID
   * @param {string} moduleName - The module name
   */
  async hasModuleAccess(tenantId, moduleName) {
    const module = await Module.findOne({ name: moduleName });
    if (!module) {
      return false;
    }
    
    const hasAccess = await TenantModule.exists({
      tenantId,
      moduleId: module._id,
      isActive: true
    });
    
    return !!hasAccess;
  }
  
  /**
   * Check if a tenant has exceeded quota for a specific module and metric
   * @param {string} tenantId - The tenant ID
   * @param {string} moduleName - The module name
   * @param {string} metric - The metric to check
   */
  async hasExceededQuota(tenantId, moduleName, metric) {
    const metricMap = {
      'cases': 'currentCases',
      'products': 'currentProducts',
      'hospitals': 'currentHospitals',
      'doctors': 'currentDoctors',
      'users': 'currentUsers'
    };
    
    const quotaMap = {
      'cases': 'maxCases',
      'products': 'maxProducts',
      'hospitals': 'maxHospitals',
      'doctors': 'maxDoctors',
      'users': 'maxUsers'
    };
    
    if (!metricMap[metric]) {
      throw new Error('Invalid metric');
    }
    
    const module = await Module.findOne({ name: moduleName });
    if (!module) {
      return true; // If module doesn't exist, consider quota exceeded
    }
    
    const tenantModule = await TenantModule.findOne({
      tenantId,
      moduleId: module._id,
      isActive: true
    });
    
    if (!tenantModule) {
      return true; // If module not activated, consider quota exceeded
    }
    
    // If no quota set, assume unlimited
    if (!tenantModule.usageQuota || !tenantModule.usageQuota[quotaMap[metric]]) {
      return false;
    }
    
    return tenantModule.usageStats[metricMap[metric]] >= tenantModule.usageQuota[quotaMap[metric]];
  }
  
  /**
   * Update module quota limits
   * @param {string} tenantId - The tenant ID
   * @param {string} moduleId - The module ID
   * @param {object} quotaLimits - The new quota limits
   */
  async updateQuota(tenantId, moduleId, quotaLimits) {
    const tenantModule = await TenantModule.findOne({ tenantId, moduleId });
    
    if (!tenantModule) {
      throw new Error('Module not found for this tenant');
    }
    
    tenantModule.usageQuota = quotaLimits;
    tenantModule.updatedAt = new Date();
    
    await tenantModule.save();
    return tenantModule;
  }
  
  /**
   * Get module usage statistics
   * @param {string} tenantId - The tenant ID
   * @param {string} moduleId - The module ID
   */
  async getModuleUsageStats(tenantId, moduleId) {
    const tenantModule = await TenantModule.findOne({ tenantId, moduleId })
      .populate('moduleId');
    
    if (!tenantModule) {
      throw new Error('Module not found for this tenant');
    }
    
    // Get module definition
    const module = tenantModule.moduleId;
    
    // Format the response
    return {
      module: {
        id: module._id,
        name: module.name,
        displayName: module.displayName,
        version: module.version
      },
      usage: tenantModule.usageStats,
      quota: tenantModule.usageQuota,
      activatedAt: tenantModule.activatedAt,
      lastUpdated: tenantModule.updatedAt
    };
  }
}

module.exports = new ModuleManagerService();