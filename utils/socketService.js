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

/**
 * Emit a tenant update event
 * @param {string} tenantId - ID of the tenant
 * @param {Object} data - Tenant data to emit
 */
function emitTenantUpdate(tenantId, data) {
  if (!io) return;
  
  // Emit to specific tenant room
  io.to(`tenant-${tenantId}`).emit('tenant-update', data);
}

/**
 * Join a user to tenant-specific room
 * @param {string} socketId - Socket ID
 * @param {string} tenantId - Tenant ID
 */
function joinTenantRoom(socketId, tenantId) {
  if (!io) return;
  
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    socket.join(`tenant-${tenantId}`);
    console.log(`Socket ${socketId} joined tenant room: tenant-${tenantId}`);
  }
}

/**
 * Emit real-time security alert
 * @param {Object} alert - Security alert data
 */
function emitSecurityAlert(alert) {
  if (!io) return;
  
  // Security alerts go to everyone
  io.emit('security-alert', alert);
  
  // If tenant-specific, also send to that tenant's room
  if (alert.tenantId) {
    io.to(`tenant-${alert.tenantId}`).emit('security-alert', alert);
  }
}

/**
 * Setup enhanced socket connections with authentication
 * @param {Object} socket - Socket.IO socket
 */
function setupSocketAuth(socket) {
  // Handle authentication
  socket.on('authenticate', async (token) => {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Store user info on socket
      socket.user = {
        id: decoded.id,
        email: decoded.email,
        userType: decoded.userType,
        tenantId: decoded.tenantId
      };
      
      // Add socket to authenticated room
      socket.join('authenticated');
      
      // If user belongs to a tenant, add to tenant room
      if (decoded.tenantId) {
        socket.join(`tenant-${decoded.tenantId}`);
      }
      
      // Emit successful authentication
      socket.emit('authenticated', { status: 'success' });
      
      console.log(`Socket ${socket.id} authenticated for user ${decoded.email}`);
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('authenticated', { status: 'error', message: 'Invalid token' });
    }
  });
}

// Update init function to use the new authentication
function init(httpServer) {
  io = require('socket.io')(httpServer, {
    cors: {
      origin: '*', // In production, set this to your frontend domain
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Setup authentication
    setupSocketAuth(socket);
    
    // Send initial dashboard data when client connects
    emitDashboardUpdate();
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
  
  console.log('Socket.IO initialized with enhanced features');
  return io;
}
// File: utils/socketService.js (update with ticket-specific methods)

/**
 * Emit a tenant-specific ticket event
 * @param {String} event - Event name
 * @param {String} tenantId - Tenant ID
 * @param {Object} data - Event data
 */
function emitTenantEvent(event, tenantId, data) {
  if (!io) return;
  
  // Emit to the tenant room
  io.to(`tenant-${tenantId}`).emit(event, data);
  
  // Log for debugging
  console.log(`Emitted ${event} to tenant ${tenantId}`);
}

/**
 * Emit a support-specific ticket event
 * @param {String} event - Event name
 * @param {Object} data - Event data
 */
function emitSupportEvent(event, data) {
  if (!io) return;
  
  // Emit to the support staff room
  io.to('support-staff').emit(event, data);
  
  // Log for debugging
  console.log(`Emitted ${event} to support staff`);
}

/**
 * Join a user to the appropriate ticket rooms
 * @param {String} socketId - Socket ID
 * @param {Object} user - User object
 */
function setupTicketRooms(socketId, user) {
  if (!io) return;
  
  const socket = io.sockets.sockets.get(socketId);
  if (!socket) return;
  
  // If user is a master admin, add to support staff room
  if (user.userType === 'master_admin') {
    socket.join('support-staff');
    console.log(`Socket ${socketId} joined support-staff room`);
  }
  
  // If user has a tenant, add to tenant room
  if (user.tenantId) {
    socket.join(`tenant-${user.tenantId}`);
    console.log(`Socket ${socketId} joined tenant-${user.tenantId} room`);
  }
}

// Update the existing setupSocketAuth function
function setupSocketAuth(socket) {
  // Handle authentication
  socket.on('authenticate', async (token) => {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Store user info on socket
      socket.user = {
        id: decoded.id,
        email: decoded.email,
        userType: decoded.userType,
        tenantId: decoded.tenantId
      };
      
      // Add socket to authenticated room
      socket.join('authenticated');
      
      // Setup ticket-specific rooms
      setupTicketRooms(socket.id, socket.user);
      
      // Emit successful authentication
      socket.emit('authenticated', { status: 'success' });
      
      console.log(`Socket ${socket.id} authenticated for user ${decoded.email}`);
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('authenticated', { status: 'error', message: 'Invalid token' });
    }
  });
}



module.exports = {
  init,
  getIO,
  emitDashboardUpdate,
  emitAuditLog,
  emitUserActivity,
  emitSystemAlert,
  emitTenantUpdate,
  joinTenantRoom,
  emitSecurityAlert,
  setupSocketAuth,
   emitTenantEvent,
  emitSupportEvent,
  setupTicketRooms
};