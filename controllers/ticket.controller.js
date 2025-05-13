// File: controllers/ticket.controller.js
const Ticket = require('../models/ticket.model');
const TicketSettings = require('../models/ticketSettings.model');
const User = require('../models/user.model');
const Tenant = require('../models/tenant.model');
const { createAuditLog } = require('../utils/auditLogger');
const emailService = require('../services/emailService');
const ticketService = require('../services/ticketService');
const socketService = require('../utils/socketService');
const DbConnectionManager = require('../services/dbConnectionManager');
const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');

// Create a new support ticket
exports.createTicket = async (req, res) => {
  try {
    const { title, description, priority, category, tags = [] } = req.body;
    
    // Determine tenant context
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context is required for creating a ticket' });
    }
    
    // Find tenant
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Get tenant settings or default settings
    const settings = await TicketSettings.findOne({ tenantId }) 
      || await TicketSettings.findOne({ tenantId: null });
    
    // Create the ticket in master database
    const ticket = new Ticket({
      title,
      description,
      priority: priority || 'medium',
      category,
      tenantId,
      createdBy: req.user.id,
      tags
    });
    
    // Apply SLA based on settings
    if (settings && settings.slaLevels && settings.slaLevels.length > 0) {
      const slaLevel = settings.slaLevels.find(level => level.priority === ticket.priority);
      
      if (slaLevel) {
        const now = new Date();
        
        // Set response deadline
        if (slaLevel.responseTime) {
          ticket.slaResponseDeadline = new Date(now.getTime() + (slaLevel.responseTime * 60 * 1000));
          ticket.slaStatus = 'within_sla';
        }
        
        // Set resolution deadline
        if (slaLevel.resolutionTime) {
          ticket.slaResolutionDeadline = new Date(now.getTime() + (slaLevel.resolutionTime * 60 * 1000));
        }
      }
    }
    
    // Handle auto-assignment
    if (settings && settings.autoAssignmentRules && settings.autoAssignmentRules.enabled) {
      if (settings.autoAssignmentRules.assignmentStrategy === 'round_robin' && 
          settings.autoAssignmentRules.defaultAssignees.length > 0) {
        // Simple round-robin assignment for demonstration
        const assignees = settings.autoAssignmentRules.defaultAssignees;
        
        // Get count of tickets assigned to each assignee
        const assigneeCounts = await Promise.all(
          assignees.map(async assigneeId => {
            const count = await Ticket.countDocuments({ 
              assignedTo: assigneeId,
              status: { $in: ['open', 'in_progress'] }
            });
            return { assigneeId, count };
          })
        );
        
        // Assign to the assignee with the fewest open tickets
        const leastBusyAssignee = assigneeCounts.sort((a, b) => a.count - b.count)[0];
        ticket.assignedTo = leastBusyAssignee.assigneeId;
      }
    }
    
    await ticket.save();
    
    // Create tenant-side reference record
    const tenantConnection = await DbConnectionManager.getTenantConnection(tenantId);
    const TicketReference = tenantConnection.model('TicketReference');
    
    await TicketReference.create({
      masterTicketId: ticket._id.toString(),
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      createdBy: req.user.id
    });
    
    // Log ticket creation
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      module: 'TICKET',
      description: `Created ticket: ${ticket.title}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId
    });
    
    // Send notifications
    if (settings?.notificationSettings?.notifyOnTicketCreation) {
      // Email to tenant admin
      const adminUsers = await User.find({ 
        tenantId, 
        userType: 'tenant_admin', 
        isActive: true 
      }).select('email firstName lastName');
      
      for (const admin of adminUsers) {
        await emailService.sendTicketNotification({
          to: admin.email,
          subject: `New Support Ticket Created: ${ticket.title}`,
          templateName: 'ticket-created',
          templateData: {
            firstName: admin.firstName,
            ticketTitle: ticket.title,
            ticketId: ticket._id,
            ticketDescription: ticket.description,
            ticketPriority: ticket.priority,
            ticketCategory: ticket.category,
            createdAt: ticket.createdAt
          }
        });
      }
      
      // Email to support staff
      const supportUsers = await User.find({ 
        userType: 'master_admin', 
        isActive: true 
      }).select('email firstName lastName');
      
      for (const support of supportUsers) {
        await emailService.sendTicketNotification({
          to: support.email,
          subject: `New Support Ticket: ${ticket.title} from ${tenant.name}`,
          templateName: 'ticket-created-staff',
          templateData: {
            firstName: support.firstName,
            ticketTitle: ticket.title,
            ticketId: ticket._id,
            tenantName: tenant.name,
            ticketDescription: ticket.description,
            ticketPriority: ticket.priority,
            ticketCategory: ticket.category,
            createdAt: ticket.createdAt
          }
        });
      }
    }
    
    // Real-time notification
    socketService.emitTenantEvent('ticket_created', tenantId, {
      ticketId: ticket._id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority
    });
    
    res.status(201).json({
      message: 'Ticket created successfully',
      ticket: {
        id: ticket._id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        createdAt: ticket.createdAt
      }
    });
    
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all tickets with filtering
exports.getTickets = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      priority, 
      category,
      search,
      assignedTo,
      createdBy,
      fromDate,
      toDate,
      slaStatus
    } = req.query;
    
    // Build query based on filters
    const query = {};
    
    // For master admin, show all tickets unless filtered
    // For tenant admin/user, only show their tenant's tickets
    if (req.user.userType !== 'master_admin') {
      query.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      query.tenantId = req.query.tenantId;
    }
    
    // Apply filters
    if (status) {
      query.status = status;
    }
    
    if (priority) {
      query.priority = priority;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (assignedTo) {
      query.assignedTo = assignedTo;
    }
    
    if (createdBy) {
      query.createdBy = createdBy;
    }
    
    if (slaStatus) {
      query.slaStatus = slaStatus;
    }
    
    // Date range filter
    if (fromDate || toDate) {
      query.createdAt = {};
      
      if (fromDate) {
        query.createdAt.$gte = new Date(fromDate);
      }
      
      if (toDate) {
        // Set end date to end of day
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endOfDay;
      }
    }
    
    // Search in title and description
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    // Get tickets with pagination
    const tickets = await Ticket.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('tenantId', 'name subdomain')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
    // Get total count for pagination
    const total = await Ticket.countDocuments(query);
    
    // Calculate SLA metrics for any tickets that need updating
    await ticketService.updateSlaStatus(tickets);
    
    res.status(200).json({
      tickets,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get a ticket by ID
exports.getTicketById = async (req, res) => {
  try {
    const ticketId = req.params.id;
    
    const ticket = await Ticket.findById(ticketId)
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('tenantId', 'name subdomain')
      .populate('comments.userId', 'firstName lastName email userType');
    
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    // Security check: Only allow access to ticket if:
    // 1. User is a master admin, or
    // 2. User belongs to the tenant that created the ticket
    if (req.user.userType !== 'master_admin' && 
        (!req.user.tenantId || req.user.tenantId.toString() !== ticket.tenantId._id.toString())) {
      return res.status(403).json({ message: 'Not authorized to access this ticket' });
    }
    
    // Update SLA status if needed
    await ticketService.updateSlaStatus([ticket]);
    
    // Reset unread count in tenant reference (if tenant user)
    if (req.user.tenantId && req.user.tenantId.toString() === ticket.tenantId._id.toString()) {
      const tenantConnection = await DbConnectionManager.getTenantConnection(req.user.tenantId);
      const TicketReference = tenantConnection.model('TicketReference');
      
      await TicketReference.updateOne(
        { masterTicketId: ticket._id.toString() },
        { unreadCount: 0 }
      );
    }
    
    res.status(200).json({ ticket });
    
  } catch (error) {
    console.error('Get ticket by ID error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update a ticket
exports.updateTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { 
      status, 
      priority, 
      category, 
      assignedTo,
      title,
      description,
      tags
    } = req.body;
    
    const ticket = await Ticket.findById(ticketId);
    
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    // Security check: Only allow access to update ticket if:
    // 1. User is a master admin, or
    // 2. User is from the tenant and ticket status is not resolved/closed
    const isMasterAdmin = req.user.userType === 'master_admin';
    const isTenantUser = req.user.tenantId && 
                        req.user.tenantId.toString() === ticket.tenantId.toString();
    
    if (!isMasterAdmin && !isTenantUser) {
      return res.status(403).json({ message: 'Not authorized to update this ticket' });
    }
    
    // Tenant users can only update certain fields when ticket is not resolved/closed
    if (isTenantUser && ['resolved', 'closed'].includes(ticket.status)) {
      if (status && status !== ticket.status) {
        if (status === 'open') {
          // Allow reopening a ticket
          ticket.status = 'open';
          ticket.resolvedAt = null;
          ticket.closedAt = null;
          
          // Add system comment about reopening
          ticket.comments.push({
            userId: req.user.id,
            content: 'Ticket reopened by tenant',
            isInternal: false,
            createdAt: new Date()
          });
        } else {
          return res.status(403).json({ 
            message: 'Cannot change the status of a resolved or closed ticket' 
          });
        }
      } else {
        return res.status(403).json({ 
          message: 'Cannot update a resolved or closed ticket' 
        });
      }
    } else {
      // Allow fuller update permissions for master admins or open tickets
      
      // Update basic info
      if (title) ticket.title = title;
      if (description) ticket.description = description;
      if (category) ticket.category = category;
      if (tags) ticket.tags = tags;
      
      // Capture old status for comparison
      const oldStatus = ticket.status;
      
      // Master admins can change status and assigned user
      if (isMasterAdmin) {
        if (priority) ticket.priority = priority;
        
        if (assignedTo) {
          const previouslyUnassigned = !ticket.assignedTo;
          ticket.assignedTo = assignedTo;
          
          // If this is the first assignment, record first response time
          if (previouslyUnassigned && !ticket.firstResponseTime) {
            const creationTime = new Date(ticket.createdAt).getTime();
            const now = new Date().getTime();
            ticket.firstResponseTime = Math.floor((now - creationTime) / 1000);
          }
          
          // Add system comment about assignment
          ticket.comments.push({
            userId: req.user.id,
            content: `Ticket assigned to support agent`,
            isInternal: true,
            createdAt: new Date()
          });
        }
        
        if (status && status !== oldStatus) {
          ticket.status = status;
          
          // Set timestamps for resolved or closed status
          if (status === 'resolved' && !ticket.resolvedAt) {
            ticket.resolvedAt = new Date();
          } else if (status === 'closed' && !ticket.closedAt) {
            ticket.closedAt = new Date();
          }
          
          // Add system comment about status change
          ticket.comments.push({
            userId: req.user.id,
            content: `Status changed from ${oldStatus} to ${status}`,
            isInternal: true,
            createdAt: new Date()
          });
        }
      }
    }
    
    await ticket.save();
    
    // Update tenant-side reference record
    const tenantConnection = await DbConnectionManager.getTenantConnection(ticket.tenantId);
    const TicketReference = tenantConnection.model('TicketReference');
    
    await TicketReference.updateOne(
      { masterTicketId: ticket._id.toString() },
      { 
        status: ticket.status,
        priority: ticket.priority,
        title: ticket.title,
        lastUpdated: new Date(),
        // If master admin updated, increment unread count for tenant
        $inc: { unreadCount: isMasterAdmin ? 1 : 0 }
      }
    );
    
    // Log ticket update
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'TICKET',
      description: `Updated ticket: ${ticket.title}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId || null
    });
    
    // Handle notifications for status changes
    if (status && status !== oldStatus) {
      // Get ticket settings
      const settings = await TicketSettings.findOne({ tenantId: ticket.tenantId }) 
        || await TicketSettings.findOne({ tenantId: null });
      
      // Send status change notification if enabled
      if (settings?.notificationSettings?.notifyOnStatusChange) {
        // Fetch tenant information
        const tenant = await Tenant.findById(ticket.tenantId);
        
        // Email to tenant users
        if (tenant) {
          // Get tenant connection to find tenant users
          const tenantConnection = await DbConnectionManager.getTenantConnection(tenant._id);
          const TenantUser = tenantConnection.model('User');
          
          const tenantUsers = await TenantUser.find({ 
            isActive: true 
          }).select('email firstName lastName');
          
          for (const user of tenantUsers) {
            await emailService.sendTicketNotification({
              to: user.email,
              subject: `Ticket Status Changed: ${ticket.title}`,
              templateName: 'ticket-status-changed',
              templateData: {
                firstName: user.firstName,
                ticketTitle: ticket.title,
                ticketId: ticket._id,
                oldStatus,
                newStatus: status,
                updatedAt: new Date()
              }
            });
          }
        }
        
        // Email to assigned support agent
        if (ticket.assignedTo) {
          const assignedUser = await User.findById(ticket.assignedTo)
            .select('email firstName lastName');
          
          if (assignedUser) {
            await emailService.sendTicketNotification({
              to: assignedUser.email,
              subject: `Ticket Status Changed: ${ticket.title}`,
              templateName: 'ticket-status-changed-staff',
              templateData: {
                firstName: assignedUser.firstName,
                ticketTitle: ticket.title,
                ticketId: ticket._id,
                tenantName: tenant ? tenant.name : 'Unknown Tenant',
                oldStatus,
                newStatus: status,
                updatedAt: new Date()
              }
            });
          }
        }
      }
      
      // Real-time notification
      socketService.emitTenantEvent('ticket_updated', ticket.tenantId, {
        ticketId: ticket._id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        previousStatus: oldStatus
      });
    }
    
    res.status(200).json({
      message: 'Ticket updated successfully',
      ticket
    });
    
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Add comment to a ticket
exports.addComment = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { content, isInternal = false } = req.body;
    
    const ticket = await Ticket.findById(ticketId);
    
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    // Security check: Only allow comment if:
    // 1. User is a master admin, or
    // 2. User belongs to the tenant that created the ticket
    const isMasterAdmin = req.user.userType === 'master_admin';
    const isTenantUser = req.user.tenantId && 
                        req.user.tenantId.toString() === ticket.tenantId.toString();
    
    if (!isMasterAdmin && !isTenantUser) {
      return res.status(403).json({ message: 'Not authorized to comment on this ticket' });
    }
    
    // Tenant users can't add internal comments
    if (isTenantUser && isInternal) {
      return res.status(403).json({ message: 'Tenant users cannot add internal comments' });
    }
    
    // Master admin commenting for the first time - update first response time
    if (isMasterAdmin && !ticket.firstResponseTime && ticket.status === 'open') {
      const creationTime = new Date(ticket.createdAt).getTime();
      const now = new Date().getTime();
      ticket.firstResponseTime = Math.floor((now - creationTime) / 1000);
      
      // Update status to in_progress if still open
      ticket.status = 'in_progress';
    }
    
    // Add the comment
    const comment = {
      userId: req.user.id,
      content,
      isInternal,
      createdAt: new Date()
    };
    
    ticket.comments.push(comment);
    
    // Update ticket's updatedAt timestamp
    ticket.updatedAt = new Date();
    
    await ticket.save();
    
    // Update tenant-side reference
    const tenantConnection = await DbConnectionManager.getTenantConnection(ticket.tenantId);
    const TicketReference = tenantConnection.model('TicketReference');
    
    await TicketReference.updateOne(
      { masterTicketId: ticket._id.toString() },
      { 
        lastUpdated: new Date(),
        // If master admin commented, increment unread count for tenant
        $inc: { unreadCount: isMasterAdmin ? 1 : 0 }
      }
    );
    
    // Log the comment
    await createAuditLog({
      userId: req.user.id,
      action: 'COMMENT',
      module: 'TICKET',
      description: `Added comment to ticket: ${ticket.title}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId || null
    });
    
    // Get ticket settings
    const settings = await TicketSettings.findOne({ tenantId: ticket.tenantId }) 
      || await TicketSettings.findOne({ tenantId: null });
    
    // Send notification about new comment if enabled
    if (settings?.notificationSettings?.notifyOnTicketComment && !isInternal) {
      // Fetch tenant information
      const tenant = await Tenant.findById(ticket.tenantId);
      
      // If comment from support, notify tenant users
      if (isMasterAdmin) {
        // Get tenant connection to find tenant users
        const tenantConnection = await DbConnectionManager.getTenantConnection(tenant._id);
        const TenantUser = tenantConnection.model('User');
        
       // File: controllers/ticket.controller.js (continued)
        const tenantUsers = await TenantUser.find({ 
          isActive: true 
        }).select('email firstName lastName');
        
        for (const user of tenantUsers) {
          await emailService.sendTicketNotification({
            to: user.email,
            subject: `New Comment on Ticket: ${ticket.title}`,
            templateName: 'ticket-comment-added',
            templateData: {
              firstName: user.firstName,
              ticketTitle: ticket.title,
              ticketId: ticket._id,
              commentContent: content,
              commentAuthor: `${req.user.firstName} ${req.user.lastName} (Support)`,
              commentDate: new Date()
            }
          });
        }
      }
      // If comment from tenant, notify support staff
      else if (isTenantUser) {
        // Notify assigned support agent
        if (ticket.assignedTo) {
          const assignedUser = await User.findById(ticket.assignedTo)
            .select('email firstName lastName');
          
          if (assignedUser) {
            await emailService.sendTicketNotification({
              to: assignedUser.email,
              subject: `New Comment on Ticket: ${ticket.title}`,
              templateName: 'ticket-comment-added-staff',
              templateData: {
                firstName: assignedUser.firstName,
                ticketTitle: ticket.title,
                ticketId: ticket._id,
                tenantName: tenant ? tenant.name : 'Unknown Tenant',
                commentContent: content,
                commentAuthor: `${req.user.firstName} ${req.user.lastName} (Tenant)`,
                commentDate: new Date()
              }
            });
          }
        }
        
        // Also notify support managers
        const supportManagers = await User.find({
          userType: 'master_admin',
          isActive: true,
          // Additional query to find users with support manager role could be added here
        }).select('email firstName lastName');
        
        for (const manager of supportManagers) {
          // Skip if this is the assigned agent (already notified)
          if (ticket.assignedTo && manager._id.toString() === ticket.assignedTo.toString()) {
            continue;
          }
          
          await emailService.sendTicketNotification({
            to: manager.email,
            subject: `New Tenant Comment on Ticket: ${ticket.title}`,
            templateName: 'ticket-comment-added-staff',
            templateData: {
              firstName: manager.firstName,
              ticketTitle: ticket.title,
              ticketId: ticket._id,
              tenantName: tenant ? tenant.name : 'Unknown Tenant',
              commentContent: content,
              commentAuthor: `${req.user.firstName} ${req.user.lastName} (Tenant)`,
              commentDate: new Date()
            }
          });
        }
      }
    }
    
    // Real-time notification
    const commentWithUser = {
      _id: ticket.comments[ticket.comments.length - 1]._id,
      userId: {
        _id: req.user.id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email
      },
      content,
      isInternal,
      createdAt: new Date()
    };
    
    socketService.emitTenantEvent('ticket_comment_added', ticket.tenantId, {
      ticketId: ticket._id,
      title: ticket.title,
      comment: commentWithUser
    });
    
    // Also broadcast to support staff if comment is from tenant
    if (isTenantUser) {
      socketService.emitSupportEvent('ticket_comment_added', {
        ticketId: ticket._id,
        tenantId: ticket.tenantId,
        title: ticket.title,
        comment: commentWithUser
      });
    }
    
    res.status(201).json({
      message: 'Comment added successfully',
      comment: commentWithUser
    });
    
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get ticket metrics and statistics
exports.getTicketMetrics = async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
    const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
    
    // Set default date range if not provided (last 30 days)
    const endDate = toDate || new Date();
    const startDate = fromDate || new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    // Base query with date range
    const baseQuery = {
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    };
    
    // Add tenant filter if provided and user is not a tenant user
    if (req.user.userType === 'master_admin' && tenantId) {
      baseQuery.tenantId = mongoose.Types.ObjectId(tenantId);
    } else if (req.user.userType !== 'master_admin') {
      // Tenant users can only see their own tickets
      baseQuery.tenantId = req.user.tenantId;
    }
    
    // Get ticket counts by status
    const statusCounts = await Ticket.aggregate([
      { $match: baseQuery },
      { $group: {
        _id: '$status',
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Get ticket counts by priority
    const priorityCounts = await Ticket.aggregate([
      { $match: baseQuery },
      { $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Get ticket counts by category
    const categoryCounts = await Ticket.aggregate([
      { $match: baseQuery },
      { $group: {
        _id: '$category',
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Get tickets created per day
    const ticketsPerDay = await Ticket.aggregate([
      { $match: baseQuery },
      { $group: {
        _id: { 
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } 
        },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Calculate average resolution time
    const resolutionTimeQuery = {
      ...baseQuery,
      status: { $in: ['resolved', 'closed'] },
      resolvedAt: { $ne: null }
    };
    
    const resolutionTimes = await Ticket.aggregate([
      { $match: resolutionTimeQuery },
      { $project: {
        resolutionTime: { 
          $divide: [
            { $subtract: ['$resolvedAt', '$createdAt'] },
            1000 // Convert ms to seconds
          ]
        }
      }},
      { $group: {
        _id: null,
        average: { $avg: '$resolutionTime' },
        min: { $min: '$resolutionTime' },
        max: { $max: '$resolutionTime' }
      }}
    ]);
    
    // Calculate first response time
    const responseTimeQuery = {
      ...baseQuery,
      firstResponseTime: { $ne: null }
    };
    
    const responseTimes = await Ticket.aggregate([
      { $match: responseTimeQuery },
      { $group: {
        _id: null,
        average: { $avg: '$firstResponseTime' },
        min: { $min: '$firstResponseTime' },
        max: { $max: '$firstResponseTime' }
      }}
    ]);
    
    // SLA compliance stats
    const slaStats = await Ticket.aggregate([
      { $match: baseQuery },
      { $group: {
        _id: '$slaStatus',
        count: { $sum: 1 }
      }}
    ]);
    
    // Format result object
    const metrics = {
      ticketsByStatus: statusCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      ticketsByPriority: priorityCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      ticketsByCategory: categoryCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      ticketsPerDay: ticketsPerDay.map(item => ({
        date: item._id,
        count: item.count
      })),
      resolutionTime: resolutionTimes.length > 0 ? {
        average: Math.round(resolutionTimes[0].average),
        min: Math.round(resolutionTimes[0].min),
        max: Math.round(resolutionTimes[0].max),
        // Convert to human-readable format
        averageFormatted: ticketService.formatTimeSpan(resolutionTimes[0].average)
      } : null,
      responseTime: responseTimes.length > 0 ? {
        average: Math.round(responseTimes[0].average),
        min: Math.round(responseTimes[0].min),
        max: Math.round(responseTimes[0].max),
        // Convert to human-readable format
        averageFormatted: ticketService.formatTimeSpan(responseTimes[0].average)
      } : null,
      slaCompliance: slaStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      dateRange: {
        from: startDate,
        to: endDate
      },
      totalTickets: await Ticket.countDocuments(baseQuery)
    };
    
    res.status(200).json({ metrics });
    
  } catch (error) {
    console.error('Get ticket metrics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Manage ticket settings
exports.getTicketSettings = async (req, res) => {
  try {
    const tenantId = req.query.tenantId || (req.user.tenantId || null);
    
    // Get tenant-specific settings or fallback to global settings
    let settings = await TicketSettings.findOne({ tenantId });
    
    // If no tenant-specific settings and user is a master admin requesting global settings
    if (!settings && (!tenantId || req.user.userType === 'master_admin')) {
      settings = await TicketSettings.findOne({ tenantId: null });
    }
    
    // If still no settings, return default settings
    if (!settings) {
      settings = {
        slaLevels: [
          { priority: 'low', responseTime: 1440, resolutionTime: 10080 }, // 24h response, 7 days resolution
          { priority: 'medium', responseTime: 480, resolutionTime: 2880 }, // 8h response, 2 days resolution
          { priority: 'high', responseTime: 240, resolutionTime: 1440 }, // 4h response, 1 day resolution
          { priority: 'critical', responseTime: 60, resolutionTime: 480 } // 1h response, 8h resolution
        ],
        autoAssignmentRules: {
          enabled: false,
          assignmentStrategy: 'none',
          defaultAssignees: []
        },
        categories: [
          { name: 'technical', description: 'Technical issues', isActive: true },
          { name: 'billing', description: 'Billing and payment issues', isActive: true },
          { name: 'account', description: 'Account management', isActive: true },
          { name: 'feature_request', description: 'Feature requests', isActive: true },
          { name: 'other', description: 'Other inquiries', isActive: true }
        ],
        notificationSettings: {
          notifyOnTicketCreation: true,
          notifyOnTicketAssignment: true,
          notifyOnTicketComment: true,
          notifyOnStatusChange: true,
          notifyOnSlaWarning: true
        }
      };
    }
    
    res.status(200).json({ settings });
    
  } catch (error) {
    console.error('Get ticket settings error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateTicketSettings = async (req, res) => {
  try {
    // Only master admins can update settings
    if (req.user.userType !== 'master_admin') {
      return res.status(403).json({ message: 'Not authorized to update ticket settings' });
    }
    
    const { 
      tenantId,
      slaLevels,
      autoAssignmentRules,
      categories,
      notificationSettings
    } = req.body;
    
    // Find existing settings or create new ones
    let settings = await TicketSettings.findOne({ tenantId: tenantId || null });
    
    if (!settings) {
      settings = new TicketSettings({
        tenantId: tenantId || null
      });
    }
    
    // Update settings
    if (slaLevels) settings.slaLevels = slaLevels;
    if (autoAssignmentRules) settings.autoAssignmentRules = autoAssignmentRules;
    if (categories) settings.categories = categories;
    if (notificationSettings) settings.notificationSettings = notificationSettings;
    
    await settings.save();
    
    // Log settings update
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'TICKET_SETTINGS',
      description: `Updated ticket settings${tenantId ? ' for tenant ' + tenantId : ''}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: tenantId || null
    });
    
    res.status(200).json({
      message: 'Ticket settings updated successfully',
      settings
    });
    
  } catch (error) {
    console.error('Update ticket settings error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};