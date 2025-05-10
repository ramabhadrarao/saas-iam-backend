Multi-Tenant SaaS Platform API Routes with Postman/cURL Examples
Below is a comprehensive guide to the API routes implemented so far in the multi-tenant SaaS platform, organized by module. I've included cURL commands and Postman examples for each endpoint, as well as a sample Tabler UI HTML file for the frontend.
Table of Contents

Authentication Module
User Management Module
Role Management Module
Tenant Management Module
Permission Management Module
Audit Log Module
Dashboard Module
Tabler UI Sample Interface

Authentication Module
Login
Endpoint: POST /api/v1/auth/login
cURL:
bashcurl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin123!"
  }'
Postman:

Method: POST
URL: http://localhost:5001/api/v1/auth/login
Body (raw JSON):

json{
  "email": "admin@example.com",
  "password": "Admin123!"
}
Tenant-Specific Login:
bashcurl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tenant1.com",
    "password": "Admin123!",
    "subdomain": "tenant1"
  }'
Refresh Token
Endpoint: POST /api/v1/auth/refresh-token
cURL:
bashcurl -X POST http://localhost:5001/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your_refresh_token_here"
  }'
Postman:

Method: POST
URL: http://localhost:5001/api/v1/auth/refresh-token
Body (raw JSON):

json{
  "refreshToken": "your_refresh_token_here"
}
Logout
Endpoint: POST /api/v1/auth/logout
cURL:
bashcurl -X POST http://localhost:5001/api/v1/auth/logout \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json"
Postman:

Method: POST
URL: http://localhost:5001/api/v1/auth/logout
Headers:

Authorization: Bearer your_jwt_token_here



Forgot Password
Endpoint: POST /api/v1/auth/forgot-password
cURL:
bashcurl -X POST http://localhost:5001/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com"
  }'
Postman:

Method: POST
URL: http://localhost:5001/api/v1/auth/forgot-password
Body (raw JSON):

json{
  "email": "admin@example.com"
}
Tenant-Specific Forgot Password:
bashcurl -X POST http://localhost:5001/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tenant1.com",
    "subdomain": "tenant1"
  }'
Reset Password
Endpoint: POST /api/v1/auth/reset-password/:token
cURL:
bashcurl -X POST http://localhost:5001/api/v1/auth/reset-password/your_reset_token_here \
  -H "Content-Type: application/json" \
  -d '{
    "password": "NewPassword123!"
  }'
Postman:

Method: POST
URL: http://localhost:5001/api/v1/auth/reset-password/your_reset_token_here
Body (raw JSON):

json{
  "password": "NewPassword123!"
}
Tenant-Specific Reset Password:
bashcurl -X POST http://localhost:5001/api/v1/auth/reset-password/your_reset_token_here \
  -H "Content-Type: application/json" \
  -d '{
    "password": "NewPassword123!",
    "subdomain": "tenant1"
  }'
User Management Module
Create User
Endpoint: POST /api/v1/users
cURL:
bashcurl -X POST http://localhost:5001/api/v1/users \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "Password123!",
    "userType": "tenant_user",
    "tenantId": "tenant_id_here"
  }'
Postman:

Method: POST
URL: http://localhost:5001/api/v1/users
Headers:

Authorization: Bearer your_jwt_token_here


Body (raw JSON):

json{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "Password123!",
  "userType": "tenant_user",
  "tenantId": "tenant_id_here"
}
Get All Users
Endpoint: GET /api/v1/users
cURL:
bashcurl -X GET http://localhost:5001/api/v1/users \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/users
Headers:

Authorization: Bearer your_jwt_token_here



With Pagination and Filtering:
bashcurl -X GET "http://localhost:5001/api/v1/users?page=1&limit=10&userType=tenant_admin" \
  -H "Authorization: Bearer your_jwt_token_here"
Get User by ID
Endpoint: GET /api/v1/users/:id
cURL:
bashcurl -X GET http://localhost:5001/api/v1/users/user_id_here \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/users/user_id_here
Headers:

Authorization: Bearer your_jwt_token_here



Update User
Endpoint: PUT /api/v1/users/:id
cURL:
bashcurl -X PUT http://localhost:5001/api/v1/users/user_id_here \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Smith",
    "isActive": true
  }'
Postman:

Method: PUT
URL: http://localhost:5001/api/v1/users/user_id_here
Headers:

Authorization: Bearer your_jwt_token_here


Body (raw JSON):

json{
  "firstName": "John",
  "lastName": "Smith",
  "isActive": true
}
Get Current User
Endpoint: GET /api/v1/users/me
cURL:
bashcurl -X GET http://localhost:5001/api/v1/users/me \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/users/me
Headers:

Authorization: Bearer your_jwt_token_here



Assign Role to User
Endpoint: POST /api/v1/users/assign-role
cURL:
bashcurl -X POST http://localhost:5001/api/v1/users/assign-role \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_id_here",
    "roleId": "role_id_here"
  }'
Postman:

Method: POST
URL: http://localhost:5001/api/v1/users/assign-role
Headers:

Authorization: Bearer your_jwt_token_here


Body (raw JSON):

json{
  "userId": "user_id_here",
  "roleId": "role_id_here"
}
Remove Role from User
Endpoint: POST /api/v1/users/remove-role
cURL:
bashcurl -X POST http://localhost:5001/api/v1/users/remove-role \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_id_here",
    "roleId": "role_id_here"
  }'
Postman:

Method: POST
URL: http://localhost:5001/api/v1/users/remove-role
Headers:

Authorization: Bearer your_jwt_token_here


Body (raw JSON):

json{
  "userId": "user_id_here",
  "roleId": "role_id_here"
}
Role Management Module
Create Role
Endpoint: POST /api/v1/roles
cURL:
bashcurl -X POST http://localhost:5001/api/v1/roles \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Content Manager",
    "description": "Can manage content",
    "permissions": ["permission_id1", "permission_id2"],
    "tenantId": "tenant_id_here"
  }'
Postman:

Method: POST
URL: http://localhost:5001/api/v1/roles
Headers:

Authorization: Bearer your_jwt_token_here


Body (raw JSON):

json{
  "name": "Content Manager",
  "description": "Can manage content",
  "permissions": ["permission_id1", "permission_id2"],
  "tenantId": "tenant_id_here"
}
Get All Roles
Endpoint: GET /api/v1/roles
cURL:
bashcurl -X GET http://localhost:5001/api/v1/roles \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/roles
Headers:

Authorization: Bearer your_jwt_token_here



With Tenant Filter:
bashcurl -X GET "http://localhost:5001/api/v1/roles?tenantId=tenant_id_here" \
  -H "Authorization: Bearer your_jwt_token_here"
Get Role by ID
Endpoint: GET /api/v1/roles/:id
cURL:
bashcurl -X GET http://localhost:5001/api/v1/roles/role_id_here \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/roles/role_id_here
Headers:

Authorization: Bearer your_jwt_token_here



Update Role
Endpoint: PUT /api/v1/roles/:id
cURL:
bashcurl -X PUT http://localhost:5001/api/v1/roles/role_id_here \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Advanced Content Manager",
    "description": "Can manage all content",
    "permissions": ["permission_id1", "permission_id2", "permission_id3"]
  }'
Postman:

Method: PUT
URL: http://localhost:5001/api/v1/roles/role_id_here
Headers:

Authorization: Bearer your_jwt_token_here


Body (raw JSON):

json{
  "name": "Advanced Content Manager",
  "description": "Can manage all content",
  "permissions": ["permission_id1", "permission_id2", "permission_id3"]
}
Delete Role
Endpoint: DELETE /api/v1/roles/:id
cURL:
bashcurl -X DELETE http://localhost:5001/api/v1/roles/role_id_here \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: DELETE
URL: http://localhost:5001/api/v1/roles/role_id_here
Headers:

Authorization: Bearer your_jwt_token_here



Tenant Management Module
Create Tenant
Endpoint: POST /api/v1/tenants
cURL:
bashcurl -X POST http://localhost:5001/api/v1/tenants \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "subdomain": "acme",
    "plan": "professional",
    "contactEmail": "admin@acme.com",
    "contactPhone": "123-456-7890",
    "address": {
      "street": "123 Main St",
      "city": "Boston",
      "state": "MA",
      "zipCode": "02110",
      "country": "USA"
    },
    "adminEmail": "admin@acme.com",
    "adminFirstName": "John",
    "adminLastName": "Doe",
    "adminPassword": "Admin123!"
  }'
Postman:

Method: POST
URL: http://localhost:5001/api/v1/tenants
Headers:

Authorization: Bearer your_jwt_token_here


Body (raw JSON):

json{
  "name": "Acme Corp",
  "subdomain": "acme",
  "plan": "professional",
  "contactEmail": "admin@acme.com",
  "contactPhone": "123-456-7890",
  "address": {
    "street": "123 Main St",
    "city": "Boston",
    "state": "MA",
    "zipCode": "02110",
    "country": "USA"
  },
  "adminEmail": "admin@acme.com",
  "adminFirstName": "John",
  "adminLastName": "Doe",
  "adminPassword": "Admin123!"
}
Get All Tenants
Endpoint: GET /api/v1/tenants
cURL:
bashcurl -X GET http://localhost:5001/api/v1/tenants \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/tenants
Headers:

Authorization: Bearer your_jwt_token_here



With Filtering:
bashcurl -X GET "http://localhost:5001/api/v1/tenants?page=1&limit=10&plan=professional&isActive=true" \
  -H "Authorization: Bearer your_jwt_token_here"
Get Tenant by ID
Endpoint: GET /api/v1/tenants/:id
cURL:
bashcurl -X GET http://localhost:5001/api/v1/tenants/tenant_id_here \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/tenants/tenant_id_here
Headers:

Authorization: Bearer your_jwt_token_here



Update Tenant
Endpoint: PATCH /api/v1/tenants/:id
cURL:
bashcurl -X PATCH http://localhost:5001/api/v1/tenants/tenant_id_here \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "plan": "enterprise",
    "contactEmail": "newemail@acme.com"
  }'
Postman:

Method: PATCH
URL: http://localhost:5001/api/v1/tenants/tenant_id_here
Headers:

Authorization: Bearer your_jwt_token_here


Body (raw JSON):

json{
  "name": "Acme Corporation",
  "plan": "enterprise",
  "contactEmail": "newemail@acme.com"
}
Suspend Tenant
Endpoint: POST /api/v1/tenants/:id/suspend
cURL:
bashcurl -X POST http://localhost:5001/api/v1/tenants/tenant_id_here/suspend \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Payment overdue"
  }'
Postman:

Method: POST
URL: http://localhost:5001/api/v1/tenants/tenant_id_here/suspend
Headers:

Authorization: Bearer your_jwt_token_here


Body (raw JSON):

json{
  "reason": "Payment overdue"
}
Restore Tenant
Endpoint: POST /api/v1/tenants/:id/restore
cURL:
bashcurl -X POST http://localhost:5001/api/v1/tenants/tenant_id_here/restore \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: POST
URL: http://localhost:5001/api/v1/tenants/tenant_id_here/restore
Headers:

Authorization: Bearer your_jwt_token_here



Delete Tenant
Endpoint: DELETE /api/v1/tenants/:id
cURL:
bashcurl -X DELETE http://localhost:5001/api/v1/tenants/tenant_id_here \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: DELETE
URL: http://localhost:5001/api/v1/tenants/tenant_id_here
Headers:

Authorization: Bearer your_jwt_token_here



Get Tenant Metrics
Endpoint: GET /api/v1/tenants/:id/metrics
cURL:
bashcurl -X GET http://localhost:5001/api/v1/tenants/tenant_id_here/metrics \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/tenants/tenant_id_here/metrics
Headers:

Authorization: Bearer your_jwt_token_here



Get Tenant Usage
Endpoint: GET /api/v1/tenants/:id/usage
cURL:
bashcurl -X GET http://localhost:5001/api/v1/tenants/tenant_id_here/usage \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/tenants/tenant_id_here/usage
Headers:

Authorization: Bearer your_jwt_token_here



Update Tenant Limits
Endpoint: PATCH /api/v1/tenants/:id/limits
cURL:
bashcurl -X PATCH http://localhost:5001/api/v1/tenants/tenant_id_here/limits \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "hasCustomLimits": true,
    "userLimit": 50,
    "storageLimit": 20,
    "apiCallsLimit": 50000
  }'
Postman:

Method: PATCH
URL: http://localhost:5001/api/v1/tenants/tenant_id_here/limits
Headers:

Authorization: Bearer your_jwt_token_here


Body (raw JSON):

json{
  "hasCustomLimits": true,
  "userLimit": 50,
  "storageLimit": 20,
  "apiCallsLimit": 50000
}
Get Tenant Plans
Endpoint: GET /api/v1/tenants/plans
cURL:
bashcurl -X GET http://localhost:5001/api/v1/tenants/plans \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/tenants/plans
Headers:

Authorization: Bearer your_jwt_token_here



Permission Management Module
Get All Permissions
Endpoint: GET /api/v1/permissions
cURL:
bashcurl -X GET http://localhost:5001/api/v1/permissions \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/permissions
Headers:

Authorization: Bearer your_jwt_token_here



With Module Filter:
bashcurl -X GET "http://localhost:5001/api/v1/permissions?module=USER" \
  -H "Authorization: Bearer your_jwt_token_here"
Audit Log Module
Get Audit Logs
Endpoint: GET /api/v1/audit-logs
cURL:
bashcurl -X GET http://localhost:5001/api/v1/audit-logs \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/audit-logs
Headers:

Authorization: Bearer your_jwt_token_here



With Filtering:
bashcurl -X GET "http://localhost:5001/api/v1/audit-logs?page=1&limit=20&module=AUTH&action=LOGIN&startDate=2023-01-01&endDate=2023-12-31" \
  -H "Authorization: Bearer your_jwt_token_here"
Export Audit Logs
Endpoint: GET /api/v1/audit-logs/export
cURL:
bashcurl -X GET http://localhost:5001/api/v1/audit-logs/export \
  -H "Authorization: Bearer your_jwt_token_here" \
  -o audit-logs.csv
Postman:

Method: GET
URL: http://localhost:5001/api/v1/audit-logs/export
Headers:

Authorization: Bearer your_jwt_token_here



With Filtering:
bashcurl -X GET "http://localhost:5001/api/v1/audit-logs/export?module=AUTH&action=LOGIN&startDate=2023-01-01&endDate=2023-12-31" \
  -H "Authorization: Bearer your_jwt_token_here" \
  -o filtered-audit-logs.csv
Dashboard Module
Get Dashboard Metrics
Endpoint: GET /api/v1/dashboard/metrics
cURL:
bashcurl -X GET http://localhost:5001/api/v1/dashboard/metrics \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/dashboard/metrics
Headers:

Authorization: Bearer your_jwt_token_here



Get System Health
Endpoint: GET /api/v1/dashboard/system-health
cURL:
bashcurl -X GET http://localhost:5001/api/v1/dashboard/system-health \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/dashboard/system-health
Headers:

Authorization: Bearer your_jwt_token_here



Get Tenant Comparison
Endpoint: GET /api/v1/dashboard/tenant-comparison
cURL:
bashcurl -X GET http://localhost:5001/api/v1/dashboard/tenant-comparison \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/dashboard/tenant-comparison
Headers:

Authorization: Bearer your_jwt_token_here



Get Security Metrics
Endpoint: GET /api/v1/dashboard/security-metrics
cURL:
bashcurl -X GET http://localhost:5001/api/v1/dashboard/security-metrics \
  -H "Authorization: Bearer your_jwt_token_here"
Postman:

Method: GET
URL: http://localhost:5001/api/v1/dashboard/security-metrics
Headers:

Authorization: Bearer your_jwt_token_here