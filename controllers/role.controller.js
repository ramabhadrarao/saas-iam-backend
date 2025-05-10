// File: backend/controllers/role.controller.js
const Role = require('../models/role.model');
const Permission = require('../models/permission.model');
const UserRole = require('../models/userRole.model');
const { createAuditLog } = require('../utils/auditLogger');

exports.createRole = async (req, res) => {
  try {
    const { name, description, permissions, tenantId } = req.body;
    
    // Check if role with the same name already exists (in the same tenant context)
    const query = { name };
    if (tenantId) query.tenantId = tenantId;
    else query.tenantId = null;
    
    const existingRole = await Role.findOne(query);
    if (existingRole) {
      return res.status(400).json({ message: 'Role with this name already exists' });
    }
    
    // Create new role
    const newRole = new Role({
      name,
      description,
      permissions,
      tenantId: tenantId || null
    });
    
    await newRole.save();
    
    // Log role creation
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      module: 'ROLE',
      description: `Role ${name} created`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });
    
    res.status(201).json({
      message: 'Role created successfully',
      role: newRole
    });
    
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getRoles = async (req, res) => {
  try {
    const { tenantId } = req.query;
    
    // Build query based on filters
    const query = {};
    
    // For tenant-specific roles, only return roles from that tenant
    if (req.user.userType !== 'master_admin') {
      query.$or = [
        { tenantId: req.user.tenantId },
        { isSystemRole: true }
      ];
    } else if (tenantId) {
      query.$or = [
        { tenantId },
        { isSystemRole: true }
      ];
    }
    
    // Get roles
    const roles = await Role.find(query)
      .populate('permissions', 'name description module action')
      .sort({ createdAt: -1 });
      
    res.status(200).json({ roles });
    
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.assignRoleToUser = async (req, res) => {
  try {
    const { userId, roleId } = req.body;
    
    // Check if user exists
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    
    // Check authorization for tenant-specific roles
    if (role.tenantId && 
        req.user.userType !== 'master_admin' && 
        role.tenantId.toString() !== req.user.tenantId) {
      return res.status(403).json({ message: 'Not authorized to assign this role' });
    }
    
    // Check if user-role assignment already exists
    const existingUserRole = await UserRole.findOne({
      userId,
      roleId
    });
    
    if (existingUserRole) {
      return res.status(400).json({ message: 'User already has this role' });
    }
    
    // Create user-role assignment
    const userRole = new UserRole({
      userId,
      roleId,
      tenantId: role.tenantId
    });
    
    await userRole.save();
    
    // Log role assignment
    await createAuditLog({
      userId: req.user.id,
      action: 'ASSIGN',
      module: 'ROLE',
      description: `Role ${role.name} assigned to user ${userId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });
    
    res.status(201).json({
      message: 'Role assigned to user successfully',
      userRole
    });
    
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
// File: backend/controllers/role.controller.js (additional methods)

exports.getRoleById = async (req, res) => {
  try {
    const roleId = req.params.id;
    
    const role = await Role.findById(roleId)
      .populate('permissions', 'name description module action');
    
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    
    res.status(200).json({ role });
    
  } catch (error) {
    console.error('Get role by ID error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const roleId = req.params.id;
    const { name, description, permissions, isSystemRole } = req.body;
    
    const role = await Role.findById(roleId);
    
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    
    // Check if role with the same name already exists (excluding current role)
    if (name && name !== role.name) {
      const query = { 
        name, 
        _id: { $ne: roleId } 
      };
      
      if (role.tenantId) query.tenantId = role.tenantId;
      else query.tenantId = null;
      
      const existingRole = await Role.findOne(query);
      
      if (existingRole) {
        return res.status(400).json({ message: 'Role with this name already exists' });
      }
    }
    
    // Update role fields
    if (name) role.name = name;
    if (description) role.description = description;
    if (permissions) role.permissions = permissions;
    if (isSystemRole !== undefined) role.isSystemRole = isSystemRole;
    
    await role.save();
    
    // Log role update
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'ROLE',
      description: `Role ${role.name} updated`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });
    
    res.status(200).json({
      message: 'Role updated successfully',
      role
    });
    
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const roleId = req.params.id;
    
    const role = await Role.findById(roleId);
    
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    
    // Check if role is a system role
    if (role.isSystemRole) {
      return res.status(400).json({ message: 'Cannot delete system role' });
    }
    
    // Check if role is assigned to any users
    const userRoleCount = await UserRole.countDocuments({ roleId });
    
    if (userRoleCount > 0) {
      return res.status(400).json({ 
        message: 'Role is assigned to users and cannot be deleted',
        count: userRoleCount
      });
    }
    
    // Delete role
    await role.deleteOne();
    
    // Log role deletion
    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE',
      module: 'ROLE',
      description: `Role ${role.name} deleted`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });
    
    res.status(200).json({
      message: 'Role deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};