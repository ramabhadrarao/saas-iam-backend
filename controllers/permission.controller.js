// File: backend/controllers/permission.controller.js
const Permission = require('../models/permission.model');

exports.getPermissions = async (req, res) => {
  try {
    const { module } = req.query;
    
    // Build query based on filters
    const query = {};
    
    if (module) {
      query.module = module;
    }
    
    // Get permissions
    const permissions = await Permission.find(query).sort({ module: 1, action: 1 });
    
    res.status(200).json({ permissions });
    
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};