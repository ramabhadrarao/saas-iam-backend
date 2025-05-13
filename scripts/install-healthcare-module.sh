#!/bin/bash
# install-healthcare-module.sh

# Bold text output
bold=$(tput bold)
normal=$(tput sgr0)

echo "${bold}Installing Healthcare Module Components for Multi-tenant SaaS Platform${normal}"
echo "=====================================================================\n"

# Create directories if they don't exist
mkdir -p controllers/healthcare
mkdir -p routes/healthcare
mkdir -p services/healthcare
mkdir -p models/healthcare

# 1. Fix the tenant routes issue
echo "${bold}Fixing tenant.routes.js${normal}"
# Make a backup first
if [ -f routes/tenant.routes.js ]; then
  cp routes/tenant.routes.js routes/tenant.routes.js.bak
  echo "Created backup at routes/tenant.routes.js.bak"
fi

# 2. Create/update module controller
echo "${bold}Setting up module.controller.js${normal}"
cat > controllers/module.controller.js << 'EOF'
// controllers/module.controller.js
const Module = require('../models/module.model');
const TenantModule = require('../models/tenantModule.model');
const ModuleManagerService = require('../services/moduleManager.service');
const { createAuditLog } = require('../utils/auditLogger');

// Get all modules
exports.getAllModules = async (req, res) => {
  try {
    const modules = await ModuleManagerService.getAllModules();
    
    res.status(200).json({
      modules: modules.map(module => ({
        id: module._id,
        name: module.name,
        displayName: module.displayName,
        description: module.description,
        version: module.version,
        isCore: module.isCore,
        dependencies: module.dependencies
      }))
    });
  } catch (error) {
    console.error('Get all modules error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get modules for a specific tenant
exports.getTenantModules = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenantModules = await ModuleManagerService.getTenantModules(tenantId);
    
    res.status(200).json({
      modules: tenantModules.map(module => ({
        id: module.moduleId._id,
        name: module.moduleId.name,
        displayName: module.moduleId.displayName,
        description: module.moduleId.description,
        version: module.moduleId.version,
        activatedAt: module.activatedAt,
        usageQuota: module.usageQuota,
        usageStats: module.usageStats
      }))
    });
  } catch (error) {
    console.error('Get tenant modules error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Activate module for tenant
exports.activateModule = async (req, res) => {
  try {
    const { tenantId, moduleId, quotaLimits } = req.body;
    
    // Activate the module
    const result = await ModuleManagerService.activateModule(tenantId, moduleId, quotaLimits);
    
    // Get module info for logging
    const module = await Module.findById(moduleId);
    
    // Log module activation
    await createAuditLog({
      userId: req.user.id,
      action: 'ACTIVATE',
      module: 'MODULE',
      description: `Activated module ${module.name} for tenant ${tenantId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: `Module ${module.displayName} activated successfully`,
      moduleActivation: {
        tenantId: result.tenantId,
        moduleId: result.moduleId,
        isActive: result.isActive,
        activatedAt: result.activatedAt,
        usageQuota: result.usageQuota
      }
    });
  } catch (error) {
    console.error('Activate module error:', error);
    
    if (error.message === 'Required module dependencies not activated') {
      return res.status(400).json({ 
        message: 'Required module dependencies must be activated first' 
      });
    }
    
    if (error.message === 'Module already activated for this tenant') {
      return res.status(400).json({ 
        message: 'This module is already activated for the tenant' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Deactivate module for tenant
exports.deactivateModule = async (req, res) => {
  try {
    const { tenantId, moduleId, backup = true } = req.body;
    
    // Get module info for logging
    const module = await Module.findById(moduleId);
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }
    
    // Deactivate the module
    const result = await ModuleManagerService.deactivateModule(tenantId, moduleId, backup);
    
    // Log module deactivation
    await createAuditLog({
      userId: req.user.id,
      action: 'DEACTIVATE',
      module: 'MODULE',
      description: `Deactivated module ${module.name} for tenant ${tenantId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: `Module ${module.displayName} deactivated successfully`,
      moduleStatus: {
        tenantId: result.tenantId,
        moduleId: result.moduleId,
        isActive: result.isActive,
        dataBackedUp: backup && !!result.backupData
      }
    });
  } catch (error) {
    console.error('Deactivate module error:', error);
    
    if (error.message === 'Module not active for this tenant') {
      return res.status(400).json({ 
        message: 'This module is not currently active for the tenant' 
      });
    }
    
    if (error.message === 'Cannot deactivate module: other active modules depend on it') {
      return res.status(400).json({ 
        message: 'Cannot deactivate this module because other active modules depend on it' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update module quota limits
exports.updateModuleQuota = async (req, res) => {
  try {
    const { tenantId, moduleId, quotaLimits } = req.body;
    
    // Get module info for logging
    const module = await Module.findById(moduleId);
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }
    
    // Update the module quota
    const result = await ModuleManagerService.updateQuota(tenantId, moduleId, quotaLimits);
    
    // Log quota update
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'MODULE',
      description: `Updated quota limits for module ${module.name} for tenant ${tenantId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: `Module ${module.displayName} quota updated successfully`,
      moduleQuota: {
        tenantId: result.tenantId,
        moduleId: result.moduleId,
        usageQuota: result.usageQuota
      }
    });
  } catch (error) {
    console.error('Update module quota error:', error);
    
    if (error.message === 'Module not found for this tenant') {
      return res.status(404).json({ 
        message: 'Module not found for this tenant' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get module usage statistics
exports.getModuleUsageStats = async (req, res) => {
  try {
    const { tenantId, moduleId } = req.params;
    
    const stats = await ModuleManagerService.getModuleUsageStats(tenantId, moduleId);
    
    res.status(200).json({ stats });
  } catch (error) {
    console.error('Get module usage stats error:', error);
    
    if (error.message === 'Module not found for this tenant') {
      return res.status(404).json({ 
        message: 'Module not found for this tenant' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = exports;
EOF
echo "√ Created module controller\n"

# 3. Create module routes
echo "${bold}Setting up module.routes.js${normal}"
cat > routes/module.routes.js << 'EOF'
// routes/module.routes.js
const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const moduleController = require('../controllers/module.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Get all modules
router.get(
  '/',
  authenticate,
  authorize(['read_module']),
  asyncHandler(moduleController.getAllModules)
);

// Get modules for a tenant
router.get(
  '/tenant/:tenantId',
  authenticate,
  authorize(['read_module']),
  asyncHandler(moduleController.getTenantModules)
);

// Activate module for tenant
router.post(
  '/activate',
  [
    authenticate,
    authorize(['manage_module']),
    check('tenantId', 'Tenant ID is required').notEmpty(),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('quotaLimits', 'Quota limits must be an object').optional().isObject()
  ],
  asyncHandler(moduleController.activateModule)
);

// Deactivate module for tenant
router.post(
  '/deactivate',
  [
    authenticate,
    authorize(['manage_module']),
    check('tenantId', 'Tenant ID is required').notEmpty(),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('backup', 'Backup flag must be boolean').optional().isBoolean()
  ],
  asyncHandler(moduleController.deactivateModule)
);

// Update module quota
router.put(
  '/quota',
  [
    authenticate,
    authorize(['manage_module']),
    check('tenantId', 'Tenant ID is required').notEmpty(),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('quotaLimits', 'Quota limits must be an object').isObject()
  ],
  asyncHandler(moduleController.updateModuleQuota)
);

// Get module usage stats
router.get(
  '/stats/:tenantId/:moduleId',
  authenticate,
  authorize(['read_module']),
  asyncHandler(moduleController.getModuleUsageStats)
);

module.exports = router;
EOF
echo "√ Created module routes\n"

# 4. Update tenant controller with module methods
echo "${bold}Updating tenant.controller.js with module methods${normal}"
# Check if methods already exist
if grep -q "getTenantModules" controllers/tenant.controller.js; then
  echo "Module methods already exist in tenant controller"
else
  # Create a temporary file with the module methods
  cat > tenant_module_methods.js << 'EOF'

/**
 * Get modules activated for a tenant
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getTenantModules = async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    // Check if tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Get activated modules
    const tenantModules = await TenantModule.find({ 
      tenantId: tenantId,
      isActive: true
    }).populate('moduleId');
    
    // Format response
    const modules = tenantModules.map(tm => ({
      id: tm.moduleId._id,
      name: tm.moduleId.name,
      displayName: tm.moduleId.displayName,
      description: tm.moduleId.description,
      version: tm.moduleId.version,
      activatedAt: tm.activatedAt,
      usageQuota: tm.usageQuota,
      usageStats: tm.usageStats
    }));
    
    res.status(200).json({
      modules: modules
    });
    
  } catch (error) {
    console.error('Get tenant modules error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Activate a module for a tenant
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.activateModule = async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { moduleId, quotaLimits } = req.body;
    
    // Check if tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if module exists
    const module = await Module.findById(moduleId);
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }
    
    // Activate the module
    const result = await ModuleManagerService.activateModule(tenantId, moduleId, quotaLimits);
    
    // Log module activation
    await createAuditLog({
      userId: req.user.id,
      action: 'ACTIVATE',
      module: 'MODULE',
      description: `Activated module ${module.name} for tenant ${tenant.name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: `Module ${module.displayName} activated successfully`,
      moduleActivation: {
        tenantId: result.tenantId,
        moduleId: result.moduleId,
        isActive: result.isActive,
        activatedAt: result.activatedAt,
        usageQuota: result.usageQuota
      }
    });
    
  } catch (error) {
    console.error('Activate module error:', error);
    
    if (error.message === 'Required module dependencies not activated') {
      return res.status(400).json({ 
        message: 'Required module dependencies must be activated first' 
      });
    }
    
    if (error.message === 'Module already activated for this tenant') {
      return res.status(400).json({ 
        message: 'This module is already activated for the tenant' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Deactivate a module for a tenant
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deactivateModule = async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { moduleId, backup = true } = req.body;
    
    // Check if tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if module exists
    const module = await Module.findById(moduleId);
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }
    
    // Deactivate the module
    const result = await ModuleManagerService.deactivateModule(tenantId, moduleId, backup);
    
    // Log module deactivation
    await createAuditLog({
      userId: req.user.id,
      action: 'DEACTIVATE',
      module: 'MODULE',
      description: `Deactivated module ${module.name} for tenant ${tenant.name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: `Module ${module.displayName} deactivated successfully`,
      moduleStatus: {
        tenantId: result.tenantId,
        moduleId: result.moduleId,
        isActive: result.isActive,
        dataBackedUp: backup && !!result.backupData
      }
    });
    
  } catch (error) {
    console.error('Deactivate module error:', error);
    
    if (error.message === 'Module not active for this tenant') {
      return res.status(400).json({ 
        message: 'This module is not currently active for the tenant' 
      });
    }
    
    if (error.message === 'Cannot deactivate module: other active modules depend on it') {
      return res.status(400).json({ 
        message: 'Cannot deactivate this module because other active modules depend on it' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update module quota limits for a tenant
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateModuleQuota = async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { moduleId, quotaLimits } = req.body;
    
    // Check if tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if module exists
    const module = await Module.findById(moduleId);
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }
    
    // Update the module quota
    const result = await ModuleManagerService.updateQuota(tenantId, moduleId, quotaLimits);
    
    // Log quota update
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'MODULE',
      description: `Updated quota limits for module ${module.name} for tenant ${tenant.name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.status(200).json({
      message: `Module ${module.displayName} quota updated successfully`,
      moduleQuota: {
        tenantId: result.tenantId,
        moduleId: result.moduleId,
        usageQuota: result.usageQuota
      }
    });
    
  } catch (error) {
    console.error('Update module quota error:', error);
    
    if (error.message === 'Module not found for this tenant') {
      return res.status(404).json({ 
        message: 'Module not found for this tenant' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};
EOF

  # Append the methods to the tenant controller
  cat tenant_module_methods.js >> controllers/tenant.controller.js
  rm tenant_module_methods.js
  echo "√ Added module methods to tenant controller\n"
fi

# 5. Update tenant routes
echo "${bold}Updating tenant.routes.js${normal}"

cat > routes/tenant.routes.js << 'EOF'
// routes/tenant.routes.js
const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenant.controller');
const { authenticate, authorize, checkTenantAccess } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');
const { check } = require('express-validator');

// Tenant CRUD operations
router.post('/', 
  authenticate, 
  authorize(['create_tenant']), 
  asyncHandler(tenantController.createTenant)
);

router.get('/', 
  authenticate, 
  authorize(['read_tenant']), 
  asyncHandler(tenantController.getTenants)
);

router.get('/:id', 
  authenticate, 
  authorize(['read_tenant']),
  checkTenantAccess,  
  asyncHandler(tenantController.getTenantById)
);

router.patch('/:id', 
  authenticate, 
  authorize(['update_tenant']),
  checkTenantAccess,
  asyncHandler(tenantController.updateTenant)
);

router.delete('/:id', 
  authenticate, 
  authorize(['delete_tenant']),
  checkTenantAccess,
  asyncHandler(tenantController.deleteTenant)
);

// Tenant status management
router.post('/:id/suspend', 
  authenticate, 
  authorize(['manage_tenant']), 
  asyncHandler(tenantController.suspendTenant)
);

router.post('/:id/restore', 
  authenticate, 
  authorize(['manage_tenant']), 
  asyncHandler(tenantController.restoreTenant)
);

// Tenant metrics
router.get('/:id/metrics', 
  authenticate, 
  authorize(['read_tenant']), 
  asyncHandler(tenantController.getTenantMetrics)
);

router.get('/:id/usage', 
  authenticate, 
  authorize(['read_tenant']), 
  asyncHandler(tenantController.getTenantUsage)
);

router.patch('/:id/limits', 
  authenticate, 
  authorize(['manage_tenant']), 
  asyncHandler(tenantController.updateTenantLimits)
);

// Get detailed tenant usage data
router.get('/:id/usage-details', 
  authenticate, 
  authorize(['read_tenant']),
  checkTenantAccess,
  asyncHandler(tenantController.getTenantUsageDetails)
);

// Update tenant settings
router.patch('/:id/settings', 
  authenticate, 
  authorize(['update_tenant']),
  checkTenantAccess,
  asyncHandler(tenantController.updateTenantSettings)
);

// Get available tenant plans
router.get('/plans', 
  authenticate, 
  asyncHandler(tenantController.getTenantPlans)
);

// Get tenant modules
router.get('/:id/modules',
  authenticate,
  authorize(['read_tenant']),
  asyncHandler(tenantController.getTenantModules)
);

// Activate module for tenant
router.post(
  '/:id/modules/activate',
  [
    authenticate,
    authorize(['manage_tenant']),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('quotaLimits', 'Quota limits must be an object').optional().isObject()
  ],
  asyncHandler(tenantController.activateModule)
);

// Deactivate module for tenant
router.post(
  '/:id/modules/deactivate',
  [
    authenticate,
    authorize(['manage_tenant']),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('backup', 'Backup flag must be boolean').optional().isBoolean()
  ],
  asyncHandler(tenantController.deactivateModule)
);

// Update module quota for tenant
router.put(
  '/:id/modules/quota',
  [
    authenticate,
    authorize(['manage_tenant']),
    check('moduleId', 'Module ID is required').notEmpty(),
    check('quotaLimits', 'Quota limits must be an object').isObject()
  ],
  asyncHandler(tenantController.updateModuleQuota)
);

module.exports = router;
EOF
echo "√ Updated tenant routes\n"

# 6. Update server.js to include module routes
echo "${bold}Updating server.js${normal}"
if grep -q "moduleRoutes" server.js; then
  echo "Module routes already included in server.js"
else
  # Create a backup
  cp server.js server.js.bak
  echo "Created backup at server.js.bak"
  
  # Update server.js to include the new routes
  # This is a simplistic approach - might need adjustment for more complex files
  sed -i 's|const ticketRoutes = require(.*/ticket.routes.*);|const ticketRoutes = require\1;\nconst moduleRoutes = require('\''./routes/module.routes'\'');|' server.js
  sed -i 's|app.use(.*/api/v1/tickets.*);|app.use\1;\napp.use('\''/api/v1/modules'\'', moduleRoutes);|' server.js
  sed -i 's|app.use(.*/api/v1/modules.*);|app.use\1;\n// Healthcare module routes\napp.use('\''/api/v1/healthcare/doctors'\'', require('\''./routes/healthcare/doctor.routes'\''));|' server.js
  
  echo "√ Updated server.js to include module routes\n"
fi

# 7. Run seeders to initialize healthcare module
echo "${bold}Preparing to run healthcare module seeders${normal}"
if [ -f seeders/healthcare/modules.seeder.js ]; then
  echo "Healthcare module seeders already exist"
else
  echo "Creating healthcare seeders directory"
  mkdir -p seeders/healthcare
fi

# 8. Create a script to run the module seeders
echo "${bold}Creating script to run module seeders${normal}"
cat > run-healthcare-seeders.js << 'EOF'
// run-healthcare-seeders.js
require('dotenv').config();
const mongoose = require('mongoose');
const seedHealthcareModule = require('./seeders/healthcare/modules.seeder');
const seedHealthcareRoles = require('./seeders/healthcare/roles.seeder');

async function runSeeders() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');
    
    // Run seeders
    console.log('\nRunning Healthcare Module seeders...');
    const healthcareModule = await seedHealthcareModule();
    console.log('\nRunning Healthcare Roles seeders...');
    await seedHealthcareRoles();
    
    console.log('\nAll seeders completed successfully!');
    console.log('\nThe Healthcare module is now ready to use.');
    console.log('\nTo activate the module for a tenant, use the API endpoint:');
    console.log('POST /api/v1/tenants/:tenantId/modules/activate');
    console.log('With the body:');
    console.log(JSON.stringify({
      moduleId: healthcareModule._id,
      quotaLimits: {
        maxDoctors: 100,
        maxHospitals: 50,
        maxCases: 1000,
        maxProducts: 200
      }
    }, null, 2));
    
    // Close connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
    
  } catch (error) {
    console.error('Error running seeders:', error);
    
    // Close connection
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    } catch (closeError) {
      console.error('Error closing MongoDB connection:', closeError);
    }
    
    process.exit(1);
  }
}

// Run the seeders
runSeeders();
EOF
echo "√ Created module seeder runner script\n"

echo "${bold}Installation completed!${normal}"
echo "To complete the setup, run:"
echo "  1. Update required imports in tenant.controller.js if needed"
echo "  2. Run 'node run-healthcare-seeders.js' to initialize the healthcare module data"
echo "  3. Restart your server"
echo "\nHappy healthcare module development!"