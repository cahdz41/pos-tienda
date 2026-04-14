# DEPLOY.md — Guía de Despliegue: pos-v2

> **LEER ANTES DE HACER CUALQUIER COSA EN EL SERVIDOR.**
> Este documento es la única fuente de verdad para desplegar esta app.
> Seguirlo protege las otras apps que conviven en el VPS.

## Repositorio GitHub

**El repositorio YA EXISTE. No crear uno nuevo.**

```
https://github.com/cahdz41/pos-tienda
```

- Rama principal: `main`
- Para clonar en el VPS: `git clone https://github.com/cahdz41/pos-tienda.git pos-v2`
- Para clonar en una PC nueva: `git clone https://github.com/cahdz41/pos-tienda.git`
- Para sincronizar desde cualquier PC ya clonada: `git pull origin main`

---

## Índice

1. [Mapa del servidor](#mapa-del-servidor)
2. [Prerequisitos](#prerequisitos)
3. [Primera vez: Setup inicial en el VPS](#primera-vez-setup-inicial-en-el-vps)
4. [Deploy regular desde cualquier PC](#deploy-regular-desde-cualquier-pc)
5. [Variables de entorno](#variables-de-entorno)
6. [Nginx — configuración](#nginx--configuración)
7. [Comandos útiles](#comandos-útiles)
8. [Rollback](#rollback)
9. [Reglas de oro](#reglas-de-oro)

---

## Mapa del servidor

**VPS:** Hostinger KVM2  
**Acceso:** Terminal en hPanel de Hostinger  
**Dominio:** `pos-storeonline.duckdns.org`

### Servicios que NO debes tocar

| Servicio | Cómo corre | No tocar |
|---|---|---|
| n8n | Docker (`n8n-n8n-1`) | `docker stop n8n-n8n-1` NUNCA |
| Traefik (reverse proxy) | Docker (`n8n-traefik-1`) | Maneja todo el tráfico 80/443 |
| OpenClaw bot | Docker (`openclaw-gateway`) | Puerto 6151 |
| Dashboard Gym | Docker (`dashboard_gym-gym-dashboard-1`) | — |
| Chocholand | Docker (`dashboard-chocholand-chocholand-1`) | Puerto 5000 interno |
| bot-gym (WhatsApp) | PM2 id `0` (`bot-gym`) | Puerto 3001 |

### Este servicio

| Servicio | Cómo corre | Puerto interno | Nginx externo |
|---|---|---|---|
| pos-v2 | PM2 (`pos-v2`) | **3000** | 8082 → 3000 |

### Puertos reservados por otros servicios (NO USAR)

- `80`, `443` — Traefik (Docker)
- `3001` — bot-gym (WhatsApp bot)
- `5678` — n8n (interno Docker)
- `6151` — OpenClaw
- `8080` — Nginx (gym-dashboard + chocholand)

---

## Prerequisitos

### En el VPS (verificar una vez)

```bash
# Node.js >= 18
node -v

# npm
npm -v

# PM2 global
pm2 -v

# Carpeta de logs de PM2
mkdir -p /var/log/pm2
```

### En tu PC (cualquiera de las dos)

- Git instalado y configurado con acceso al repositorio
- Acceso SSH al VPS o acceso a la terminal de hPanel

---

## Primera vez: Setup inicial en el VPS

Ejecutar **solo la primera vez**. Si el servicio ya existe, ir a [Deploy regular](#deploy-regular-desde-cualquier-pc).

### 1. Clonar el repositorio

```bash
cd /var/www
git clone https://github.com/cahdz41/pos-tienda.git pos-v2
cd pos-v2
```

> Repositorio: `https://github.com/cahdz41/pos-tienda`

### 2. Crear el archivo de variables de entorno

```bash
nano /var/www/pos-v2/.env.production
```

Pegar el contenido (ver sección [Variables de entorno](#variables-de-entorno)) y guardar con `Ctrl+O`, `Enter`, `Ctrl+X`.

### 3. Instalar dependencias y compilar

```bash
cd /var/www/pos-v2
npm install
npm run build
```

> El build puede tardar 2-3 minutos. Esperar a que termine sin errores.

### 4. Registrar en PM2

```bash
cd /var/www/pos-v2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # Seguir las instrucciones que imprima (solo la primera vez)
```

### 5. Verificar que levantó

```bash
pm2 list
# Debe aparecer "pos-v2" con status "online" y 0 reinicios
```

```bash
curl http://localhost:3000
# Debe responder HTML
```

### 6. Crear el bloque Nginx

```bash
nano /etc/nginx/sites-enabled/pos-v2
```

Pegar exactamente este contenido:

```nginx
server {
    listen 8082;
    server_name pos-storeonline.duckdns.org;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 7. Validar y recargar Nginx

```bash
nginx -t
# Debe decir: syntax is ok / test is successful

nginx -s reload
```

---

## Deploy regular desde cualquier PC

Este es el proceso cada vez que quieras actualizar la app en producción.

### Desde tu PC (cualquiera de las dos)

```bash
# 1. Asegúrate de estar en la rama main y sin cambios pendientes
git status
git checkout main
git push origin main
```

### Desde la terminal del VPS (hPanel)

```bash
# 2. Ir a la carpeta
cd /var/www/pos-v2

# 3. Traer los últimos cambios
git pull origin main

# 4. Instalar dependencias nuevas (si cambiaron)
npm install

# 5. Compilar
npm run build

# 6. Reiniciar el proceso (zero-downtime reload)
pm2 reload pos-v2

# 7. Verificar que quedó bien
pm2 list
```

### Checklist de verificación post-deploy

- [ ] `pm2 list` muestra `pos-v2` en `online` con pocos reinicios
- [ ] `curl http://localhost:3000` responde HTML
- [ ] El dominio `pos-storeonline.duckdns.org` carga correctamente en el navegador
- [ ] Los otros servicios siguen funcionando (`docker ps` muestra todos `Up`)

---

## Variables de entorno

Las variables de entorno **nunca se suben a Git** (están en `.gitignore`).  
Deben crearse manualmente en el VPS la primera vez y actualizarse si cambian.

**Archivo en el VPS:** `/var/www/pos-v2/.env.production`

```env
NEXT_PUBLIC_SUPABASE_URL=https://isbsckatvtangowdvjdl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<tu_service_role_key>
RESEND_API_KEY=<tu_resend_key>
```

> Los valores reales están en `.env.local` de tu PC (nunca se commitean).  
> Si cambias alguna variable, debes hacer `pm2 restart pos-v2` después de editar el archivo.

---

## Nginx — configuración

El archivo de configuración de Nginx para esta app es:

```
/etc/nginx/sites-enabled/pos-v2
```

**No modificar** `/etc/nginx/sites-enabled/mis_proyectos` — contiene la configuración de gym-dashboard y chocholand.

Después de cualquier cambio en Nginx:

```bash
nginx -t && nginx -s reload
```

**Nunca usar** `nginx -s stop` o `systemctl stop nginx` — afecta a gym-dashboard y chocholand.

---

## Comandos útiles

```bash
# Ver estado de todos los procesos
pm2 list

# Ver logs en tiempo real
pm2 logs pos-v2

# Ver logs de errores
pm2 logs pos-v2 --err

# Reiniciar sin downtime
pm2 reload pos-v2

# Reinicio forzado (solo si reload falla)
pm2 restart pos-v2

# Ver estado de Docker (las otras apps)
docker ps

# Ver uso de puertos
ss -tlnp | grep LISTEN
```

---

## Rollback

Si el deploy rompió algo y necesitas volver a la versión anterior:

```bash
cd /var/www/pos-v2

# Ver los commits disponibles
git log --oneline -10

# Volver al commit anterior (reemplaza HASH con el id del commit)
git checkout HASH

# Reconstruir con esa versión
npm install
npm run build
pm2 reload pos-v2
```

Para volver a la versión más reciente después:

```bash
git checkout main
git pull origin main
npm run build
pm2 reload pos-v2
```

---

## Reglas de oro

1. **Nunca borrar ni modificar** `/etc/nginx/sites-enabled/mis_proyectos`
2. **Nunca detener Docker** — n8n, traefik, openclaw, gym-dashboard y chocholand viven ahí
3. **Nunca usar el puerto 3001** — es el bot de WhatsApp del gimnasio
4. **Siempre correr `nginx -t` antes de `nginx -s reload`** — si hay error de sintaxis, no recargar
5. **Siempre correr `pm2 save` después de agregar o quitar procesos** — para que PM2 recuerde el estado al reiniciar el servidor
6. **Las variables de entorno nunca van a Git** — crearlas o editarlas directamente en el VPS
7. **Verificar `pm2 list` y `docker ps` después de cada deploy** — confirmar que todo sigue `online`/`Up`
8. **Usar `pm2 reload` (no `restart`)** para deploys en caliente sin interrumpir sesiones activas
