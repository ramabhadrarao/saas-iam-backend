// seeders/healthcare/modules.seeder.js
const Module = require('../../models/module.model');
const Permission = require('../../models/permission.model');
const mongoose = require('mongoose');

/**
 * Seed healthcare modules and related permissions
 */
async function seedHealthcareModules() {
  try {
    // Check if module already exists
    const existingModule = await Module.findOne({ name: 'healthcare' });
    if (existingModule) {
      console.log('Healthcare module already exists');
      return;
    }
    
    // Create healthcare module
    const healthcareModule = new Module({
      name: 'healthcare',
      displayName: 'Healthcare CRM',
      description: 'Complete healthcare CRM and medical operations management system',
      version: '1.0.0',
      isCore: false,
      dependencies: [],
      requiredPermissions: [
        'view_doctors',
        'manage_doctors',
        'view_hospitals',
        'manage_hospitals',
        'view_cases',
        'manage_cases',
        'view_products',
        'manage_products',
        'view_categories',
        'manage_categories',
        'view_principles',
        'manage_principles',
        'view_departments',
        'manage_departments'
      ],
      defaultRoles: [
        'Healthcare Admin',
        'Doctor Manager',
        'Inventory Manager',
        'Sales Representative'
      ],
      defaultMenuItems: [
        {
          title: 'Dashboard',
          route: '/dashboard',
          icon: 'dashboard',
          permissions: ['view_dashboard']
        },
        {
          title: 'Doctors',
          route: '/doctors',
          icon: 'person',
          permissions: ['view_doctors'],
          subItems: [
            {
              title: 'All Doctors',
              route: '/doctors/list',
              permissions: ['view_doctors']
            },
            {
              title: 'Add Doctor',
              route: '/doctors/add',
              permissions: ['manage_doctors']
            }
          ]
        },
        {
          title: 'Hospitals',
          route: '/hospitals',
          icon: 'business',
          permissions: ['view_hospitals'],
          subItems: [
            {
              title: 'All Hospitals',
              route: '/hospitals/list',
              permissions: ['view_hospitals']
            },
            {
              title: 'Add Hospital',
              route: '/hospitals/add',
              permissions: ['manage_hospitals']
            }
          ]
        },
        {
          title: 'Cases',
          route: '/cases',
          icon: 'assignment',
          permissions: ['view_cases'],
          subItems: [
            {
              title: 'All Cases',
              route: '/cases/list',
              permissions: ['view_cases']
            },
            {
              title: 'Add Case',
              route: '/cases/add',
              permissions: ['manage_cases']
            }
          ]
        },
        {
          title: 'Products',
          route: '/products',
          icon: 'inventory',
          permissions: ['view_products'],
          subItems: [
            {
              title: 'All Products',
              route: '/products/list',
              permissions: ['view_products']
            },
            {
              title: 'Add Product',
              route: '/products/add',
              permissions: ['manage_products']
            },
            {
              title: 'Inventory',
              route: '/products/inventory',
              permissions: ['view_products']
            }
          ]
        },
        {
          title: 'Categories',
          route: '/categories',
          icon: 'category',
          permissions: ['view_categories'],
          subItems: [
            {
              title: 'All Categories',
              route: '/categories/list',
              permissions: ['view_categories']
            },
            {
              title: 'Add Category',
              route: '/categories/add',
              permissions: ['manage_categories']
            }
          ]
        },
        {
          title: 'Suppliers',
          route: '/principles',
          icon: 'store',
          permissions: ['view_principles'],
          subItems: [
            {
              title: 'All Suppliers',
              route: '/principles/list',
              permissions: ['view_principles']
            },
            {
              title: 'Add Supplier',
              route: '/principles/add',
              permissions: ['manage_principles']
            }
          ]
        },
        {
          title: 'Departments',
          route: '/departments',
          icon: 'groups',
          permissions: ['view_departments'],
          subItems: [
            {
              title: 'All Departments',
              route: '/departments/list',
              permissions: ['view_departments']
            },
            {
              title: 'Add Department',
              route: '/departments/add',
              permissions: ['manage_departments']
            }
          ]
        },
        {
          title: 'Reports',
          route: '/reports',
          icon: 'assessment',
          permissions: ['view_reports']
        }
      ],
      schemas: [
        { name: 'doctors', fields: {} },
        { name: 'doctorhospitalassociations', fields: {} },
        { name: 'doctorspecialties', fields: {} },
        { name: 'doctorpreferences', fields: {} },
        { name: 'doctormeetings', fields: {} },
        { name: 'doctordocuments', fields: {} },
        { name: 'doctorcasehistories', fields: {} },
        { name: 'hospitals', fields: {} },
        { name: 'hospitalcontacts', fields: {} },
        { name: 'hospitaldepartments', fields: {} },
        { name: 'hospitalvisits', fields: {} },
        { name: 'hospitalagreements', fields: {} },
        { name: 'hospitalhistories', fields: {} },
        { name: 'cases', fields: {} },
        { name: 'caseproducts', fields: {} },
        { name: 'casestatushistories', fields: {} },
        { name: 'casenotes', fields: {} },
        { name: 'casedocuments', fields: {} },
        { name: 'casefollowups', fields: {} },
        { name: 'products', fields: {} },
        { name: 'productspecifications', fields: {} },
        { name: 'productimages', fields: {} },
        { name: 'productdocuments', fields: {} },
        { name: 'productinventories', fields: {} },
        { name: 'productinventorytransactions', fields: {} },
        { name: 'productusages', fields: {} },
        { name: 'productalternatives', fields: {} },
        { name: 'categories', fields: {} },
        { name: 'subcategories', fields: {} },
        { name: 'categoryapplications', fields: {} },
        { name: 'categoryproducts', fields: {} },
        { name: 'categoryspecifications', fields: {} },
        { name: 'categoryprocedures', fields: {} },
        { name: 'principles', fields: {} },
        { name: 'principlecontacts', fields: {} },
        { name: 'principlecategories', fields: {} },
        { name: 'principleagreements', fields: {} },
        { name: 'principlevisits', fields: {} },
        { name: 'principleproducts', fields: {} },
        { name: 'principledocuments', fields: {} },
        { name: 'departments', fields: {} },
        { name: 'departmentemployees', fields: {} },
        { name: 'departmenttargets', fields: {} },
        { name: 'employeetargets', fields: {} },
        { name: 'departmentactivities', fields: {} },
        { name: 'departmentterritories', fields: {} },
        { name: 'territoryhospitals', fields: {} },
        { name: 'inventoryphysicalcounts', fields: {} },
        { name: 'inventorycountitems', fields: {} },
        { name: 'inventoryadjustments', fields: {} }
      ]
    });
    
    await healthcareModule.save();
    console.log('Healthcare module created successfully');
    
    // Create permissions if they don't exist
    const permissions = [
      {
        name: 'view_doctors',
        description: 'Can view doctors',
        module: 'healthcare',
        action: 'view'
      },
      {
        name: 'manage_doctors',
        description: 'Can manage doctors',
        module: 'healthcare',
        action: 'manage'
      },
      {
        name: 'view_hospitals',
        description: 'Can view hospitals',
        module: 'healthcare',
        action: 'view'
      },
      // seeders/healthcare/modules.seeder.js (continued)
      {
        name: 'manage_hospitals',
        description: 'Can manage hospitals',
        module: 'healthcare',
        action: 'manage'
      },
      {
        name: 'view_cases',
        description: 'Can view medical cases',
        module: 'healthcare',
        action: 'view'
      },
      {
        name: 'manage_cases',
        description: 'Can manage medical cases',
        module: 'healthcare',
        action: 'manage'
      },
      {
        name: 'view_products',
        description: 'Can view products',
        module: 'healthcare',
        action: 'view'
      },
      {
        name: 'manage_products',
        description: 'Can manage products',
        module: 'healthcare',
        action: 'manage'
      },
      {
        name: 'view_categories',
        description: 'Can view categories',
        module: 'healthcare',
        action: 'view'
      },
      {
        name: 'manage_categories',
        description: 'Can manage categories',
        module: 'healthcare',
        action: 'manage'
      },
      {
        name: 'view_principles',
        description: 'Can view suppliers/principles',
        module: 'healthcare',
        action: 'view'
      },
      {
        name: 'manage_principles',
        description: 'Can manage suppliers/principles',
        module: 'healthcare',
        action: 'manage'
      },
      {
        name: 'view_departments',
        description: 'Can view departments',
        module: 'healthcare',
        action: 'view'
      },
      {
        name: 'manage_departments',
        description: 'Can manage departments',
        module: 'healthcare',
        action: 'manage'
      },
      {
        name: 'view_reports',
        description: 'Can view healthcare reports',
        module: 'healthcare',
        action: 'view'
      },
      {
        name: 'view_modules',
        description: 'Can view available modules',
        module: 'system',
        action: 'view'
      },
      {
        name: 'manage_modules',
        description: 'Can manage module activation',
        module: 'system',
        action: 'manage'
      }
    ];
    
    for (const perm of permissions) {
      const existingPerm = await Permission.findOne({ name: perm.name });
      if (!existingPerm) {
        await Permission.create(perm);
        console.log(`Created permission: ${perm.name}`);
      }
    }
    
    console.log('Healthcare module permissions created successfully');
    
  } catch (error) {
    console.error('Error seeding healthcare module:', error);
    throw error;
  }
}

module.exports = seedHealthcareModules;