// File: backend/tests/audit/export.test.js
const request = require('supertest');
const app = require('../../server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const AuditLog = require('../../models/auditLog.model');
const User = require('../../models/user.model');

describe('Audit Log Export Tests', () => {
  let authToken;
  let userId;
  
  // Before all tests, create a test user and generate a token
  beforeAll(async () => {
    // Create a test user
    const user = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'test-audit@example.com',
      password: 'password123',
      userType: 'master_admin',
      isActive: true
    });
    
    userId = user._id;
    
    // Generate auth token
    authToken = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        userType: user.userType
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // Create some test audit logs
    await AuditLog.create([
      {
        userId: user._id,
        action: 'LOGIN',
        module: 'AUTH',
        description: 'User logged in successfully',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      },
      {
        userId: user._id,
        action: 'CREATE',
        module: 'USER',
        description: 'Created a new user',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      }
    ]);
  });
  
  // After all tests, clean up
  afterAll(async () => {
    await User.deleteOne({ email: 'test-audit@example.com' });
    await AuditLog.deleteMany({ userId });
  });
  
  test('Should export audit logs as CSV', async () => {
    const response = await request(app)
      .get('/api/v1/audit-logs/export')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment; filename=audit-logs');
    
    // Check CSV content
    const csvContent = response.text;
    expect(csvContent).toContain('User,Email,Action,Module,Description');
    expect(csvContent).toContain('Test User');
    expect(csvContent).toContain('LOGIN');
    expect(csvContent).toContain('AUTH');
  });
  
  test('Should filter exported logs by module', async () => {
    const response = await request(app)
      .get('/api/v1/audit-logs/export?module=AUTH')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(response.status).toBe(200);
    
    // Check filtered content
    const csvContent = response.text;
    expect(csvContent).toContain('AUTH');
    expect(csvContent).not.toContain('USER');
  });
  
  test('Should fail without authentication', async () => {
    const response = await request(app)
      .get('/api/v1/audit-logs/export');
    
    expect(response.status).toBe(401);
  });
});