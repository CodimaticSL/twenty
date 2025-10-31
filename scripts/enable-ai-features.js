#!/usr/bin/env node

/**
 * Script para habilitar feature flags de AI usando la API de Twenty
 */

const { DataSource } = require('typeorm');
const { FeatureFlag } = require('../packages/twenty-server/src/engine/core-modules/feature-flag/feature-flag.entity');

// Configuración de la base de datos
const databaseUrl = process.env.PG_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/default';

async function enableAIFeatures() {
  console.log('🚀 Habilitando feature flags de AI para MCP...');
  
  try {
    // Crear conexión a la base de datos
    const dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [FeatureFlag],
      synchronize: false,
    });

    await dataSource.initialize();
    console.log('✅ Conexión a la base de datos establecida');

    const repository = dataSource.getRepository(FeatureFlag);
    const workspaceId = '00000000-0000-0000-0000-000000000000';

    // Feature flags a habilitar
    const featuresToEnable = [
      { key: 'IS_AI_ENABLED', value: true },
      { key: 'IS_COMMON_API_ENABLED', value: true },
    ];

    for (const feature of featuresToEnable) {
      // Verificar si ya existe
      const existing = await repository.findOne({
        where: {
          key: feature.key,
          workspaceId: workspaceId,
        },
      });

      if (existing) {
        // Actualizar si existe
        await repository.update(
          { key: feature.key, workspaceId: workspaceId },
          { 
            value: feature.value,
            updatedAt: new Date(),
          }
        );
        console.log(`✅ Feature flag ${feature.key} actualizada`);
      } else {
        // Crear si no existe
        const newFeature = repository.create({
          key: feature.key,
          workspaceId: workspaceId,
          value: feature.value,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await repository.save(newFeature);
        console.log(`✅ Feature flag ${feature.key} creada`);
      }
    }

    // Verificar las flags habilitadas
    const enabledFeatures = await repository.find({
      where: {
        workspaceId: workspaceId,
        key: featuresToEnable.map(f => f.key),
      },
    });

    console.log('\n📊 Feature flags habilitadas:');
    enabledFeatures.forEach(feature => {
      console.log(`  - ${feature.key}: ${feature.value}`);
    });

    await dataSource.destroy();
    console.log('\n🎉 Feature flags de AI habilitadas exitosamente');
    
  } catch (error) {
    console.error('❌ Error habilitando feature flags:', error);
    process.exit(1);
  }
}

// Ejecutar el script
enableAIFeatures();