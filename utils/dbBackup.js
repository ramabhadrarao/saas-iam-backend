// utils/dbBackup.js
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const DbConnectionManager = require('../services/dbConnectionManager');

/**
 * Backup collections from a tenant database
 * @param {string} tenantId - Tenant ID
 * @param {string} backupPath - Path to store backup
 * @param {Array} collections - Array of collection names to backup
 */
async function backup(tenantId, backupPath, collections) {
  try {
    // Get tenant connection
    const tenantConnection = await DbConnectionManager.getTenantConnection(tenantId);
    if (!tenantConnection) {
      throw new Error('Tenant database connection not found');
    }
    
    // Create backup directory
    await fs.mkdir(backupPath, { recursive: true });
    
    // Get tenant database name from the connection
    const dbName = tenantConnection.db.databaseName;
    
    // Backup each collection
    for (const collection of collections) {
      try {
        // Create collection output directory
        const collectionPath = path.join(backupPath, collection);
        await fs.mkdir(collectionPath, { recursive: true });
        
        // Export the collection data
        const exportFile = path.join(collectionPath, `${collection}.json`);
        
        // Get the collection data
        const data = await tenantConnection.db.collection(collection).find({}).toArray();
        
        // Write the data to file
        if (data.length > 0) {
          await fs.writeFile(exportFile, JSON.stringify(data, null, 2));
          console.log(`Backed up collection ${collection} to ${exportFile}`);
        } else {
          console.log(`No data to backup for collection ${collection}`);
          // Write empty array to file to indicate collection was processed
          await fs.writeFile(exportFile, JSON.stringify([]));
        }
      } catch (error) {
        console.error(`Error backing up collection ${collection}:`, error);
        // Continue with next collection
      }
    }
    
    return backupPath;
  } catch (error) {
    console.error('Error backing up tenant data:', error);
    throw error;
  }
}

/**
 * Restore collections to a tenant database
 * @param {string} tenantId - Tenant ID
 * @param {string} backupPath - Path to backup
 * @param {Array} collections - Array of collection names to restore
 */
async function restore(tenantId, backupPath, collections) {
  try {
    // Get tenant connection
    const tenantConnection = await DbConnectionManager.getTenantConnection(tenantId);
    if (!tenantConnection) {
      throw new Error('Tenant database connection not found');
    }
    
    // Restore each collection
    for (const collection of collections) {
      try {
        const collectionPath = path.join(backupPath, collection);
        const importFile = path.join(collectionPath, `${collection}.json`);
        
        // Check if backup file exists
        try {
          await fs.access(importFile);
        } catch (err) {
          console.warn(`Backup file not found for collection ${collection}, skipping`);
          continue;
        }
        
        // Read the backup data
        const dataStr = await fs.readFile(importFile, 'utf8');
        const data = JSON.parse(dataStr);
        
        if (data.length > 0) {
          // Drop existing collection to avoid duplicates
          try {
            await tenantConnection.db.collection(collection).drop();
          } catch (err) {
            // Collection might not exist, that's okay
            console.log(`Collection ${collection} doesn't exist yet, creating new`);
          }
          
          // Insert the data
          await tenantConnection.db.collection(collection).insertMany(data);
          console.log(`Restored collection ${collection} from ${importFile}`);
        } else {
          console.log(`No data to restore for collection ${collection}`);
        }
      } catch (error) {
        console.error(`Error restoring collection ${collection}:`, error);
        // Continue with next collection
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error restoring tenant data:', error);
    throw error;
  }
}

module.exports = {
  backup,
  restore
};