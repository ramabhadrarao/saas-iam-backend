// File: backend/utils/socketService.js
let io;

/**
 * Initialize the Socket.IO service
 * @param {Object} httpServer - The HTTP server instance
 */
function init(httpServer) {
  io = require('socket.io')(httpServer, {
    cors: {
      origin: '*', // In production, set this to your frontend domain
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Send initial dashboard data when client connects
    emitDashboardUpdate();
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
    
    // Optional: Add authentication for socket connections
    socket.on('authenticate', (token) => {
      // Verify JWT token here
      // If valid, add user to a specific room for authorized users
      // socket.join('authenticated');
    });
  });
  
  console.log('Socket.IO initialized');
  return io;
}

/**
 * Get the Socket.IO instance
 * @returns {Object} Socket.IO instance
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
}

/**
 * Emit a dashboard update event to all connected clients
 * @param {Object} data - Dashboard data to emit
 */
async function emitDashboardUpdate(data) {
  if (!io) return;
  
  // If data is not provided, fetch it
  if (!data) {
    const dashboardController = require('../controllers/dashboard.controller');
    data = await dashboardController.generateDashboardMetrics();
  }
  
  io.emit('dashboard-update', data);
}

/**
 * Emit an audit log event to all connected clients
 * @param {Object} log - New audit log entry
 */
function emitAuditLog(log) {
  if (!io) return;
  io.emit('new-audit-log', log);
}

/**
 * Emit a user activity event to all connected clients
 * @param {Object} activity - User activity data
 */
function emitUserActivity(activity) {
  if (!io) return;
  io.emit('user-activity', activity);
}

/**
 * Emit a system alert to all connected clients
 * @param {Object} alert - Alert data
 */
function emitSystemAlert(alert) {
  if (!io) return;
  io.emit('system-alert', alert);
}

module.exports = {
  init,
  getIO,
  emitDashboardUpdate,
  emitAuditLog,
  emitUserActivity,
  emitSystemAlert
};