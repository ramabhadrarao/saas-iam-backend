// File: backend/services/dbConnectionManager.js
const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');

// Store tenant connections
const tenantConnections = {};

/**
 * Database Connection Manager Service
 * Handles connections to the master database and tenant-specific databases
 */
class DbConnectionManager {
  /**
   * Initialize master database connection
   * @returns {Promise<mongoose.Connection>} Master database connection
   */
  static async initMasterConnection() {
    try {
      // Connect to the master database
      console.log('Connecting to master database...');
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      console.log('Connected to master database');
      return mongoose.connection;
    } catch (error) {
      console.error('Failed to connect to master database:', error);
      throw new AppError('Database connection error', 500);
    }
  }

  /**
   * Get connection for a specific tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<mongoose.Connection>} Tenant database connection
   */
  static async getTenantConnection(tenantId) {
    try {
      // Check if connection already exists
      if (tenantConnections[tenantId]) {
        return tenantConnections[tenantId];
      }
      
      // Get tenant from master database
      const Tenant = mongoose.model('Tenant');
      const tenant = await Tenant.findById(tenantId);
      
      if (!tenant) {
        throw new AppError('Tenant not found', 404);
      }
      
      if (!tenant.isActive) {
        throw new AppError('Tenant is inactive', 403);
      }
      
      // Create a new connection to the tenant database
      const tenantDbUri = this.getTenantDbUri(tenant.subdomain);
      
      const connection = await mongoose.createConnection(tenantDbUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      // Cache the connection
      tenantConnections[tenantId] = connection;
      
      console.log(`Connected to tenant database: ${tenant.subdomain}`);
      return connection;
    } catch (error) {
      console.error(`Failed to connect to tenant database:`, error);
      throw error instanceof AppError 
        ? error 
        : new AppError('Tenant database connection error', 500);
    }
  }
  
  /**
   * Create a new tenant database
   * @param {Object} tenant - Tenant object
   * @returns {Promise<mongoose.Connection>} New tenant database connection
   */
  static async createTenantDatabase(tenant) {
    try {
      const tenantDbUri = this.getTenantDbUri(tenant.subdomain);
      
      // Create a new connection
      const connection = await mongoose.createConnection(tenantDbUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      // Cache the connection
      tenantConnections[tenant._id] = connection;
      
      console.log(`Created tenant database: ${tenant.subdomain}`);
      return connection;
    } catch (error) {
      console.error(`Failed to create tenant database:`, error);
      throw new AppError('Failed to create tenant database', 500);
    }
  }
  
  /**
   * Remove a tenant connection from cache
   * @param {string} tenantId - Tenant ID
   */
  static removeTenantConnection(tenantId) {
    if (tenantConnections[tenantId]) {
      // Close the connection
      tenantConnections[tenantId].close();
      
      // Remove from cache
      delete tenantConnections[tenantId];
      
      console.log(`Removed tenant connection: ${tenantId}`);
    }
  }
  
  /**
   * Get all active tenant connections
   * @returns {Object} Dictionary of tenant connections
   */
  static getActiveTenantConnections() {
    return tenantConnections;
  }
  
  /**
   * Close all tenant connections
   */
  static async closeAllConnections() {
    console.log('Closing all database connections...');
    
    // Close mongoose default connection
    await mongoose.connection.close();
    
    // Close all tenant connections
    for (const tenantId in tenantConnections) {
      await tenantConnections[tenantId].close();
      delete tenantConnections[tenantId];
    }
    
    console.log('All database connections closed');
  }
  
  /**
   * Get the URI for a tenant database
   * @param {string} subdomain - Tenant subdomain
   * @returns {string} Tenant database URI
   */
  static getTenantDbUri(subdomain) {
    // Extract base URI parts from master connection string
    const baseUri = process.env.MONGODB_URI;
    const dbNameIndex = baseUri.lastIndexOf('/');
    
    if (dbNameIndex === -1) {
      throw new AppError('Invalid master database URI format', 500);
    }
    
    // Replace the database name with tenant-specific name
    const tenantDbName = `tenant_${subdomain}`;
    
    // Construct tenant-specific connection string
    return `${baseUri.substring(0, dbNameIndex + 1)}${tenantDbName}`;
  }


  
}

module.exports = DbConnectionManager;