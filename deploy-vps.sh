#!/bin/bash

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
