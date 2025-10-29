# User Management Scripts for Twenty CRM

## Overview

These scripts are designed to help manage user accounts in the Twenty CRM system, particularly for troubleshooting user registration issues and completely removing problematic users.

## Script 1: Check User Script

### Purpose
Verifies if a user exists in all possible locations in the database including core tables and all workspace schemas.

### Script: `check-user.sh`

```bash
#!/bin/bash

# Check User Script for Twenty CRM
# Usage: ./check-user.sh <email>
# Example: ./check-user.sh modesto@codimatic.com

if [ $# -eq 0 ]; then
    echo "Usage: $0 <email>"
    echo "Example: $0 modesto@codimatic.com"
    exit 1
fi

EMAIL="$1"

echo "🔍 Checking user: $EMAIL"
echo "================================"

# Execute comprehensive check
docker exec -it twenty-db-1 psql -U postgres -d default -c "
-- VERIFICACIÓN COMPLETA DE USUARIO: $EMAIL

-- Core tables
SELECT 'core.user' as location, COUNT(*) as count FROM core.\"user\" WHERE email = '$EMAIL'
UNION ALL
SELECT 'core.userWorkspace' as location, COUNT(*) as count FROM core.\"userWorkspace\" WHERE \"userId\" IN (
  SELECT id FROM core.\"user\" WHERE email = '$EMAIL'
)
UNION ALL
SELECT 'core.appToken' as location, COUNT(*) as count FROM core.\"appToken\" WHERE \"value\" ILIKE '%$EMAIL%' OR \"context\"::text ILIKE '%$EMAIL%'
UNION ALL
SELECT 'core.keyValuePair' as location, COUNT(*) as count FROM core.\"keyValuePair\" WHERE \"value\"::text ILIKE '%$EMAIL%'
UNION ALL
-- All workspace schemas
SELECT 'workspace_44jak7mj6zxthd3tozvhwosfr.workspaceMember' as location, COUNT(*) as count 
FROM workspace_44jak7mj6zxthd3tozvhwosfr.\"workspaceMember\" 
WHERE \"userEmail\" = '$EMAIL'
UNION ALL
SELECT 'workspace_2lbgqh9z1g00ok1hazua7di1q.workspaceMember' as location, COUNT(*) as count 
FROM workspace_2lbgqh9z1g00ok1hazua7di1q.\"workspaceMember\" 
WHERE \"userEmail\" = '$EMAIL'
UNION ALL
SELECT 'workspace_7j3u8mcs7ct7q3d03qc037cm2.workspaceMember' as location, COUNT(*) as count 
FROM workspace_7j3u8mcs7ct7q3d03qc037cm2.\"workspaceMember\" 
WHERE \"userEmail\" = '$EMAIL';
"

echo ""
echo "📊 Summary:"
echo "✅ If all counts are 0, user is completely removed"
echo "⚠️  If any count > 0, user still exists in that location"
```

## Script 2: Delete User Script

### Purpose
Completely removes a user from all locations in the database including core tables, workspace schemas, and related records.

### Script: `delete-user.sh`

```bash
#!/bin/bash

# Delete User Script for Twenty CRM
# Usage: ./delete-user.sh <email>
# Example: ./delete-user.sh modesto@codimatic.com
# ⚠️  WARNING: This will permanently delete the user and all related data!

if [ $# -eq 0 ]; then
    echo "Usage: $0 <email>"
    echo "Example: $0 modesto@codimatic.com"
    echo "⚠️  WARNING: This will permanently delete the user and all related data!"
    exit 1
fi

EMAIL="$1"

echo "🗑️  Deleting user: $EMAIL"
echo "==========================="
echo "⚠️  WARNING: This action is irreversible!"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Operation cancelled."
    exit 1
fi

echo "🔍 Finding user ID..."
USER_ID=$(docker exec -it twenty-db-1 psql -U postgres -d default -t -c "
SELECT id FROM core.\"user\" WHERE email = '$EMAIL';
" | tr -d '[:space:]')

if [ -z "$USER_ID" ]; then
    echo "❌ User not found in core.user table"
    exit 1
fi

echo "📋 User ID found: $USER_ID"
echo ""

# Step 1: Delete from workspaceMember tables
echo "🗑️  Step 1: Deleting from workspaceMember tables..."

docker exec -it twenty-db-1 psql -U postgres -d default -c "
DELETE FROM workspace_44jak7mj6zxthd3tozvhwosfr.\"workspaceMember\" 
WHERE \"userEmail\" = '$EMAIL';

DELETE FROM workspace_2lbgqh9z1g00ok1hazua7di1q.\"workspaceMember\" 
WHERE \"userEmail\" = '$EMAIL';

DELETE FROM workspace_7j3u8mcs7ct7q3d03qc037cm2.\"workspaceMember\" 
WHERE \"userEmail\" = '$EMAIL';
"

echo "✅ workspaceMember records deleted"

# Step 2: Delete from userWorkspace
echo "🗑️  Step 2: Deleting from userWorkspace table..."

docker exec -it twenty-db-1 psql -U postgres -d default -c "
DELETE FROM core.\"userWorkspace\" WHERE \"userId\" = '$USER_ID';
"

echo "✅ userWorkspace records deleted"

# Step 3: Delete from appToken
echo "🗑️  Step 3: Deleting from appToken table..."

docker exec -it twenty-db-1 psql -U postgres -d default -c "
DELETE FROM core.\"appToken\" WHERE \"value\" ILIKE '%$EMAIL%' OR \"context\"::text ILIKE '%$EMAIL%';
"

echo "✅ appToken records deleted"

# Step 4: Delete from keyValuePair
echo "🗑️  Step 4: Deleting from keyValuePair table..."

docker exec -it twenty-db-1 psql -U postgres -d default -c "
DELETE FROM core.\"keyValuePair\" WHERE \"value\"::text ILIKE '%$EMAIL%';
"

echo "✅ keyValuePair records deleted"

# Step 5: Delete the user
echo "🗑️  Step 5: Deleting from user table..."

docker exec -it twenty-db-1 psql -U postgres -d default -c "
DELETE FROM core.\"user\" WHERE id = '$USER_ID';
"

echo "✅ User deleted from core.user table"

echo ""
echo "🎉 User deletion completed!"
echo ""

# Verification
echo "🔍 Verifying complete deletion..."
./check-user.sh "$EMAIL"
```

## Script 3: Clean Redis Cache (Optional)

### Purpose
Cleans Redis cache related to a specific user without affecting other users.

### Script: `clean-redis-cache.sh`

```bash
#!/bin/bash

# Clean Redis Cache Script for Twenty CRM
# Usage: ./clean-redis-cache.sh <email>
# Example: ./clean-redis-cache.sh modesto@codimatic.com

if [ $# -eq 0 ]; then
    echo "Usage: $0 <email>"
    echo "Example: $0 modesto@codimatic.com"
    exit 1
fi

EMAIL="$1"

echo "🧹 Cleaning Redis cache for: $EMAIL"
echo "===================================="

# Search for keys related to the user
echo "🔍 Searching for Redis keys related to user..."
KEYS=$(docker exec -it twenty-redis-1 redis-cli --scan --pattern "*$EMAIL*" 2>/dev/null)

if [ -z "$KEYS" ]; then
    echo "✅ No Redis keys found for user: $EMAIL"
else
    echo "🗑️  Found Redis keys, deleting..."
    echo "$KEYS" | while read -r key; do
        if [ -n "$key" ]; then
            echo "  Deleting key: $key"
            docker exec -it twenty-redis-1 redis-cli del "$key" >/dev/null 2>&1
        fi
    done
    echo "✅ Redis cache cleaned for user: $EMAIL"
fi

# Clean workspace permission cache if user was in workspace_44jak7mj6zxthd3tozvhwosfr (Codimatic)
echo "🧹 Cleaning workspace permission cache..."
docker exec -it twenty-redis-1 redis-cli del "engine:workspace:metadata:permissions:user-workspace-role-map:45b16c8b-5e8f-4b64-a6e1-1a7263ac59f7" >/dev/null 2>&1
docker exec -it twenty-redis-1 redis-cli del "engine:workspace:metadata:permissions:user-workspace-role-map-version:45b16c8b-5e8f-4b64-a6e1-1a7263ac59f7" >/dev/null 2>&1

echo "✅ Workspace permission cache cleaned"
echo ""
echo "🎉 Redis cache cleaning completed!"
```

## Usage Instructions

### 1. Make scripts executable
```bash
chmod +x check-user.sh
chmod +x delete-user.sh
chmod +x clean-redis-cache.sh
```

### 2. Check if user exists
```bash
./check-user.sh modesto@codimatic.com
```

### 3. Delete user completely
```bash
./delete-user.sh modesto@codimatic.com
```

### 4. Clean Redis cache (optional)
```bash
./clean-redis-cache.sh modesto@codimatic.com
```

## Important Notes

### ⚠️ Warnings
- **DELETE SCRIPT IS IRREVERSIBLE**: Always check user existence first before deleting
- **BACKUP RECOMMENDED**: Consider backing up the database before running delete operations
- **TEST ENVIRONMENT**: Test scripts in development environment first

### 🔧 Customization
- **Workspace IDs**: Update workspace IDs in scripts if your workspaces are different
- **Additional Tables**: Add more tables to check/delete if your system has customizations
- **Redis Keys**: Add more Redis key patterns if your system uses different caching strategies

### 📋 Workflow
1. Always run `check-user.sh` first to understand user's current state
2. Run `delete-user.sh` to completely remove the user
3. Run `clean-redis-cache.sh` to clear any remaining cache
4. Run `check-user.sh` again to verify complete deletion

### 🐛 Troubleshooting
- **Docker container names**: Update if your containers have different names
- **Database connection**: Ensure PostgreSQL container is running and accessible
- **Permissions**: Ensure scripts have execute permissions
- **PostgreSQL quotes**: The scripts use proper quoting for case-sensitive table names

## File Structure
```
scripts/
├── user-management-scripts.md  # This documentation
├── check-user.sh              # User verification script
├── delete-user.sh             # User deletion script
└── clean-redis-cache.sh       # Redis cache cleaning script
```

## Support

For issues with these scripts:
1. Check Docker container status: `docker ps`
2. Verify database connectivity: `docker exec -it twenty-db-1 psql -U postgres -d default -c "SELECT 1;"`
3. Check Redis connectivity: `docker exec -it twenty-redis-1 redis-cli ping`
4. Review script logs for specific error messages