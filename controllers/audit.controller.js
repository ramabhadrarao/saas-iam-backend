// File: backend/controllers/audit.controller.js
const AuditLog = require('../models/auditLog.model');
const User = require('../models/user.model');
const Tenant = require('../models/tenant.model');
const { createObjectCsvStringifier } = require('csv-writer');

exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 15, search, action, module, startDate, endDate, userId, tenantId } = req.query;
    
    // Build query based on filters
    const query = {};
    
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { ipAddress: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (action) {
      query.action = action;
    }
    
    if (module) {
      query.module = module;
    }
    
    if (userId) {
      query.userId = userId;
    }
    
    if (tenantId) {
      query.tenantId = tenantId;
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      
      if (endDate) {
        // Set end date to end of day
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endOfDay;
      }
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    // Get audit logs with pagination
    const logs = await AuditLog.find(query)
      .populate('userId', 'firstName lastName email')
      .populate('tenantId', 'name')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
    // Get total count for pagination
    const total = await AuditLog.countDocuments(query);
    
    res.status(200).json({
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.exportAuditLogs = async (req, res) => {
  try {
    const { search, action, module, startDate, endDate, userId, tenantId } = req.query;
    
    // Build query based on filters
    const query = {};
    
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { ipAddress: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (action) {
      query.action = action;
    }
    
    if (module) {
      query.module = module;
    }
    
    if (userId) {
      query.userId = userId;
    }
    
    if (tenantId) {
      query.tenantId = tenantId;
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      
      if (endDate) {
        // Set end date to end of day
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endOfDay;
      }
    }
    
    // Get all matching audit logs
    const logs = await AuditLog.find(query)
      .populate('userId', 'firstName lastName email')
      .populate('tenantId', 'name')
      .sort({ createdAt: -1 });
    
    // Format logs for CSV
    const csvData = logs.map(log => {
      const userName = log.userId ? 
        `${log.userId.firstName} ${log.userId.lastName}` : 
        'Unknown User';
        
      const userEmail = log.userId ? log.userId.email : 'N/A';
      const tenantName = log.tenantId ? log.tenantId.name : 'N/A';
      
      return {
        'User': userName,
        'Email': userEmail,
        'Action': log.action,
        'Module': log.module,
        'Description': log.description,
        'IP Address': log.ipAddress || 'N/A',
        'User Agent': log.userAgent || 'N/A',
        'Tenant': tenantName,
        'Date/Time': new Date(log.createdAt).toISOString()
      };
    });
    
    // Create CSV stringifier
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'User', title: 'User' },
        { id: 'Email', title: 'Email' },
        { id: 'Action', title: 'Action' },
        { id: 'Module', title: 'Module' },
        { id: 'Description', title: 'Description' },
        { id: 'IP Address', title: 'IP Address' },
        { id: 'User Agent', title: 'User Agent' },
        { id: 'Tenant', title: 'Tenant' },
        { id: 'Date/Time', title: 'Date/Time' }
      ]
    });
    
    // Generate CSV content
    const header = csvStringifier.getHeaderString();
    const records = csvStringifier.stringifyRecords(csvData);
    const csv = header + records;
    
    // Set response headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().slice(0, 10)}.csv`);
    
    // Send CSV
    res.status(200).send(csv);
    
  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};