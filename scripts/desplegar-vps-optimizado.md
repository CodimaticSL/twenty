# Despliegue Optimizado en VPS - Construcción Directa

## Overview

Este script optimiza el proceso de despliegue construyendo las imágenes Docker directamente en el VPS, eliminando la necesidad de transferir imágenes grandes desde el Mac.

## Ventajas

- ⚡ **Construcción nativa Linux**: Sin emulación multi-arquitectura
- 🚀 **Transferencia mínima**: Solo código fuente (~50MB vs 300MB+ de imágenes)
- 💾 **Ahorro de almacenamiento**: No se almacenan imágenes intermedias
- ⏱️ **Tiempo reducido**: Construcción más rápida en hardware nativo

## Prerrequisitos VPS

```bash
# Herramientas instaladas
- Docker 28.5.1+
- Node.js v18.19.1+
- Yarn 1.22.22+
- Git 2.43.0+
```

## Proceso de Despliegue

### 1. Preparar Código Fuente

```bash
# En VPS - Clonar repositorio con personalizaciones
cd /root
git clone https://github.com/CodimaticSL/twenty.git twenty-source
cd twenty-source
git checkout NodiaFlow
```

### 2. Construir Imagen Docker

```bash
# Construir directamente en VPS (arquitectura nativa)
docker build -t twenty-custom:v1.8.3 \
  --build-arg APP_VERSION=v1.8.3 \
  -f packages/twenty-docker/Dockerfile .
```

### 3. Actualizar Configuración

```bash
# Actualizar .env
cd /root/twenty
cp .env .env.backup
sed -i 's/TAG=v1.8.2/TAG=v1.8.3/' .env

# Actualizar docker-compose.yml
cp docker-compose.yml docker-compose.yml.backup
sed -i 's/APP_VERSION: "1.8.2"/APP_VERSION: "1.8.3"/g' docker-compose.yml
```

### 4. Backup y Despliegue

```bash
# Backup de base de datos
docker compose exec -T db pg_dump -U postgres default > backup-$(date +%Y%m%d-%H%M%S).sql

# Reiniciar servicios
docker compose down
docker compose up -d
```

### 5. Verificación

```bash
# Verificar estado
docker compose ps
docker compose logs --tail=20 server

# Verificar personalizaciones
docker compose exec server find /app/packages/twenty-server/dist -name '*mcp*' -type f
```

## Script Automatizado

```bash
#!/bin/bash
# deploy-vps.sh

set -e

VERSION=${1:-v1.8.3}
BACKUP_DIR="/root/twenty/backups"
SOURCE_DIR="/root/twenty-source"

echo "🚀 Iniciando despliegue optimizado VPS - Versión $VERSION"

# 1. Backup
echo "📦 Creando backup..."
mkdir -p $BACKUP_DIR
cd /root/twenty
docker compose exec -T db pg_dump -U postgres default > $BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).sql

# 2. Actualizar código fuente
echo "📥 Actualizando código fuente..."
cd $SOURCE_DIR
git fetch origin
git checkout NodiaFlow
git pull origin NodiaFlow

# 3. Construir imagen
echo "🔨 Construyendo imagen Docker..."
docker build -t twenty-custom:$VERSION \
  --build-arg APP_VERSION=$VERSION \
  -f packages/twenty-docker/Dockerfile .

# 4. Actualizar configuración
echo "⚙️ Actualizando configuración..."
cd /root/twenty
sed -i "s/TAG=.*/TAG=$VERSION/" .env
sed -i "s/APP_VERSION: \".*\"/APP_VERSION: \"$VERSION\"/g" docker-compose.yml

# 5. Despliegue
echo "🔄 Desplegando servicios..."
docker compose down
docker compose up -d

# 6. Verificación
echo "✅ Verificando despliegue..."
sleep 30
docker compose ps
docker compose logs --tail=10 server

echo "🎉 Despliegue completado - Versión $VERSION"
```

## Flujo de Trabajo para Actualizaciones

### Para Nueva Versión (ej: v1.8.4)

```bash
# 1. Local - Hacer merge y resolver conflictos
git checkout v1.8.4
git merge v1.8.4 --no-ff
# Resolver conflictos MCP
git push origin NodiaFlow

# 2. VPS - Ejecutar script automatizado
./deploy-vps.sh v1.8.4

# 3. Verificación
curl -I https://crm.nodiaflow.com
```

## Tiempos Estimados

| Operación | Método Anterior | Método Optimizado |
|-----------|----------------|------------------|
| Construcción imagen | 8-10 min (Mac) | 3-4 min (VPS) |
| Transferencia | 5-8 min (300MB) | 1-2 min (50MB) |
| Total despliegue | 15-20 min | 6-8 min |

## Monitoreo y Logs

```bash
# Logs en tiempo real
docker compose logs -f server

# Estado de contenedores
docker compose ps

# Uso de recursos
docker stats

# Espacio en disco
df -h
docker system df
```

## Troubleshooting

### Problemas Comunes

1. **Construcción fallida**
   ```bash
   # Limpiar caché Docker
   docker system prune -a

   # Reconstruir sin caché
   docker build --no-cache -t twenty-custom:v1.8.3 .
   ```

2. **Problemas de dependencias**
   ```bash
   # Reinstalar dependencias
   cd /root/twenty-source
   rm -rf node_modules
   yarn install
   ```

3. **Contenedores no inician**
   ```bash
   # Verificar logs detallados
   docker compose logs server
   docker compose logs worker
   ```

## Rollback

```bash
# En caso de problemas críticos
cd /root/twenty
docker compose down

# Restaurar versión anterior
sed -i 's/TAG=v1.8.3/TAG=v1.8.2/' .env
sed -i 's/APP_VERSION: "1.8.3"/APP_VERSION: "1.8.2"/g' docker-compose.yml

# Restaurar backup si es necesario
docker compose up -d db
sleep 10
docker compose exec -T db psql -U postgres -d default < backup-20251101-214446.sql
docker compose up -d
```

## Configuración de Alertas

```bash
# Script de monitoreo simple
#!/bin/bash
# monitor.sh

HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" https://crm.nodiaflow.com)

if [ $HEALTH_CHECK -ne 200 ]; then
    echo "❌ Alerta: CRM no responde (HTTP $HEALTH_CHECK)"
    # Enviar notificación (email, Slack, etc.)
else
    echo "✅ CRM funcionando correctamente"
fi
```

Este proceso optimizado reduce significativamente el tiempo de despliegue y elimina los cuellos de botella relacionados con la construcción multi-arquitectura y transferencia de imágenes.
