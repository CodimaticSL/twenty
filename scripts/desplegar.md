
**COMANDO INMEDIATO:**

```bash
# En tu Mac
docker build --platform linux/amd64 -f packages/twenty-docker/twenty/Dockerfile -t twenty-custom:v1.8.2 .
```
# 🚀 Guía Completa de Despliegue en VPS

La imagen ya está compilada correctamente con arquitectura AMD64. Ahora sigue estos pasos en tu VPS:

---

## **PASO 1: Empaquetar y Transferir (Desde tu Mac)**

```bash
# 1. Empaquetar la imagen
docker save twenty-custom:v1.8.2 | gzip > twenty-custom-v1.8.2-amd64-01-11-25.tar.gz

# 2. Verificar el tamaño del archivo
ls -lh twenty-custom-v1.8.2-amd64.tar.gz
# Debería ser ~500-800MB

# 3. Transferir al VPS (reemplaza con tus datos)
scp twenty-custom-v1.8.2-amd64-01-11-25.tar.gz root@72.60.214.54:/tmp/

# Ejemplo real:
# scp twenty-custom-v1.8.2-amd64.tar.gz root@192.168.1.100:/tmp/
```

---

## **PASO 2: Conectar al VPS**

```bash
ssh root@72.60.214.54
```

---

## **PASO 3: Preparar el Entorno en el VPS**

```bash
# 1. Navegar al directorio de Twenty
cd twenty  # o la ruta donde tengas docker-compose.yml

# 2. Hacer BACKUP de la base de datos (CRÍTICO)
docker compose exec -T db pg_dump -U postgres default > backup-$(date +%Y%m%d-%H%M%S).sql

# Si el comando anterior falla (contenedor no corriendo), usa:
docker compose exec -T db pg_dump -U twenty twenty > backup-$(date +%Y%m%d-%H%M%S).sql

# 3. Verificar que el backup se creó
ls -lh backup-*.sql
```

---

## **PASO 4: Cargar la Nueva Imagen**

```bash
# 1. Cargar la imagen desde el archivo
docker load < /tmp/twenty-custom-v1.8.2-amd64-01-11-25.tar.gz

# Deberías ver:
# Loaded image: twenty-custom:v1.8.2

# 2. Verificar que la imagen se cargó correctamente
docker images | grep twenty-custom

# Debería mostrar algo como:
# twenty-custom   v1.8.2   [IMAGE_ID]   X hours ago   ~2GB
```

---

## **PASO 5: Actualizar docker-compose.yml**

```bash
# 1. Hacer backup del docker-compose.yml actual
cp docker-compose.yml docker-compose.yml.backup

# 2. Editar docker-compose.yml
nano docker-compose.yml

# 3. Buscar la línea que dice:
#    image: twentycrm/twenty:v1.8.2
#    o
#    image: twentycrm/twenty:latest
#
# Y cambiarla por:
#    image: twenty-custom:v1.8.2

# 4. Guardar: Ctrl+O, Enter, Ctrl+X
```

**Ejemplo de cambio:**

```yaml
# ANTES:
services:
  server:
    image: twentycrm/twenty:v1.8.2
    # resto de configuración...

# DESPUÉS:
services:
  server:
    image: twenty-custom:v1.8.2
    # resto de configuración...
```

---

## **PASO 6: Reiniciar los Servicios**

```bash
# 1. Detener los contenedores actuales
docker-compose down

# 2. Iniciar con la nueva imagen
docker-compose up -d

# 3. Esperar unos segundos para que inicien
sleep 15

# 4. Verificar que los servicios están corriendo
docker-compose ps

# Deberías ver algo como:
# NAME                STATUS
# server-1            Up X seconds
# db-1                Up X seconds
# redis-1             Up X seconds (si lo tienes)
```

---

## **PASO 7: Verificar el Despliegue**

```bash
# 1. Ver logs del servidor en tiempo real
docker-compose logs -f server

# Presiona Ctrl+C para salir de los logs

# 2. Ver últimas 50 líneas de logs
docker-compose logs --tail=50 server

# 3. Verificar que sales-filter está presente en el contenedor
docker-compose exec server ls -la /app/packages/twenty-server/dist/src/modules/sales-filter

# Deberías ver archivos como:
# sales-filter-find-many.pre-query.hook.js
# sales-filter-find-one.pre-query.hook.js
# sales-filter-query-hook.module.js

# 4. Probar el healthcheck
docker-compose exec server curl -f http://localhost:3000/healthz || echo "Servicio aún iniciando..."

# 5. Ver todos los contenedores
docker ps

# 6. Verificar conectividad externa
curl -I http://tu-vps-ip:3000
# o desde tu navegador:
# http://tu-vps-ip:3000
```

---

## **PASO 8: Verificación Final**

```bash
# Ver logs buscando errores
docker-compose logs server | grep -i error

# Ver logs buscando referencias a sales-filter
docker-compose logs server | grep -i "sales"

# Verificar uso de recursos
docker stats --no-stream

# Ver versión de la imagen en uso
docker-compose exec server cat /app/packages/twenty-server/package.json | grep version
```

---

## **Troubleshooting Común**

### **Servicio no inicia o reinicia constantemente**

```bash
# Ver logs detallados
docker-compose logs --tail=100 server

# Verificar variables de entorno
docker-compose exec server env | grep -E "DATABASE|SERVER|REDIS"

# Reiniciar con logs en vivo
docker-compose down
docker-compose up
# (sin -d para ver logs en tiempo real)
# Presiona Ctrl+C cuando veas que funciona, luego:
docker-compose up -d
```

### **Error de conexión a base de datos**

```bash
# Verificar que la base de datos está corriendo
docker-compose exec db psql -U postgres -c "SELECT version();"

# Verificar conectividad desde server a db
docker-compose exec server nc -zv db 5432
```

### **Puerto 3000 no accesible desde fuera**

```bash
# Verificar firewall del VPS
sudo ufw status
sudo ufw allow 3000/tcp

# O si usas iptables:
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables-save
```

### **Imagen no se cargó correctamente**

```bash
# Verificar integridad del archivo
ls -lh /tmp/twenty-custom-v1.8.2-amd64.tar.gz

# Re-cargar la imagen
docker load < /tmp/twenty-custom-v1.8.2-amd64.tar.gz

# Listar todas las imágenes
docker images
```

---

## **Comandos Útiles de Mantenimiento**

```bash
# Ver logs en tiempo real
docker-compose logs -f server

# Reiniciar solo el servicio server
docker-compose restart server

# Acceder al shell del contenedor
docker-compose exec server /bin/sh

# Ver uso de disco
docker system df

# Limpiar imágenes antiguas (cuidado)
docker image prune -a

# Backup de base de datos
docker-compose exec -T db pg_dump -U postgres default > backup-manual.sql

# Restaurar backup (si algo sale mal)
docker-compose exec -T db psql -U postgres default < backup-manual.sql
```

---

## **Rollback (Si algo sale mal)**

```bash
# 1. Detener servicios
docker-compose down

# 2. Restaurar docker-compose.yml original
cp docker-compose.yml.backup docker-compose.yml

# 3. Restaurar base de datos si es necesario
docker-compose exec -T db psql -U postgres default < backup-YYYYMMDD-HHMMSS.sql

# 4. Reiniciar con imagen oficial
docker-compose up -d
```

---

## **Verificación de Sales-Filter en Producción**

Una vez que el servicio esté corriendo:

```bash
# 1. Buscar en logs referencias al módulo
docker-compose logs server | grep -i "SalesFilter"

# 2. Verificar que los archivos TypeScript compilados existen
docker-compose exec server find /app/packages/twenty-server/dist -name "*sales-filter*" -type f

# 3. Listar estructura del módulo
docker-compose exec server ls -R /app/packages/twenty-server/dist/src/modules/sales-filter/
```

---

## **Resumen de Comandos Secuenciales**

```bash
# En tu Mac:
docker save twenty-custom:v1.8.2 | gzip > twenty-custom-v1.8.2-amd64.tar.gz
scp twenty-custom-v1.8.2-amd64.tar.gz usuario@tu-vps:/tmp/

# En el VPS:
ssh usuario@tu-vps
cd /opt/twenty
docker-compose exec -T db pg_dump -U postgres default > backup-$(date +%Y%m%d-%H%M%S).sql
docker load < /tmp/twenty-custom-v1.8.2-amd64.tar.gz
docker images | grep twenty-custom
cp docker-compose.yml docker-compose.yml.backup
nano docker-compose.yml  # Cambiar image: a twenty-custom:v1.8.2
docker-compose down
docker-compose up -d
docker-compose logs -f server
```

---

## **¡Listo!**

Tu Twenty CRM personalizado con el módulo `sales-filter` debería estar corriendo en tu VPS. Accede a través de:

```
http://tu-vps-ip:3000
```

O el dominio configurado en tu VPS.