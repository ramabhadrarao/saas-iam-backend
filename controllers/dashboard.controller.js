// File: backend/controllers/dashboard.controller.js
const User = require('../models/user.model');
const Role = require('../models/role.model');
const UserRole = require('../models/userRole.model');
const AuditLog = require('../models/auditLog.model');
const mongoose = require('mongoose');

// Import the socket service
const socketService = require('../utils/socketService');

/**
 * Generate dashboard metrics
 * This is separated from the handler to be reused by the socket service
 */
exports.generateDashboardMetrics = async () => {
  // Get total users count
  const totalUsers = await User.countDocuments();
  
  // Get user growth (this would typically compare with a previous period)
  // For this example, we'll calculate based on users created in the last 7 days
  const lastWeekDate = new Date();
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  
  const newUsers = await User.countDocuments({
    createdAt: { $gte: lastWeekDate }
  });
  
  const userGrowth = totalUsers > 0 ? Math.round((newUsers / totalUsers) * 100) : 0;
  
  // Get custom roles (non-system roles)
  const customRoles = await Role.countDocuments({ isSystemRole: false });
  
  // Get active sessions (from audit logs, as a proxy for actual sessions)
  // Count unique users who logged in within the last 24 hours
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  const activeSessionLogs = await AuditLog.distinct('userId', {
    action: 'LOGIN',
    description: 'User logged in successfully',
    createdAt: { $gte: oneDayAgo }
  });
  
  const activeSessions = activeSessionLogs.length;
  
  // Calculate session increase
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  
  const previousSessionLogs = await AuditLog.distinct('userId', {
    action: 'LOGIN',
    description: 'User logged in successfully',
    createdAt: { $gte: twoDaysAgo, $lt: oneDayAgo }
  });
  
  const previousSessions = previousSessionLogs.length;
  const sessionIncrease = previousSessions > 0 
    ? Math.round(((activeSessions - previousSessions) / previousSessions) * 100) 
    : 0;
  
  // Get failed login attempts (from audit logs)
  const failedLogins = await AuditLog.countDocuments({ 
    action: 'LOGIN', 
    description: { $regex: 'failed|invalid', $options: 'i' },
    createdAt: { $gte: oneDayAgo }
  });
  
  // Calculate failed login increase
  const previousFailedLogins = await AuditLog.countDocuments({
    action: 'LOGIN',
    description: { $regex: 'failed|invalid', $options: 'i' },
    createdAt: { $gte: twoDaysAgo, $lt: oneDayAgo }
  });
  
  const failedLoginIncrease = previousFailedLogins > 0 
    ? Math.round(((failedLogins - previousFailedLogins) / previousFailedLogins) * 100) 
    : 0;
  
  // Get activity trend (login activity over past week)
  const activityTrend = await getActivityTrend();
  
  // Get user distribution by user type
  const userDistribution = await getUserDistribution();
  
  // Get role usage stats
  const roleUsage = await getRoleUsage();
  
  // Get recent audit logs
  const recentAuditLogs = await getRecentAuditLogs();
  
  return {
    totalUsers,
    userGrowth,
    activeSessions,
    sessionIncrease,
    customRoles,
    failedLogins,
    failedLoginIncrease,
    activityTrend,
    userDistribution,
    roleUsage,
    recentAuditLogs,
    timestamp: new Date()
  };
};

/**
 * Handle GET request for dashboard metrics
 */
exports.getDashboardMetrics = async (req, res) => {
  try {
    const metrics = await exports.generateDashboardMetrics();
    res.status(200).json(metrics);
  } catch (error) {
    console.error('Dashboard metrics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Updates real-time dashboard data
 * This can be called from other parts of the application when data changes
 */
exports.updateDashboardData = async () => {
  try {
    const metrics = await exports.generateDashboardMetrics();
    socketService.emitDashboardUpdate(metrics);
    return true;
  } catch (error) {
    console.error('Error updating dashboard data:', error);
    return false;
  }
};

/**
 * Handle new audit log creation - emit real-time update
 * This should be called after creating a new audit log
 */
exports.handleNewAuditLog = async (log) => {
  // Format the log for frontend display
  const formattedLog = {
    id: log._id,
    userName: log.userName || 'Unknown User',
    action: log.action,
    module: log.module,
    description: log.description,
    createdAt: log.createdAt
  };
  
  // Emit the new log
  socketService.emitAuditLog(formattedLog);
  
  // Also update the dashboard metrics
  exports.updateDashboardData();
};

// Helper function to get activity trend (last 7 days)
async function getActivityTrend() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result = [];
  
  // Get current date
  const today = new Date();
  
  // Loop through last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Start of day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    // End of day
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Count login activities for this day
    const count = await AuditLog.countDocuments({
      action: 'LOGIN',
      description: 'User logged in successfully',
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    
    result.push({
      date: days[date.getDay()],
      count
    });
  }
  
  return result;
}

// Helper function to get user distribution by user type
async function getUserDistribution() {
  const userTypes = ['master_admin', 'tenant_admin', 'tenant_user'];
  const result = [];
  
  // Count users for each user type
  for (const type of userTypes) {
    const count = await User.countDocuments({ userType: type });
    
    let name;
    switch (type) {
      case 'master_admin':
        name = 'Master Admin';
        break;
      case 'tenant_admin':
        name = 'Tenant Admin';
        break;
      case 'tenant_user':
        name = 'Tenant User';
        break;
    }
    
    result.push({
      name,
      value: count
    });
  }
  
  return result;
}

// Helper function to get role usage stats
async function getRoleUsage() {
  // Get all roles
  const roles = await Role.find().select('_id name');
  const result = [];
  
  // Count users for each role
  for (const role of roles) {
    const count = await UserRole.countDocuments({ roleId: role._id });
    
    result.push({
      name: role.name,
      count
    });
  }
  
  // Sort by count (descending)
  return result.sort((a, b) => b.count - a.count).slice(0, 5);
}

// Helper function to get recent audit logs
async function getRecentAuditLogs() {
  return await AuditLog.find()
    .populate('userId', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean()
    .then(logs => logs.map(log => ({
      id: log._id,
      userName: log.userId ? `${log.userId.firstName} ${log.userId.lastName}` : 'Unknown User',
      action: log.action,
      module: log.module,
      description: log.description,
      createdAt: log.createdAt
    })));
}

// File: backend/controllers/dashboard.controller.js
// Add these functions to your existing dashboard controller

/**
 * Get system health metrics
 */
exports.getSystemHealth = async (req, res) => {
  try {
    // Get MongoDB status
    const dbStatus = await mongoose.connection.db.admin().serverStatus();
    
    // Calculate database metrics
    const dbMetrics = {
      version: dbStatus.version,
      uptime: Math.round(dbStatus.uptime / 86400), // days
      connections: dbStatus.connections.current,
      activeConnections: dbStatus.connections.active,
      memoryUsage: Math.round(dbStatus.mem.resident / 1024), // MB
      storageSize: Math.round(dbStatus.mem.virtual / 1024) // MB
    };
    
    // Get server metrics (simplified)
    const serverMetrics = {
      platform: process.platform,
      nodeVersion: process.version,
      cpuUsage: process.cpuUsage(),
      memoryUsage: process.memoryUsage(),
      uptime: Math.round(process.uptime() / 3600) // hours
    };
    
    // Get API metrics
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    
    const apiMetrics = await AuditLog.aggregate([
      { $match: { createdAt: { $gte: oneDayAgo } } },
      { $group: {
        _id: "$module",
        count: { $sum: 1 }
      }}
    ]);
    
    res.status(200).json({
      dbMetrics,
      serverMetrics,
      apiMetrics,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('System health metrics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get tenant comparison metrics
 */
exports.getTenantComparison = async (req, res) => {
  try {
    // Get tenant distribution by plan
    const tenantsByPlan = await Tenant.aggregate([
      { $group: {
        _id: "$plan",
        count: { $sum: 1 }
      }}
    ]);
    
    // Get tenant distribution by status
    const tenantsByStatus = await Tenant.aggregate([
      { $group: {
        _id: "$isActive",
        count: { $sum: 1 }
      }}
    ]);
    
    // Get average users per tenant
    const usersByTenant = await User.aggregate([
      { $match: { tenantId: { $ne: null } } },
      { $group: {
        _id: "$tenantId",
        count: { $sum: 1 }
      }},
      { $group: {
        _id: null,
        avgUsers: { $avg: "$count" },
        maxUsers: { $max: "$count" },
        minUsers: { $min: "$count" }
      }}
    ]);
    
    // Get tenants with most users
    const topTenantsByUsers = await User.aggregate([
      { $match: { tenantId: { $ne: null } } },
      { $group: {
        _id: "$tenantId",
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: {
        from: 'tenants',
        localField: '_id',
        foreignField: '_id',
        as: 'tenant'
      }},
      { $unwind: '$tenant' },
      { $project: {
        tenantName: '$tenant.name',
        userCount: '$count'
      }}
    ]);
    
    res.status(200).json({
      tenantsByPlan,
      tenantsByStatus,
      userAverages: usersByTenant[0] || { avgUsers: 0, maxUsers: 0, minUsers: 0 },
      topTenantsByUsers,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('Tenant comparison metrics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get security metrics
 */
exports.getSecurityMetrics = async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    
    // Get login success vs. failure rates
    const loginMetrics = await AuditLog.aggregate([
      { $match: { 
        module: 'AUTH',
        createdAt: { $gte: oneWeekAgo }
      }},
      { $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          success: { 
            $cond: [
              { $regexMatch: { input: "$description", regex: "successfully" } },
              "success",
              "failure"
            ]
          }
        },
        count: { $sum: 1 }
      }},
      { $sort: { "_id.date": 1 } }
    ]);
    
    // Get recent failed login attempts
    const recentFailedLogins = await AuditLog.find({
      module: 'AUTH',
      description: { $not: /successfully/ },
      createdAt: { $gte: oneDayAgo }
    })
    .populate('userId', 'email')
    .sort({ createdAt: -1 })
    .limit(10);
    
    // Get user password resets
    const passwordResets = await AuditLog.countDocuments({
      module: 'AUTH',
      action: 'RESET',
      createdAt: { $gte: oneWeekAgo }
    });
    
    res.status(200).json({
      loginMetrics: formatLoginMetrics(loginMetrics),
      recentFailedLogins,
      passwordResets,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('Security metrics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Helper function to format login metrics
function formatLoginMetrics(metrics) {
  const result = [];
  const dateMap = {};
  
  // Initialize the map
  metrics.forEach(item => {
    const date = item._id.date;
    if (!dateMap[date]) {
      dateMap[date] = { date, success: 0, failure: 0 };
    }
    
    if (item._id.success === 'success') {
      dateMap[date].success = item.count;
    } else {
      dateMap[date].failure = item.count;
    }
  });
  
  // Convert map to array
  for (const date in dateMap) {
    result.push(dateMap[date]);
  }
  
  return result.sort((a, b) => new Date(a.date) - new Date(b.date));
}