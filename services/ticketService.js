// File: services/ticketService.js
const Ticket = require('../models/ticket.model');
const TicketSettings = require('../models/ticketSettings.model');
const socketService = require('../utils/socketService');
const emailService = require('../services/emailService');
const User = require('../models/user.model');

/**
 * Ticket management service
 */
class TicketService {
  /**
   * Update SLA status for tickets
   * @param {Array} tickets - Tickets to update
   */
  static async updateSlaStatus(tickets) {
    if (!tickets || tickets.length === 0) return;
    
    const now = new Date();
    const ticketsToSave = [];
    
    for (const ticket of tickets) {
      // Skip already resolved/closed tickets
      if (['resolved', 'closed'].includes(ticket.status)) {
        continue;
      }
      
      let statusChanged = false;
      
      // Check SLA response deadline
      if (ticket.slaResponseDeadline && ticket.slaStatus !== 'breached') {
        if (now > ticket.slaResponseDeadline) {
          if (!ticket.firstResponseTime) {
            // SLA breach for first response
            ticket.slaStatus = 'breached';
            statusChanged = true;
          }
        } else if (now > new Date(ticket.slaResponseDeadline.getTime() - (60 * 60 * 1000))) {
          // Within 1 hour of breach
          if (ticket.slaStatus !== 'warning') {
            ticket.slaStatus = 'warning';
            statusChanged = true;
          }
        }
      }
      
      // Check SLA resolution deadline
      if (ticket.slaResolutionDeadline && ticket.slaStatus !== 'breached') {
        if (now > ticket.slaResolutionDeadline) {
          // SLA breach for resolution
          ticket.slaStatus = 'breached';
          statusChanged = true;
        } else if (now > new Date(ticket.slaResolutionDeadline.getTime() - (4 * 60 * 60 * 1000))) {
          // Within 4 hours of breach
          if (ticket.slaStatus !== 'warning') {
            ticket.slaStatus = 'warning';
            statusChanged = true;
          }
        }
      }
      
      // Add to list for batch update if changed
      if (statusChanged) {
        ticketsToSave.push(ticket);
        
        // Check if we need to send SLA notifications
        if (ticket.slaStatus === 'warning' || ticket.slaStatus === 'breached') {
          // Get notification settings
          const settings = await TicketSettings.findOne({ tenantId: ticket.tenantId })
            || await TicketSettings.findOne({ tenantId: null });
          
          if (settings?.notificationSettings?.notifyOnSlaWarning) {
            await this.sendSlaNotification(ticket, settings);
          }
        }
      }
    }
    
    // Save all modified tickets
    for (const ticket of ticketsToSave) {
      await ticket.save();
    }
  }
  
  /**
   * Send SLA warning/breach notification
   * @param {Object} ticket - The ticket
   * @param {Object} settings - Ticket settings
   */
  static async sendSlaNotification(ticket, settings) {
    try {
      // Notify assigned agent
      if (ticket.assignedTo) {
        const agent = await User.findById(ticket.assignedTo);
        
        if (agent) {
          await emailService.sendTicketNotification({
            to: agent.email,
            subject: `SLA ${ticket.slaStatus === 'warning' ? 'Warning' : 'Breach'}: Ticket ${ticket.title}`,
            templateName: 'ticket-sla-alert',
            templateData: {
              firstName: agent.firstName,
              ticketTitle: ticket.title,
              ticketId: ticket._id,
              status: ticket.status,
              priority: ticket.priority,
              slaStatus: ticket.slaStatus,
              createdAt: ticket.createdAt,
              responseDeadline: ticket.slaResponseDeadline,
              resolutionDeadline: ticket.slaResolutionDeadline
            }
          });
        }
      }
      
      // Notify support managers
      const managers = await User.find({
        userType: 'master_admin',
        isActive: true
        // Additional query for support manager role could be added
      });
      
      for (const manager of managers) {
        // Skip if manager is the assigned agent (already notified)
        if (ticket.assignedTo && manager._id.toString() === ticket.assignedTo.toString()) {
          continue;
        }
        
        await emailService.sendTicketNotification({
          to: manager.email,
          subject: `SLA ${ticket.slaStatus === 'warning' ? 'Warning' : 'Breach'}: Ticket ${ticket.title}`,
          templateName: 'ticket-sla-alert-manager',
          templateData: {
            firstName: manager.firstName,
            ticketTitle: ticket.title,
            ticketId: ticket._id,
            status: ticket.status,
            priority: ticket.priority,
            slaStatus: ticket.slaStatus,
            createdAt: ticket.createdAt,
            responseDeadline: ticket.slaResponseDeadline,
            resolutionDeadline: ticket.slaResolutionDeadline,
            assignedToName: ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : 'Unassigned'
          }
        });
      }
      
      // Real-time notification
      socketService.emitSupportEvent('ticket_sla_alert', {
        ticketId: ticket._id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        slaStatus: ticket.slaStatus
      });
      
    } catch (error) {
      console.error('Error sending SLA notification:', error);
    }
  }
  
  /**
   * Format time span in seconds to human-readable format
   * @param {Number} seconds - Time span in seconds
   * @returns {String} Formatted time span
   */
  static formatTimeSpan(seconds) {
    if (!seconds) return 'N/A';
    
    // Less than a minute
    if (seconds < 60) {
      return `${Math.round(seconds)} seconds`;
    }
    
    // Less than an hour
    if (seconds < 3600) {
      const minutes = Math.round(seconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    
    // Less than a day
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.round((seconds % 3600) / 60);
      
      if (minutes === 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
      }
      
      return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    
    // Days
    const days = Math.floor(seconds / 86400);
    const hours = Math.round((seconds % 86400) / 3600);
    
    if (hours === 0) {
      return `${days} day${days !== 1 ? 's' : ''}`;
    }
    
    return `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  
  /**
   * Run SLA check on all open tickets
   * This method should be called by a scheduler (e.g., cron job)
   */
  static async runSlaCheck() {
    try {
      console.log('Running SLA check for all open tickets...');
      
      // Get all tickets that need SLA monitoring
      const tickets = await Ticket.find({
        status: { $nin: ['resolved', 'closed'] },
        $or: [
          { slaResponseDeadline: { $ne: null } },
          { slaResolutionDeadline: { $ne: null } }
        ]
      });
      
      console.log(`Found ${tickets.length} tickets to check for SLA status`);
      
      // Update SLA status
      await this.updateSlaStatus(tickets);
      
      console.log('SLA check completed');
    } catch (error) {
      console.error('Error running SLA check:', error);
    }
  }
  
  /**
   * Get tenant tickets for dashboard
   * @param {String} tenantId - Tenant ID
   * @returns {Promise<Object>} Ticket stats
   */
  static async getTenantTicketStats(tenantId) {
    try {
      // Get ticket counts by status
      const statusCounts = await Ticket.aggregate([
        { $match: { tenantId: mongoose.Types.ObjectId(tenantId) } },
        { $group: {
          _id: '$status',
          count: { $sum: 1 }
        }}
      ]);
      
      // Get recent tickets
      const recentTickets = await Ticket.find({ tenantId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('assignedTo', 'firstName lastName')
        .select('title status priority createdAt updatedAt');
      
      return {
        statusCounts: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentTickets
      };
    } catch (error) {
      console.error('Error getting tenant ticket stats:', error);
      throw error;
    }
  }
}

module.exports = TicketService;