// middleware/usageQuota.middleware.js
const ModuleManagerService = require('../services/moduleManager.service');

/**
 * Middleware to check if a tenant has exceeded their quota for a specific module and metric
 * @param {string} moduleName - The module name
 * @param {string} metric - The metric to check
 */
function checkQuota(moduleName, metric) {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId; // Assuming tenant ID is set in previous middleware
      
      if (!tenantId) {
        return res.status(403).json({ message: 'Tenant context not found' });
      }
      
      // Check if module is active for this tenant
      const hasAccess = await ModuleManagerService.hasModuleAccess(tenantId, moduleName);
      if (!hasAccess) {
        return res.status(403).json({ message: `Module '${moduleName}' not activated for this tenant` });
      }
      
      // Check if quota exceeded
      const exceeded = await ModuleManagerService.hasExceededQuota(tenantId, moduleName, metric);
      if (exceeded) {
        return res.status(403).json({ message: `Quota exceeded for '${metric}' in module '${moduleName}'` });
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  checkQuota
};