// File: backend/utils/listTenantDatabases.js
require('dotenv').config();
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

/**
 * Script to list all tenant databases
 * This is useful for administrative purposes
 */
async function listTenantDatabases() {
  try {
    // Extract MongoDB URI parts
    const baseUri = process.env.MONGODB_URI;
    const dbNameIndex = baseUri.lastIndexOf('/');
    
    if (dbNameIndex === -1) {
      console.error('Invalid MongoDB URI format');
      process.exit(1);
    }
    
    const mongoUri = baseUri.substring(0, dbNameIndex);
    
    // Connect to MongoDB
    const client = new MongoClient(mongoUri);
    await client.connect();
    
    console.log('Connected to MongoDB server');
    
    // Get list of all databases
    const databasesList = await client.db().admin().listDatabases();
    
    // Filter tenant databases
    const tenantDbs = databasesList.databases.filter(db => 
      db.name.startsWith('tenant_')
    );
    
    console.log(`\nFound ${tenantDbs.length} tenant databases:`);
    console.log('------------------------------------');
    
    for (const db of tenantDbs) {
      const dbName = db.name;
      const subdomain = dbName.replace('tenant_', '');
      
      // Connect to the tenant database to get more info
      const tenantDb = client.db(dbName);
      
      // Try to get tenant settings
      let tenantInfo = { name: 'Unknown', subdomain };
      try {
        const settingsCollection = tenantDb.collection('settings');
        const tenantInfoSetting = await settingsCollection.findOne({ key: 'tenant_info' });
        
        if (tenantInfoSetting && tenantInfoSetting.value) {
          tenantInfo = tenantInfoSetting.value;
        }
      } catch (error) {
        console.error(`Error getting tenant info for ${dbName}:`, error.message);
      }
      
      // Get number of users
      let userCount = 0;
      try {
        const usersCollection = tenantDb.collection('users');
        userCount = await usersCollection.countDocuments();
      } catch (error) {
        console.error(`Error getting user count for ${dbName}:`, error.message);
      }
      
      // Get database size info
      const stats = await tenantDb.stats();
      const sizeInMB = Math.round(stats.storageSize / (1024 * 1024) * 100) / 100;
      
      console.log(`Name: ${tenantInfo.name}`);
      console.log(`Subdomain: ${subdomain}`);
      console.log(`Plan: ${tenantInfo.plan || 'Unknown'}`);
      console.log(`Database: ${dbName}`);
      console.log(`Size: ${sizeInMB} MB`);
      console.log(`Users: ${userCount}`);
      console.log('------------------------------------');
    }
    
    await client.close();
    console.log('MongoDB connection closed');
    
  } catch (error) {
    console.error('Error listing tenant databases:', error);
  }
}

// Run if called directly
if (require.main === module) {
  listTenantDatabases()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = listTenantDatabases;