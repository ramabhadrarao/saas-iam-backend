// File: backend/utils/tenantMigrationTool.js
require('dotenv').config();
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const Tenant = require('../models/tenant.model');
const DbConnectionManager = require('../services/dbConnectionManager');
const TenantDbInitializer = require('../services/tenantDbInitializer');

/**
 * Tenant Migration Tool
 * 
 * This utility helps with migrating existing tenants from a shared database
 * to individual tenant databases.
 */
class TenantMigrationTool {
  /**
   * Migrate all tenants to separate databases
   */
  static async migrateAllTenants() {
    try {
      // Connect to master database
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      console.log('Connected to master database');
      
      // Get all active tenants
      const tenants = await Tenant.find({ isActive: true });
      
      console.log(`Found ${tenants.length} active tenants to migrate`);
      
      // Migrate each tenant
      for (const tenant of tenants) {
        try {
          console.log(`\nMigrating tenant: ${tenant.name} (${tenant.subdomain})`);
          await this.migrateTenant(tenant);
          console.log(`Successfully migrated tenant: ${tenant.subdomain}`);
        } catch (error) {
          console.error(`Error migrating tenant ${tenant.subdomain}:`, error);
        }
      }
      
      console.log('\nMigration complete!');
      
    } catch (error) {
      console.error('Migration error:', error);
    } finally {
      // Close mongoose connection
      await mongoose.connection.close();
      console.log('Database connection closed');
    }
  }
  
  /**
   * Migrate a single tenant to a separate database
   * @param {Object} tenant - Tenant document
   */
  static async migrateTenant(tenant) {
    // Connect to the shared database where tenant data currently resides
    const sharedDbUri = process.env.MONGODB_URI;
    const sharedClient = new MongoClient(sharedDbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    await sharedClient.connect();
    
    // Create a new tenant database
    const tenantDbUri = DbConnectionManager.getTenantDbUri(tenant.subdomain);
    const tenantClient = new MongoClient(tenantDbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    await tenantClient.connect();
    
    try {
      console.log(`Connected to shared and tenant databases`);
      
      // Check if tenant database already exists and has data
      const tenantDb = tenantClient.db();
      const collections = await tenantDb.listCollections().toArray();
      
      if (collections.length > 0) {
        // Ask for confirmation to overwrite
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const confirmed = await new Promise(resolve => {
          readline.question(
            `Tenant database for ${tenant.subdomain} already exists with ${collections.length} collections. Overwrite? (y/N): `,
            answer => {
              readline.close();
              resolve(answer.toLowerCase() === 'y');
            }
          );
        });
        
        if (!confirmed) {
          console.log(`Skipping migration for ${tenant.subdomain}`);
          return;
        }
        
        console.log(`Dropping existing tenant database: ${tenant.subdomain}`);
        // Drop existing database
        await tenantDb.dropDatabase();
      }
      
      // Get shared database instance
      const sharedDb = sharedClient.db();
      
      // Find users belonging to this tenant
      const users = await sharedDb.collection('users')
        .find({ tenantId: mongoose.Types.ObjectId(tenant._id) })
        .toArray();
      
      console.log(`Found ${users.length} users to migrate`);
      
      // Find tenant admin users
      const adminUsers = users.filter(user => user.userType === 'tenant_admin');
      
      if (adminUsers.length === 0) {
        console.warn(`Warning: No tenant admin found for ${tenant.subdomain}`);
      }
      
      // Initialize tenant database structure
      const adminUser = adminUsers.length > 0 ? {
        firstName: adminUsers[0].firstName,
        lastName: adminUsers[0].lastName,
        email: adminUsers[0].email,
        password: 'tempPassword123', // Will be changed in the migration
        userType: 'tenant_admin'
      } : null;
      
      // Create the tenant database schema
      await TenantDbInitializer.registerTenantModels(
        await DbConnectionManager.createTenantDatabase(tenant)
      );
      
      console.log(`Initialized tenant database schema`);
      
      // Get the tenant database connection
      const tenantConnection = await DbConnectionManager.getTenantConnection(tenant._id);
      
      // Get models from tenant database
      const TenantUser = tenantConnection.model('User');
      const TenantRole = tenantConnection.model('Role');
      const TenantUserRole = tenantConnection.model('UserRole');
      const TenantAuditLog = tenantConnection.model('AuditLog');
      const TenantSettings = tenantConnection.model('Settings');
      
      // Create settings
      await TenantSettings.create({
        key: 'tenant_info',
        value: {
          name: tenant.name,
          subdomain: tenant.subdomain,
          plan: tenant.plan,
          createdAt: tenant.createdAt
        },
        description: 'Tenant information'
      });
      
      console.log(`Created tenant settings`);
      
      // Create default roles if not already done by initializer
      const roles = await TenantRole.find();
      if (roles.length === 0) {
        console.log(`Creating default roles`);
        
        // Create permissions
        const Permission = tenantConnection.model('Permission');
        
        const modules = [
          'USER',
          'ROLE',
          'PERMISSION',
          'SETTINGS',
          'DASHBOARD'
        ];
        
        const actions = [
          'create',
          'read',
          'update',
          'delete',
          'manage'
        ];
        
        const permissionsData = [];
        for (const module of modules) {
          for (const action of actions) {
            permissionsData.push({
              name: `${action}_${module.toLowerCase()}`,
              description: `Can ${action} ${module.toLowerCase()}`,
              module,
              action
            });
          }
        }
        
        const permissions = await Permission.insertMany(permissionsData);
        
        // Create tenant admin role
        const adminRole = await TenantRole.create({
          name: 'Tenant Admin',
          description: 'Administrator for the tenant',
          permissions: permissions.map(p => p._id),
          isSystemRole: true
        });
        
        // Create tenant user role with limited permissions
        const userPermissions = permissions.filter(p => 
          p.action === 'read' || 
          (p.module === 'USER' && p.action === 'update')
        );
        
        await TenantRole.create({
          name: 'Tenant User',
          description: 'Standard user for the tenant',
          permissions: userPermissions.map(p => p._id),
          isSystemRole: true
        });
        
        console.log(`Created default roles and permissions`);
      }
      
      // Migrate users
      const migratedUsers = [];
      
      for (const user of users) {
        // Create user in tenant database
        const newUser = await TenantUser.create({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          password: user.password, // Keep the same hashed password
          userType: user.userType === 'tenant_admin' ? 'tenant_admin' : 'tenant_user',
          isActive: user.isActive,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        });
        
        // Track the migrated user
        migratedUsers.push({
          oldId: user._id.toString(),
          newId: newUser._id
        });
        
        // If user is a tenant admin, assign the admin role
        if (user.userType === 'tenant_admin') {
          const adminRole = await TenantRole.findOne({ name: 'Tenant Admin' });
          
          if (adminRole) {
            await TenantUserRole.create({
              userId: newUser._id,
              roleId: adminRole._id
            });
          }
        } else {
          // For regular users, assign the tenant user role
          const userRole = await TenantRole.findOne({ name: 'Tenant User' });
          
          if (userRole) {
            await TenantUserRole.create({
              userId: newUser._id,
              roleId: userRole._id
            });
          }
        }
      }
      
      console.log(`Migrated ${migratedUsers.length} users`);
      
      // Migrate audit logs
      const auditLogs = await sharedDb.collection('auditlogs')
        .find({ tenantId: mongoose.Types.ObjectId(tenant._id) })
        .toArray();
      
      if (auditLogs.length > 0) {
        console.log(`Found ${auditLogs.length} audit logs to migrate`);
        
        // Transform audit logs with new user IDs
        const transformedLogs = auditLogs.map(log => {
          const userMapping = migratedUsers.find(u => u.oldId === log.userId.toString());
          
          return {
            userId: userMapping ? userMapping.newId : log.userId,
            action: log.action,
            module: log.module,
            description: log.description,
            ipAddress: log.ipAddress,
            userAgent: log.userAgent,
            createdAt: log.createdAt
          };
        });
        
        await TenantAuditLog.insertMany(transformedLogs);
        console.log(`Migrated ${transformedLogs.length} audit logs`);
      } else {
        console.log(`No audit logs to migrate`);
      }
      
      // Additional data migrations can be added here
      
      console.log(`Migration completed for tenant: ${tenant.subdomain}`);
      
    } catch (error) {
      console.error(`Error in migration process:`, error);
      throw error;
    } finally {
      // Close database connections
      await sharedClient.close();
      await tenantClient.close();
    }
  }
  
  /**
   * Validate all tenant databases to ensure they're properly set up
   */
  static async validateTenantDatabases() {
    try {
      // Connect to master database
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      console.log('Connected to master database');
      
      // Get all active tenants
      const tenants = await Tenant.find({ isActive: true });
      
      console.log(`Found ${tenants.length} active tenants to validate`);
      
      const validationResults = [];
      
      // Validate each tenant
      for (const tenant of tenants) {
        try {
          console.log(`Validating tenant: ${tenant.name} (${tenant.subdomain})`);
          
          // Get tenant database connection
          const tenantDb = await DbConnectionManager.getTenantConnection(tenant._id);
          
          // Check for required collections
          const validations = [
            { name: 'users', model: tenantDb.model('User') },
            { name: 'roles', model: tenantDb.model('Role') },
            { name: 'permissions', model: tenantDb.model('Permission') },
            { name: 'userroles', model: tenantDb.model('UserRole') },
            { name: 'auditlogs', model: tenantDb.model('AuditLog') },
            { name: 'settings', model: tenantDb.model('Settings') }
          ];
          
          const collectionChecks = [];
          
          for (const validation of validations) {
            try {
              const count = await validation.model.countDocuments();
              collectionChecks.push({
                collection: validation.name,
                exists: true,
                count: count
              });
            } catch (error) {
              collectionChecks.push({
                collection: validation.name,
                exists: false,
                error: error.message
              });
            }
          }
          
          // Check for admin user
          const TenantUser = tenantDb.model('User');
          const adminCount = await TenantUser.countDocuments({ userType: 'tenant_admin' });
          
          validationResults.push({
            tenant: {
              id: tenant._id,
              name: tenant.name,
              subdomain: tenant.subdomain
            },
            valid: collectionChecks.every(check => check.exists),
            hasAdmin: adminCount > 0,
            collections: collectionChecks
          });
          
          console.log(`Tenant ${tenant.subdomain} validation complete`);
          
        } catch (error) {
          console.error(`Error validating tenant ${tenant.subdomain}:`, error);
          validationResults.push({
            tenant: {
              id: tenant._id,
              name: tenant.name,
              subdomain: tenant.subdomain
            },
            valid: false,
            error: error.message
          });
        }
      }
      
      console.log('\nValidation Results:');
      console.log('---------------------');
      for (const result of validationResults) {
        console.log(`Tenant: ${result.tenant.name} (${result.tenant.subdomain})`);
        console.log(`Valid: ${result.valid}`);
        
        if (!result.valid && result.error) {
          console.log(`Error: ${result.error}`);
        } else {
          console.log(`Has Admin: ${result.hasAdmin}`);
          console.log('Collections:');
          for (const collection of result.collections) {
            console.log(`  - ${collection.collection}: ${collection.exists ? 'OK' : 'MISSING'} (${collection.count || 0} documents)`);
          }
        }
        console.log('---------------------');
      }
      
      console.log('\nValidation complete!');
      
    } catch (error) {
      console.error('Validation error:', error);
    } finally {
      // Close mongoose connection
      await mongoose.connection.close();
      console.log('Database connection closed');
    }
  }
  
  /**
   * Fix a specific tenant database
   * @param {string} subdomain - Tenant subdomain
   */
  static async fixTenantDatabase(subdomain) {
    try {
      // Connect to master database
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      console.log('Connected to master database');
      
      // Get tenant
      const tenant = await Tenant.findOne({ subdomain });
      
      if (!tenant) {
        console.error(`Tenant not found: ${subdomain}`);
        return;
      }
      
      console.log(`Found tenant: ${tenant.name} (${tenant.subdomain})`);
      
      // Close the tenant connection if it exists
      DbConnectionManager.removeTenantConnection(tenant._id);
      
      // Reinitialize tenant database
      console.log(`Reinitializing tenant database...`);
      
      // Create admin user data
      const adminUser = {
        firstName: 'Admin',
        lastName: 'User',
        email: `admin@${tenant.subdomain}.com`,
        password: 'Admin123!',
        userType: 'tenant_admin'
      };
      
      // Initialize tenant database with schemas and base data
      await TenantDbInitializer.initializeTenantDatabase(tenant, adminUser);
      
      console.log(`Fixed tenant database: ${tenant.subdomain}`);
      console.log(`Created admin user: ${adminUser.email} with password: ${adminUser.password}`);
      
    } catch (error) {
      console.error('Fix tenant database error:', error);
    } finally {
      // Close mongoose connection
      await mongoose.connection.close();
      console.log('Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  const command = process.argv[2];
  const param = process.argv[3];
  
  if (!command) {
    console.log('Usage:');
    console.log('  node tenantMigrationTool.js migrate-all        # Migrate all tenants');
    console.log('  node tenantMigrationTool.js migrate tenant1    # Migrate a specific tenant by subdomain');
    console.log('  node tenantMigrationTool.js validate           # Validate all tenant databases');
    console.log('  node tenantMigrationTool.js fix tenant1        # Fix a specific tenant database');
    process.exit(1);
  }
  
  switch (command) {
    case 'migrate-all':
      TenantMigrationTool.migrateAllTenants()
        .then(() => process.exit(0))
        .catch(error => {
          console.error(error);
          process.exit(1);
        });
      break;
      
    case 'migrate':
      if (!param) {
        console.error('Error: Tenant subdomain required');
        process.exit(1);
      }
      
      mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      })
        .then(() => Tenant.findOne({ subdomain: param }))
        .then(tenant => {
          if (!tenant) {
            console.error(`Tenant not found: ${param}`);
            process.exit(1);
          }
          return TenantMigrationTool.migrateTenant(tenant);
        })
        .then(() => {
          console.log('Migration complete');
          process.exit(0);
        })
        .catch(error => {
          console.error(error);
          process.exit(1);
        });
      break;
      
    case 'validate':
      TenantMigrationTool.validateTenantDatabases()
        .then(() => process.exit(0))
        .catch(error => {
          console.error(error);
          process.exit(1);
        });
      break;
      
    case 'fix':
      if (!param) {
        console.error('Error: Tenant subdomain required');
        process.exit(1);
      }
      
      TenantMigrationTool.fixTenantDatabase(param)
        .then(() => process.exit(0))
        .catch(error => {
          console.error(error);
          process.exit(1);
        });
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

module.exports = TenantMigrationTool;