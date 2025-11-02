-- =====================================================
-- SCRIPT COMPLETO PARA GESTIÓN DE FEATURE FLAGS EN TWENTY
-- =====================================================

-- ------------------------------
-- 1. LISTAR TODOS LOS WORKSPACES
-- ------------------------------
-- Ejecuta esta consulta primero para obtener el ID del workspace
-- donde quieres habilitar las feature flags

SELECT
    id as "Workspace ID",
    displayName as "Nombre del Workspace",
    subdomain as "Subdominio",
    customDomain as "Dominio Personalizado",
    createdAt as "Fecha Creación",
    activationStatus as "Estado Activación"
FROM core."workspace"
WHERE "deletedAt" IS NULL
ORDER BY "createdAt" DESC;

-- ------------------------------
-- 2. HABILITAR FEATURE FLAGS SEGURAS
-- ------------------------------
-- Reemplaza 'TU_WORKSPACE_ID_AQUI' con el ID obtenido en la consulta anterior

-- Iniciar transacción para asegurar consistencia
BEGIN;

-- Habilitar feature flags para el workspace especificado
INSERT INTO core."featureFlag" (
    id,
    key,
    "workspaceId",
    value,
    "createdAt",
    "updatedAt"
) VALUES
    -- IS_IMAP_SMTP_CALDAV_ENABLED - Integración con email y calendarios
    (gen_random_uuid(), 'IS_IMAP_SMTP_CALDAV_ENABLED', 'TU_WORKSPACE_ID_AQUI', true, NOW(), NOW()),

    -- IS_MESSAGE_FOLDER_CONTROL_ENABLED - Control de carpetas de mensajes
    (gen_random_uuid(), 'IS_MESSAGE_FOLDER_CONTROL_ENABLED', 'TU_WORKSPACE_ID_AQUI', true, NOW(), NOW()),

    -- IS_CALENDAR_VIEW_ENABLED - Vista de calendario
    (gen_random_uuid(), 'IS_CALENDAR_VIEW_ENABLED', 'TU_WORKSPACE_ID_AQUI', true, NOW(), NOW()),

    -- IS_PAGE_LAYOUT_ENABLED - Layouts de página personalizados
    (gen_random_uuid(), 'IS_PAGE_LAYOUT_ENABLED', 'TU_WORKSPACE_ID_AQUI', true, NOW(), NOW()),

    -- IS_RECORD_PAGE_LAYOUT_ENABLED - Layouts para páginas de registros
    (gen_random_uuid(), 'IS_RECORD_PAGE_LAYOUT_ENABLED', 'TU_WORKSPACE_ID_AQUI', true, NOW(), NOW()),

    -- IS_GROUP_BY_ENABLED - Agrupación de datos en vistas
    (gen_random_uuid(), 'IS_GROUP_BY_ENABLED', 'TU_WORKSPACE_ID_AQUI', true, NOW(), NOW()),

    -- IS_DYNAMIC_SEARCH_FIELDS_ENABLED - Búsqueda dinámica con campos variables
    (gen_random_uuid(), 'IS_DYNAMIC_SEARCH_FIELDS_ENABLED', 'TU_WORKSPACE_ID_AQUI', true, NOW(), NOW()),

    -- IS_JSON_FILTER_ENABLED - Filtrado avanzado con JSON
    (gen_random_uuid(), 'IS_JSON_FILTER_ENABLED', 'TU_WORKSPACE_ID_AQUI', true, NOW(), NOW()),

    -- IS_COMMON_API_ENABLED - API unificada (GraphQL/REST)
    (gen_random_uuid(), 'IS_COMMON_API_ENABLED', '45b16c8b-5e8f-4b64-a6e1-1a7263ac59f7', true, NOW(), NOW())

-- Usar ON CONFLICT para actualizar si ya existen
ON CONFLICT ("key", "workspaceId")
DO UPDATE SET
    value = true,
    "updatedAt" = NOW();

-- Confirmar transacción
COMMIT;

-- ------------------------------
-- 3. VERIFICACIÓN DE FEATURE FLAGS HABILITADAS
-- ------------------------------
-- Esta consulta verifica que las feature flags se habilitaron correctamente
-- (opcional, ejecuta después del script principal)

SELECT
    key as "Feature Flag",
    value as "Estado",
    "createdAt" as "Fecha Creación",
    "updatedAt" as "Última Actualización"
FROM core."featureFlag"
WHERE "workspaceId" = 'TU_WORKSPACE_ID_AQUI'
  AND key IN (
    'IS_IMAP_SMTP_CALDAV_ENABLED',
    'IS_MESSAGE_FOLDER_CONTROL_ENABLED',
    'IS_CALENDAR_VIEW_ENABLED',
    'IS_PAGE_LAYOUT_ENABLED',
    'IS_GROUP_BY_ENABLED',
    'IS_DYNAMIC_SEARCH_FIELDS_ENABLED',
    'IS_JSON_FILTER_ENABLED',
    'IS_AIRTABLE_INTEGRATION_ENABLED',
    'IS_COMMON_API_ENABLED'
  )
ORDER BY key;

-- ------------------------------
-- 4. RESUMEN DE FEATURE FLAGS DEL WORKSPACE
-- ------------------------------
-- Esta consulta muestra un resumen completo de todas las feature flags del workspace

SELECT
    COUNT(*) as "Total Feature Flags",
    COUNT(CASE WHEN value = true THEN 1 END) as "Habilitadas",
    COUNT(CASE WHEN value = false THEN 1 END) as "Deshabilitadas"
FROM core."featureFlag"
WHERE "workspaceId" = 'TU_WORKSPACE_ID_AQUI';
