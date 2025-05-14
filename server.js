// File: backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const morgan = require('morgan');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const DbConnectionManager = require('./services/dbConnectionManager');
const { tenantContext } = require('./middleware/tenantContext.middleware');

// Routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const roleRoutes = require('./routes/role.routes');
const permissionRoutes = require('./routes/permission.routes');
const tenantRoutes = require('./routes/tenant.routes');
const auditRoutes = require('./routes/audit.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const ticketRoutes = require('./routes/ticket.routes');
const billingRoutes = require('./routes/billing.routes');
const mlRoutes = require('./routes/ml.routes');
const moduleRoutes = require('./routes/module.routes');  // Add this line

// Healthcare module routes
const doctorRoutes = require('./routes/healthcare/doctor.routes');  // Add this line
// Add these imports to the existing import section
/*const hospitalRoutes = require('./routes/healthcare/hospital.routes');
const caseRoutes = require('./routes/healthcare/case.routes');
const productRoutes = require('./routes/healthcare/product.routes');
const categoryRoutes = require('./routes/healthcare/category.routes');
const principleRoutes = require('./routes/healthcare/principle.routes');
const departmentRoutes = require('./routes/healthcare/department.routes');
*/
// Import other healthcare routes as needed

const socketService = require('./utils/socketService');
const scheduler = require('./utils/scheduler');
const { enforcePlanLimits } = require('./middleware/planEnforcement.middleware');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Add tenant context middleware
// This should be added before routes but after basic middleware
app.use(tenantContext);

// Initialize master database connection
async function initializeApp() {
  try {
    // Connect to MongoDB master database
    await DbConnectionManager.initMasterConnection();
    
    // API Routes
    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/users', userRoutes);
    app.use('/api/v1/roles', roleRoutes);
    app.use('/api/v1/permissions', permissionRoutes);
    app.use('/api/v1/tenants', tenantRoutes);
    app.use('/api/v1/audit-logs', auditRoutes);
    app.use('/api/v1/dashboard', dashboardRoutes);
    app.use('/api/v1/tickets', ticketRoutes);
    app.use('/api/v1/billing', billingRoutes);
    app.use('/api/v1/ml', mlRoutes);
    app.use('/api/v1/modules', moduleRoutes);  // Add this line
    
    // Healthcare module routes
    app.use('/api/v1/healthcare/doctors', doctorRoutes);  // Add this line
    // Add other healthcare routes as needed
    /*
    app.use('/api/v1/healthcare/hospitals', hospitalRoutes);
app.use('/api/v1/healthcare/cases', caseRoutes);
app.use('/api/v1/healthcare/products', productRoutes);
app.use('/api/v1/healthcare/categories', categoryRoutes);
app.use('/api/v1/healthcare/principles', principleRoutes);
app.use('/api/v1/healthcare/departments', departmentRoutes);
    */
    // Tenant plan enforcement middleware
    app.use(enforcePlanLimits);
    
    // Error handling
    app.use(notFound); // 404 handler
    app.use(errorHandler); // Global error handler
    
    // Start server
    const PORT = process.env.PORT || 5001;
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    
    // Initialize Socket.IO
    socketService.init(server);
    
    // Initialize schedulers
    scheduler.initScheduler();
    
    // Handle server shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down server...');
      
      // Close database connections
      await DbConnectionManager.closeAllConnections();
      
      // Close HTTP server
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
    
    return app;
  } catch (error) {
    console.error('Application initialization error:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  initializeApp();
}

// Export for testing
module.exports = app;