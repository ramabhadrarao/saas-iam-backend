// File: backend/seeders/iam.seeder.standalone.js
// Simplified version for standalone MongoDB (no replica set required)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Permission = require('../models/permission.model');
const UserRole = require('../models/userRole.model');
const { hashPassword } = require('../utils/hash');

// Load environment variables
require('dotenv').config();

// Use standalone MongoDB URL as fallback
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/saas_platform';

console.log(`Connecting to MongoDB at: ${MONGODB_URI.replace(/:[^:]*@/, ':****@')}`);

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Define modules and permissions
const modules = [
  'AUTH',
  'USER',
  'ROLE',
  'PERMISSION',
  'TENANT',
  'BILLING',
  'SUPPORT',
  'DASHBOARD'
];

const actions = [
  'create',
  'read',
  'update',
  'delete',
  'manage'
];

const createPermissions = async () => {
  const permissions = [];
  
  // For each module and action combination
  for (const module of modules) {
    for (const action of actions) {
      // Skip certain combinations that don't make sense
      if (module === 'AUTH' && (action === 'create' || action === 'delete')) {
        continue;
      }
      
      const name = `${action}_${module.toLowerCase()}`;
      const description = `Can ${action} ${module.toLowerCase()}`;
      
      permissions.push({
        name,
        description,
        module,
        action
      });
    }
  }
  
  try {
    // Clear existing permissions
    await Permission.deleteMany({});
    
    // Create new permissions
    const createdPermissions = await Permission.insertMany(permissions);
    console.log(`Created ${createdPermissions.length} permissions`);
    
    return createdPermissions;
  } catch (err) {
    console.error('Error creating permissions:', err);
    throw err;
  }
};

const createRoles = async (permissions) => {
  try {
    // Clear existing roles
    await Role.deleteMany({});
    
    // Group permissions by module
    const permissionsByModule = {};
    permissions.forEach(permission => {
      if (!permissionsByModule[permission.module]) {
        permissionsByModule[permission.module] = [];
      }
      permissionsByModule[permission.module].push(permission._id);
    });
    
    // Create Super Admin role (has all permissions)
    const superAdminRole = await Role.create({
      name: 'Super Admin',
      description: 'Has all permissions',
      permissions: permissions.map(p => p._id),
      isSystemRole: true
    });
    
    // Create System Admin role (has all permissions except some tenant ones)
    const systemAdminPermissions = permissions.filter(p => 
      !(p.module === 'TENANT' && p.action === 'delete')
    ).map(p => p._id);
    
    const systemAdminRole = await Role.create({
      name: 'System Admin',
      description: 'System administrator with most permissions',
      permissions: systemAdminPermissions,
      isSystemRole: true
    });
    
    // Create Tenant Admin role
    const tenantAdminPermissions = permissions.filter(p => 
      p.module !== 'TENANT' || (p.module === 'TENANT' && p.action === 'read')
    ).map(p => p._id);
    
    const tenantAdminRole = await Role.create({
      name: 'Tenant Admin',
      description: 'Administrator for a specific tenant',
      permissions: tenantAdminPermissions,
      isSystemRole: true
    });
    
    // Create User Manager role
    const userManagerPermissions = permissions.filter(p => 
      p.module === 'USER'
    ).map(p => p._id);
    
    const userManagerRole = await Role.create({
      name: 'User Manager',
      description: 'Can manage users',
      permissions: userManagerPermissions,
      isSystemRole: true
    });
    
    // Create Read Only role
    const readOnlyPermissions = permissions.filter(p => 
      p.action === 'read'
    ).map(p => p._id);
    
    const readOnlyRole = await Role.create({
      name: 'Read Only',
      description: 'Can only view data',
      permissions: readOnlyPermissions,
      isSystemRole: true
    });
    
    console.log(`Created ${await Role.countDocuments()} roles`);
    
    return {
      superAdminRole,
      systemAdminRole,
      tenantAdminRole,
      userManagerRole,
      readOnlyRole
    };
  } catch (err) {
    console.error('Error creating roles:', err);
    throw err;
  }
};

const createUsers = async (roles) => {
  try {
    // Clear existing users and user roles
    await User.deleteMany({});
    await UserRole.deleteMany({});
    
    // Create master admin
    const hashedPassword = await hashPassword('Admin123!');    
    const masterAdmin = await User.create({
      firstName: 'Master',
      lastName: 'Admin',
      email: 'admin@example.com',
      password: hashedPassword,
      userType: 'master_admin',
      isActive: true
    });
    
    // Assign Super Admin role
    await UserRole.create({
      userId: masterAdmin._id,
      roleId: roles.superAdminRole._id
    });
    
    // Create system admin
    const systemAdmin = await User.create({
      firstName: 'System',
      lastName: 'Admin',
      email: 'system@example.com',
      password: hashedPassword,
      userType: 'master_admin',
      isActive: true
    });
    
    // Assign System Admin role
    await UserRole.create({
      userId: systemAdmin._id,
      roleId: roles.systemAdminRole._id
    });
    
    // Create a demo tenant admin
    const tenantAdmin = await User.create({
      firstName: 'Tenant',
      lastName: 'Admin',
      email: 'tenant@example.com',
      password: hashedPassword,
      userType: 'tenant_admin',
      tenantId: new mongoose.Types.ObjectId(),  // Just a placeholder ID
      isActive: true
    });
    
    // Assign Tenant Admin role
    await UserRole.create({
      userId: tenantAdmin._id,
      roleId: roles.tenantAdminRole._id,
      tenantId: tenantAdmin.tenantId
    });
    
    console.log(`Created ${await User.countDocuments()} users`);
    console.log(`Created ${await UserRole.countDocuments()} user-role assignments`);
    
    console.log("\nUser credentials for testing:");
    console.log("----------------------------");
    console.log("Master Admin:");
    console.log("  Email: admin@example.com");
    console.log("  Password: Admin123!");
    console.log("\nSystem Admin:");
    console.log("  Email: system@example.com");
    console.log("  Password: Admin123!");
    console.log("\nTenant Admin:");
    console.log("  Email: tenant@example.com");
    console.log("  Password: Admin123!");
    
  } catch (err) {
    console.error('Error creating users:', err);
    throw err;
  }
};

const runSeed = async () => {
  try {
    // Run seed operations
    const permissions = await createPermissions();
    const roles = await createRoles(permissions);
    await createUsers(roles);
    
    console.log('\nSeed completed successfully');
    
    // Close mongoose connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    
    // Close mongoose connection
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    } catch (closeErr) {
      console.error('Error closing MongoDB connection:', closeErr);
    }
    
    process.exit(1);
  }
};

// Run the seeder
runSeed();