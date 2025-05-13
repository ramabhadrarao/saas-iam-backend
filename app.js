// app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('./config');
const errorMiddleware = require('./middleware/error.middleware');
const tenantMiddleware = require('./middleware/tenantContext.middleware');

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const tenantRoutes = require('./routes/tenant.routes');
const moduleRoutes = require('./routes/module.routes');
const roleRoutes = require('./routes/role.routes');
const permissionRoutes = require('./routes/permission.routes');
const auditRoutes = require('./routes/audit.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const ticketRoutes = require('./routes/ticket.routes');
const billingRoutes = require('./routes/billing.routes');
const mlRoutes = require('./routes/ml.routes');

// Import healthcare routes
const doctorRoutes = require('./routes/healthcare/doctor.routes');
const hospitalRoutes = require('./routes/healthcare/hospital.routes');
const medicalCaseRoutes = require('./routes/healthcare/medicalCase.routes');
const productRoutes = require('./routes/healthcare/product.routes');
const categoryRoutes = require('./routes/healthcare/category.routes');
const principleRoutes = require('./routes/healthcare/principle.routes');
const departmentRoutes = require('./routes/healthcare/department.routes');

// Import middleware
const { enforcePlanLimits } = require('./middleware/planEnforcement.middleware');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Add tenant context middleware
app.use(tenantMiddleware.tenantContext);

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/roles', roleRoutes);
app.use('/api/v1/permissions', permissionRoutes);
app.use('/api/v1/tenants', tenantRoutes);
app.use('/api/v1/modules', moduleRoutes);
app.use('/api/v1/audit-logs', auditRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/ml', mlRoutes);

// Healthcare routes
app.use('/api/v1/healthcare/doctors', doctorRoutes);
app.use('/api/v1/healthcare/hospitals', hospitalRoutes);
app.use('/api/v1/healthcare/cases', medicalCaseRoutes);
app.use('/api/v1/healthcare/products', productRoutes);
app.use('/api/v1/healthcare/categories', categoryRoutes);
app.use('/api/v1/healthcare/principles', principleRoutes);
app.use('/api/v1/healthcare/departments', departmentRoutes);

// Tenant plan enforcement middleware
app.use(enforcePlanLimits);

// Error handling
app.use(errorMiddleware.notFound);
app.use(errorMiddleware.errorHandler);

module.exports = app;