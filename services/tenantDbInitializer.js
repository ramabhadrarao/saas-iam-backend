// File: backend/services/tenantDbInitializer.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const DbConnectionManager = require('./dbConnectionManager');

/**
 * Service to initialize a new tenant database with required models and initial data
 */
class TenantDbInitializer {
  /**
   * Initialize a new tenant database
   * @param {Object} tenant - The tenant object
   * @param {Object} adminUser - The tenant admin user data
   * @returns {Promise<void>}
   */
  static async initializeTenantDatabase(tenant, adminUser) {
    try {
      console.log(`Initializing database for tenant: ${tenant.subdomain}`);
      
      // Get a connection to the tenant database
      const connection = await DbConnectionManager.createTenantDatabase(tenant);
      
      // Register models on the tenant connection
      this.registerTenantModels(connection);
      
      // Create initial data
      await this.createInitialData(connection, tenant, adminUser);
      
      console.log(`Tenant database initialized: ${tenant.subdomain}`);
    } catch (error) {
      console.error(`Failed to initialize tenant database:`, error);
      throw error;
    }
  }
  
  /**
   * Register all models for a tenant database
   * @param {mongoose.Connection} connection - Tenant database connection
   */
  static registerTenantModels(connection) {
    // User model
    const userSchema = new mongoose.Schema({
      firstName: {
        type: String,
        required: true,
        trim: true
      },
      lastName: {
        type: String,
        required: true,
        trim: true
      },
      email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
      },
      password: {
        type: String,
        required: true
      },
      userType: {
        type: String,
        enum: ['tenant_admin', 'tenant_user'],
        required: true
      },
      isActive: {
        type: Boolean,
        default: true
      },
      lastLogin: {
        type: Date
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      updatedAt: {
        type: Date,
        default: Date.now
      }
    }, { timestamps: true });

    // Hash password before saving
    userSchema.pre('save', async function(next) {
      if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
      }
      next();
    });

    // Method to compare passwords
    userSchema.methods.comparePassword = async function(candidatePassword) {
      return bcrypt.compare(candidatePassword, this.password);
    };

    // Virtual for full name
    userSchema.virtual('fullName').get(function() {
      return `${this.firstName} ${this.lastName}`;
    });
    
    // Permission model
    const permissionSchema = new mongoose.Schema({
      name: {
        type: String,
        required: true,
        unique: true,
        trim: true
      },
      description: {
        type: String,
        trim: true
      },
      module: {
        type: String,
        required: true,
        trim: true
      },
      action: {
        type: String,
        required: true,
        enum: ['create', 'read', 'update', 'delete', 'manage'],
        trim: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      updatedAt: {
        type: Date,
        default: Date.now
      }
    }, { timestamps: true });
    
    // Role model
    const roleSchema = new mongoose.Schema({
      name: {
        type: String,
        required: true,
        unique: true,
        trim: true
      },
      description: {
        type: String,
        trim: true
      },
      permissions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission'
      }],
      isSystemRole: {
        type: Boolean,
        default: false
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      updatedAt: {
        type: Date,
        default: Date.now
      }
    }, { timestamps: true });
    
    // User-Role model
    const userRoleSchema = new mongoose.Schema({
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      roleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role',
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      updatedAt: {
        type: Date,
        default: Date.now
      }
    }, { timestamps: true });
    
    // Compound index to ensure a user doesn't have the same role twice
    userRoleSchema.index({ userId: 1, roleId: 1 }, { unique: true });
    
    // Audit Log model
    const auditLogSchema = new mongoose.Schema({
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      action: {
        type: String,
        required: true,
        trim: true
      },
      module: {
        type: String,
        required: true,
        trim: true
      },
      description: {
        type: String,
        required: true,
        trim: true
      },
      ipAddress: {
        type: String,
        trim: true
      },
      userAgent: {
        type: String,
        trim: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    });
    
    // Settings model
    const settingsSchema = new mongoose.Schema({
      key: {
        type: String,
        required: true,
        unique: true,
        trim: true
      },
      value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
      },
      description: {
        type: String,
        trim: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      updatedAt: {
        type: Date,
        default: Date.now
      }
    }, { timestamps: true });
    
    // Register models on the connection
    connection.model('User', userSchema);
    connection.model('Permission', permissionSchema);
    connection.model('Role', roleSchema);
    connection.model('UserRole', userRoleSchema);
    connection.model('AuditLog', auditLogSchema);
    connection.model('Settings', settingsSchema);
  }
  
  /**
   * Create initial data for a tenant database
   * @param {mongoose.Connection} connection - Tenant database connection
   * @param {Object} tenant - The tenant object
   * @param {Object} adminUser - The tenant admin user data
   */
  static async createInitialData(connection, tenant, adminUser) {
    try {
      // Create models
      const User = connection.model('User');
      const Permission = connection.model('Permission');
      const Role = connection.model('Role');
      const UserRole = connection.model('UserRole');
      const Settings = connection.model('Settings');
      
      // Define modules and permissions
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
      
      // Create permissions
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
      const adminRole = await Role.create({
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
      
      const userRole = await Role.create({
        name: 'Tenant User',
        description: 'Standard user for the tenant',
        permissions: userPermissions.map(p => p._id),
        isSystemRole: true
      });
      
      // Create tenant admin user
      const admin = await User.create({
        firstName: adminUser.firstName || 'Admin',
        lastName: adminUser.lastName || 'User',
        email: adminUser.email,
        password: adminUser.password,
        userType: 'tenant_admin',
        isActive: true
      });
      
      // Assign admin role to admin user
      await UserRole.create({
        userId: admin._id,
        roleId: adminRole._id
      });
      
      // Create tenant settings
      await Settings.create({
        key: 'tenant_info',
        value: {
          name: tenant.name,
          subdomain: tenant.subdomain,
          plan: tenant.plan,
          createdAt: new Date()
        },
        description: 'Tenant information'
      });
      
      console.log(`Initial data created for tenant: ${tenant.subdomain}`);
    } catch (error) {
      console.error('Failed to create initial data:', error);
      throw error;
    }
  }
}

module.exports = TenantDbInitializer;