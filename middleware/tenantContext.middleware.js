// File: backend/middleware/tenantContext.middleware.js
const Tenant = require('../models/tenant.model');
const DbConnectionManager = require('../services/dbConnectionManager');
const { AppError } = require('./errorHandler');

/**
 * Middleware to detect and set tenant context from subdomain or path
 */
exports.tenantContext = async (req, res, next) => {
  try {
    let tenantId = null;
    let tenant = null;
    
    // First check if tenant ID is specified in the request
    if (req.query.tenantId) {
      tenantId = req.query.tenantId;
    } else if (req.body.tenantId) {
      tenantId = req.body.tenantId;
    }
    
    // If no tenant ID in request, try to detect from subdomain
    if (!tenantId) {
      const hostname = req.hostname;
      
      // Check if the hostname has a subdomain
      const parts = hostname.split('.');
      if (parts.length > 2) {
        const subdomain = parts[0];
        
        // Skip if this is a common subdomain like www or app
        if (subdomain !== 'www' && subdomain !== 'app') {
          // Try to find tenant by subdomain
          tenant = await Tenant.findOne({ subdomain });
          
          if (tenant) {
            tenantId = tenant._id;
          }
        }
      }
    }
    
    // If no tenant found from subdomain, check for path-based routing
    if (!tenantId && req.path) {
      // Extract tenant from path like /tenant/{subdomain}/...
      const pathParts = req.path.split('/');
      if (pathParts.length >= 3 && pathParts[1] === 'tenant') {
        const subdomain = pathParts[2];
        
        // Find tenant by subdomain
        tenant = await Tenant.findOne({ subdomain });
        
        if (tenant) {
          tenantId = tenant._id;
          
          // Remove tenant prefix from path for further routing
          req.originalUrl = req.originalUrl.replace(`/tenant/${subdomain}`, '');
          req.url = req.url.replace(`/tenant/${subdomain}`, '');
        }
      }
    }
    
    // If a tenant ID is found but tenant object not loaded yet, load it
    if (tenantId && !tenant) {
      tenant = await Tenant.findById(tenantId);
      
      if (!tenant) {
        return next(new AppError('Tenant not found', 404));
      }
    }
    
    // If tenant is found, check if it's active
    if (tenant && !tenant.isActive) {
      return next(new AppError('Tenant is inactive', 403));
    }
    
    // If tenant is found, set tenant context in the request
    if (tenant) {
      // Get connection to tenant database
      const tenantConnection = await DbConnectionManager.getTenantConnection(tenant._id);
      
      // Set tenant context in request
      req.tenantId = tenant._id;
      req.tenant = tenant;
      req.tenantDb = tenantConnection;
      
      // Set tenant header for debugging/monitoring
      res.setHeader('X-Tenant', tenant.subdomain);
    }
    
    next();
  } catch (error) {
    console.error('Tenant context error:', error);
    next(error);
  }
};

/**
 * Middleware to require tenant context
 * Use this middleware for routes that must have a tenant context
 */
exports.requireTenant = (req, res, next) => {
  if (!req.tenantId || !req.tenant || !req.tenantDb) {
    return next(new AppError('Tenant context required', 400));
  }
  next();
};

/**
 * Middleware to prevent tenant context
 * Use this middleware for master-only routes
 */
exports.preventTenant = (req, res, next) => {
  if (req.tenantId || req.tenant) {
    return next(new AppError('This route cannot be accessed with tenant context', 400));
  }
  next();
};