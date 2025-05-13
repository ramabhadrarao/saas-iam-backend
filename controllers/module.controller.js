// File: backend/controllers/module.controller.js
const Module = require('../models/module.model');
const TenantModule = require('../models/tenantModule.model');
const ModuleManagerService = require('../services/moduleManager.service');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * Get all modules
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getAllModules = async (req, res) => {
  try {
    const modules = await ModuleManagerService.getAllModules();
    
    res.status(200).json({
      modules: modules.map(module => ({
        id: module._id,
        name: module.name,
        displayName: module.displayName,
        description: module.description,
        version: module.version,
        isCore: module.isCore,
        dependencies: module.dependencies
      }))
    });
  } catch (error) {
    console.error('Get all modules error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get modules for a specific tenant
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getTenantModules = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenantModules = await ModuleManagerService.getTenantModules(tenantId);
    
    res.status(200).json({
      modules: tenantModules.map(module => ({
        id: module.moduleId._id,
        name: module.moduleId.name,
        displayName: module.moduleId.displayName,
        description: module.moduleId.description,
        version: module.moduleId.version,
        activatedAt: module.activatedAt,
        usageQuota: module.usageQuota,
        usageStats: module.usageStats
      }))
    });
  } catch (error) {
    console.error('Get tenant modules error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Activate a module for a tenant
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.activateModule = async (req, res) => {
  try {
    const { tenantId, moduleId, quotaLimits } = req.body;
    
    // Activate the module
    const result = await ModuleManagerService.activateModule(tenantId, moduleId, quotaLimits);
    
    // Get module info for logging
    const module = await Module.findById(moduleId);
    
    // Log module activation
    await createAuditLog({
      userId: req.user.id,
      action: 'ACTIVATE',
      module: 'MODULE',
      description: `Activated module ${module.name} for tenant ${tenantId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: `Module ${module.displayName} activated successfully`,
      moduleActivation: {
        tenantId: result.tenantId,
        moduleId: result.moduleId,
        isActive: result.isActive,
        activatedAt: result.activatedAt,
        usageQuota: result.usageQuota
      }
    });
  } catch (error) {
    console.error('Activate module error:', error);
    
    if (error.message === 'Required module dependencies not activated') {
      return res.status(400).json({ 
        message: 'Required module dependencies must be activated first' 
      });
    }
    
    if (error.message === 'Module already activated for this tenant') {
      return res.status(400).json({ 
        message: 'This module is already activated for the tenant' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Deactivate a module for a tenant
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deactivateModule = async (req, res) => {
  try {
    const { tenantId, moduleId, backup = true } = req.body;
    
    // Get module info for logging
    const module = await Module.findById(moduleId);
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }
    
    // Deactivate the module
    const result = await ModuleManagerService.deactivateModule(tenantId, moduleId, backup);
    
    // Log module deactivation
    await createAuditLog({
      userId: req.user.id,
      action: 'DEACTIVATE',
      module: 'MODULE',
      description: `Deactivated module ${module.name} for tenant ${tenantId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: `Module ${module.displayName} deactivated successfully`,
      moduleStatus: {
        tenantId: result.tenantId,
        moduleId: result.moduleId,
        isActive: result.isActive,
        dataBackedUp: backup && !!result.backupData
      }
    });
  } catch (error) {
    console.error('Deactivate module error:', error);
    
    if (error.message === 'Module not active for this tenant') {
      return res.status(400).json({ 
        message: 'This module is not currently active for the tenant' 
      });
    }
    
    if (error.message === 'Cannot deactivate module: other active modules depend on it') {
      return res.status(400).json({ 
        message: 'Cannot deactivate this module because other active modules depend on it' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update module quota limits
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateModuleQuota = async (req, res) => {
  try {
    const { tenantId, moduleId, quotaLimits } = req.body;
    
    // Get module info for logging
    const module = await Module.findById(moduleId);
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }
    
    // Update the module quota
    const result = await ModuleManagerService.updateQuota(tenantId, moduleId, quotaLimits);
    
    // Log quota update
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'MODULE',
      description: `Updated quota limits for module ${module.name} for tenant ${tenantId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: `Module ${module.displayName} quota updated successfully`,
      moduleQuota: {
        tenantId: result.tenantId,
        moduleId: result.moduleId,
        usageQuota: result.usageQuota
      }
    });
  } catch (error) {
    console.error('Update module quota error:', error);
    
    if (error.message === 'Module not found for this tenant') {
      return res.status(404).json({ 
        message: 'Module not found for this tenant' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get module usage statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getModuleUsageStats = async (req, res) => {
  try {
    const { tenantId, moduleId } = req.params;
    
    const stats = await ModuleManagerService.getModuleUsageStats(tenantId, moduleId);
    
    res.status(200).json({ stats });
  } catch (error) {
    console.error('Get module usage stats error:', error);
    
    if (error.message === 'Module not found for this tenant') {
      return res.status(404).json({ 
        message: 'Module not found for this tenant' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = exports;