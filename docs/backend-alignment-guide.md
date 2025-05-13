# Backend Alignment Guide

This guide provides instructions on how to align the frontend components with your existing backend API. The components have been updated to match the API endpoints and data structures used in your backend.

## Overview

Your backend API provides several endpoints for different features:

1. **Authentication** - User login, logout, token refresh, password reset
2. **User Management** - CRUD operations for users, role assignment
3. **Role Management** - CRUD operations for roles, permission assignment
4. **Tenant Management** - CRUD operations for tenants, usage metrics, limits
5. **Audit Logs** - Querying and filtering audit logs, CSV export
6. **Dashboard** - Various metrics for system monitoring

The frontend components have been updated to properly integrate with these endpoints.

## Dashboard Components

The dashboard has been enhanced to utilize all the endpoints provided by your `dashboard.controller.js`, including:

- `/api/v1/dashboard/metrics` - General dashboard metrics
- `/api/v1/dashboard/system-health` - System health information
- `/api/v1/dashboard/tenant-comparison` - Tenant comparison data
- `/api/v1/dashboard/security-metrics` - Security-related metrics

### Implementation Steps

1. **Add new service file**:
   - Place `dashboard.service.js` in the `src/services/` directory

2. **Add new widget components**:
   - Place the following components in `src/components/dashboard/`:
     - `AuditLogWidget.js`
     - `SystemHealthWidget.js`
     - `SecurityMetricsWidget.js`
     - `TenantComparisonWidget.js`

3. **Replace Dashboard component**:
   - Update `src/pages/dashboard/Dashboard.js` with the enhanced version

## Audit Logs Components

The audit logs system has been enhanced to fully utilize the endpoints provided by your `audit.controller.js`:

- `/api/v1/audit-logs` - Get audit logs with filtering and pagination
- `/api/v1/audit-logs/export` - Export audit logs to CSV

### Implementation Steps

1. **Add new service file**:
   - Place `audit.service.js` in the `src/services/` directory

2. **Add reusable components**:
   - Create `src/components/auditing/` directory
   - Place `AuditLogTable.js` in this directory

3. **Add custom hook**:
   - Create `src/hooks/` directory if it doesn't exist
   - Place `useAuditLogs.js` in this directory

4. **Replace Audit Logs page**:
   - Update `src/pages/auditing/AuditLogs.js` with the enhanced version

## API Service Integration

Some of the existing API services need to be updated to align with the backend endpoints:

### Implementation Steps

1. **Update `api.service.js`**:
   - Ensure the audit log endpoints are properly defined
   - Add dashboard API endpoints if not already present

2. **Check `auth.service.js`**:
   - Verify tenant-specific login functionality is implemented
   - Ensure password reset flow matches the backend

## Permission Handling

Your backend includes a permission-based access control system. The frontend components have been updated to respect these permissions:

- Components check for relevant permissions using `hasPermission()`
- Master admin users have special privileges

### Implementation Steps

1. **Verify AuthContext**:
   - Ensure `src/contexts/AuthContext.js` includes proper permission checking
   - Make sure tenant context is properly handled

## Tenant Management Integration

The tenant management components should align with your backend's tenant operations:

- Tenant CRUD operations
- Tenant suspension/restoration
- Usage metrics and limits

### Implementation Steps

1. **Verify `TenantLimitsPanel.js`**:
   - Ensure it correctly calls your backend's tenant limit endpoints
   - Check that it displays the right plan information

2. **Check `TenantDetail.js` and `TenantManagement.js`**:
   - Verify they use the correct backend endpoints
   - Ensure they handle tenant suspension/restoration correctly

## Testing Your Integration

After implementing these changes, test the following scenarios:

1. **Authentication**:
   - Login with tenant context
   - Password reset flow
   - Token refresh

2. **Dashboard**:
   - Check that all widgets load properly
   - Verify data updates on refresh
   - Test permission-based visibility

3. **Audit Logs**:
   - Test filtering and search
   - Verify CSV export
   - Check pagination

4. **Tenants**:
   - Create a new tenant
   - Update tenant information
   - Test suspension and restoration
   - Verify usage metrics display

## Common Issues and Solutions

### API Endpoints Don't Match

If you encounter 404 errors, it might be because the API endpoints in the frontend don't match the backend:

```javascript
// Check the API URL configuration in src/config.js
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
```

Verify that this matches your backend server's address and port.

### Authentication Issues

If you face authentication problems, verify the JWT handling:

```javascript
// In your AuthContext.js
const token = localStorage.getItem('token');
axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
```

Make sure this matches the authentication mechanism expected by your backend.

### Data Structure Mismatches

If components don't render correctly, it might be due to mismatches in data structure:

1. Check the response structure in your backend controller
2. Compare it with what the frontend components expect
3. Adjust the formatters in components if needed

## Conclusion

This guide should help you align the frontend components with your backend API. If you encounter any issues during integration, refer to the appropriate controller files in your backend to verify the expected request and response formats.

Remember that all components have been designed to be adaptable, so you can modify them to fit your specific requirements without changing the overall architecture.