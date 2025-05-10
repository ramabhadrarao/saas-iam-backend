// File: backend/controllers/dashboard.controller.js
const User = require('../models/user.model');
const Role = require('../models/role.model');
const UserRole = require('../models/userRole.model');
const AuditLog = require('../models/auditLog.model');

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