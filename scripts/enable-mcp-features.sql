-- =====================================================
-- SCRIPT PARA HABILITAR FEATURE FLAGS PARA MCP
-- =====================================================

-- Habilitar feature flags para el workspace de prueba MCP
BEGIN;

-- Habilitar feature flag de AI para el workspace de prueba
INSERT INTO core."featureFlag" (
    id,
    key,
    "workspaceId",
    value,
    "createdAt",
    "updatedAt"
) VALUES 
    -- IS_AI_ENABLED - Feature flag para funcionalidades de AI
    (gen_random_uuid(), 'IS_AI_ENABLED', '00000000-0000-0000-0000-000000000000', true, NOW(), NOW()),
    
    -- IS_COMMON_API_ENABLED - API unificada (GraphQL/REST)
    (gen_random_uuid(), 'IS_COMMON_API_ENABLED', '00000000-0000-0000-0000-000000000000', true, NOW(), NOW())

-- Usar ON CONFLICT para actualizar si ya existen
ON CONFLICT ("key", "workspaceId") 
DO UPDATE SET 
    value = true,
    "updatedAt" = NOW();

-- Confirmar transacción
COMMIT;

-- ------------------------------
-- VERIFICACIÓN
-- ------------------------------
-- Verificar que las feature flags se habilitaron correctamente
SELECT 
    key as "Feature Flag",
    value as "Estado",
    "createdAt" as "Fecha Creación",
    "updatedAt" as "Última Actualización"
FROM core."featureFlag" 
WHERE "workspaceId" = '00000000-0000-0000-0000-000000000000' 
  AND key IN (
    'IS_AI_ENABLED',
    'IS_COMMON_API_ENABLED'
  )
ORDER BY key;