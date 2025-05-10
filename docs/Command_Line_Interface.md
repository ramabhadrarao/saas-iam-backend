# View help
node utils/tenantMigrationTool.js

# Migrate all tenants from shared database to separate databases
node utils/tenantMigrationTool.js migrate-all

# Migrate a specific tenant by subdomain
node utils/tenantMigrationTool.js migrate tenant1

# Validate all tenant databases
node utils/tenantMigrationTool.js validate

# Fix a specific tenant database (recreate if corrupted)
node utils/tenantMigrationTool.js fix tenant1