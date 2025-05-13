// middleware/moduleAccess.middleware.js
const ModuleManagerService = require('../services/moduleManager.service');

/**
 * Middleware to check if a tenant has access to a specific module
 * @param {string} moduleName - The module name
 */
function requireModuleAccess(moduleName) {
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
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requireModuleAccess
};