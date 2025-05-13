// File: seeders/healthcare/roles.seeder.js
const mongoose = require('mongoose');
const Role = require('../../models/role.model');
const Permission = require('../../models/permission.model');

/**
 * Seed default roles for healthcare module
 */
async function seedHealthcareRoles() {
  try {
    console.log('Seeding Healthcare roles...');
    
    // Define default roles with their permissions
    const roles = [
      {
        name: 'Healthcare Admin',
        description: 'Full access to all healthcare module features',
        permissions: [
          'view_doctors', 'manage_doctors',
          'view_hospitals', 'manage_hospitals',
          'view_cases', 'manage_cases',
          'view_products', 'manage_products',
          'view_categories', 'manage_categories',
          'view_principles', 'manage_principles',
          'view_departments', 'manage_departments',
          'view_reports'
        ]
      },
      {
        name: 'Doctor Manager',
        description: 'Can manage doctors and view cases',
        permissions: [
          'view_doctors', 'manage_doctors',
          'view_hospitals',
          'view_cases',
          'view_products',
          'view_categories'
        ]
      },
      {
        name: 'Inventory Manager',
        description: 'Can manage products and inventory',
        permissions: [
          'view_products', 'manage_products',
          'view_principles', 'manage_principles',
          'view_categories'
        ]
      },
      {
        name: 'Sales Representative',
        description: 'Can manage cases and view products',
        permissions: [
          'view_doctors',
          'view_hospitals',
          'view_cases', 'manage_cases',
          'view_products',
          'view_principles',
          'view_departments'
        ]
      }
    ];
    
    // Create each role if it doesn't exist
    for (const roleData of roles) {
      // Check if role already exists
      const existingRole = await Role.findOne({ name: roleData.name });
      if (existingRole) {
        console.log(`Role ${roleData.name} already exists`);
        continue;
      }
      
      // Get permission IDs
      const permissions = await Permission.find({ name: { $in: roleData.permissions } });
      const permissionIds = permissions.map(p => p._id);
      
      // Create role
      const role = new Role({
        name: roleData.name,
        description: roleData.description,
        permissions: permissionIds,
        isSystemRole: true
      });
      
      await role.save();
      console.log(`Created role: ${role.name}`);
    }
    
    console.log('Healthcare roles created successfully');
    
  } catch (error) {
    console.error('Error seeding healthcare roles:', error);
    throw error;
  }
}

module.exports = seedHealthcareRoles;