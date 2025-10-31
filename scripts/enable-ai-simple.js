#!/usr/bin/env node

/**
 * Script simple para habilitar feature flags de AI usando PostgreSQL directo
 */

const { Client } = require('pg');

// Configuración de la base de datos
const databaseUrl = process.env.PG_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/default';

const enableAIFeatures = async () => {
  console.log('🚀 Habilitando feature flags de AI para MCP...');
  
  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    console.log('✅ Conexión a la base de datos establecida');

    // Buscar un workspace existente
    const workspaceQuery = `
      SELECT id, "displayName" FROM core."workspace"
      WHERE "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;
    
    const workspaceResult = await client.query(workspaceQuery);
    
    if (workspaceResult.rows.length === 0) {
      throw new Error('No se encontró ningún workspace en la base de datos');
    }
    
    const workspaceId = workspaceResult.rows[0].id;
    const workspaceName = workspaceResult.rows[0].displayName;
    
    console.log(`📋 Usando workspace: ${workspaceName} (${workspaceId})`);

    // Feature flags a habilitar
    const featuresToEnable = [
      { key: 'IS_AI_ENABLED', value: true },
      { key: 'IS_COMMON_API_ENABLED', value: true },
    ];

    for (const feature of featuresToEnable) {
      // Verificar si ya existe
      const checkQuery = `
        SELECT id FROM core."featureFlag" 
        WHERE "key" = $1 AND "workspaceId" = $2
      `;
      
      const checkResult = await client.query(checkQuery, [feature.key, workspaceId]);
      
      if (checkResult.rows.length > 0) {
        // Actualizar si existe
        const updateQuery = `
          UPDATE core."featureFlag" 
          SET value = $3, "updatedAt" = NOW() 
          WHERE "key" = $1 AND "workspaceId" = $2
        `;
        
        await client.query(updateQuery, [feature.key, workspaceId, feature.value]);
        console.log(`✅ Feature flag ${feature.key} actualizada`);
      } else {
        // Crear si no existe
        const insertQuery = `
          INSERT INTO core."featureFlag" (
            id, "key", "workspaceId", value, "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, NOW(), NOW()
          )
        `;
        
        await client.query(insertQuery, [feature.key, workspaceId, feature.value]);
        console.log(`✅ Feature flag ${feature.key} creada`);
      }
    }

    // Verificar las flags habilitadas
    const verifyQuery = `
      SELECT "key", value, "createdAt", "updatedAt" 
      FROM core."featureFlag" 
      WHERE "workspaceId" = $1 AND "key" = ANY($2)
      ORDER BY "key"
    `;
    
    const verifyResult = await client.query(verifyQuery, [
      workspaceId, 
      featuresToEnable.map(f => f.key)
    ]);

    console.log('\n📊 Feature flags habilitadas:');
    verifyResult.rows.forEach(row => {
      console.log(`  - ${row.key}: ${row.value}`);
    });

    console.log('\n🎉 Feature flags de AI habilitadas exitosamente');
    
  } catch (error) {
    console.error('❌ Error habilitando feature flags:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
};

// Ejecutar el script
enableAIFeatures();