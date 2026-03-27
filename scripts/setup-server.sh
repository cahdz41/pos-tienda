#!/bin/bash
# =============================================================
# SETUP INICIAL del servidor para pos-tienda
# Ejecutar UNA SOLA VEZ con: bash setup-server.sh
# =============================================================
set -e

DOMAIN="pos-storeonline.duckdns.org"
APP_DIR="/var/www/pos-tienda"
REPO="https://github.com/cahdz41/pos-tienda.git"
PORT=3001
EMAIL="tu-email@ejemplo.com"   # <-- cambia esto antes de ejecutar

echo "=================================================="
echo " PASO 1: Generar SSH key para GitHub Actions"
echo "=================================================="
ssh-keygen -t ed25519 -C "github-actions-pos" -f /root/.ssh/deploy_key_pos -N ""
cat /root/.ssh/deploy_key_pos.pub >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

echo ""
echo "🔑 CLAVE PRIVADA (cópiala completa para GitHub Secret VPS_SSH_KEY):"
echo "-------------------------------------------------------------------"
cat /root/.ssh/deploy_key_pos
echo "-------------------------------------------------------------------"
echo "Presiona ENTER para continuar..."
read

echo "=================================================="
echo " PASO 2: Clonar repositorio"
echo "=================================================="
mkdir -p /var/www
git clone $REPO $APP_DIR
cd $APP_DIR

echo "=================================================="
echo " PASO 3: Crear variables de entorno"
echo "=================================================="
cat > $APP_DIR/.env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://isbsckatvtangowdvjdl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzYnNja2F0dnRhbmdvd2R2amRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTQwODMsImV4cCI6MjA4OTg5MDA4M30.3fddpWrZBW4WMPU7L91rlEQ1Afh4AMM6fSbvPVmrn5o
EOF
echo "✅ .env.local creado"

echo "=================================================="
echo " PASO 4: Instalar dependencias y compilar"
echo "=================================================="
npm ci
npm run build

echo "=================================================="
echo " PASO 5: Iniciar con PM2"
echo "=================================================="
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -1 | bash   # auto-arranque al reiniciar VPS

echo "=================================================="
echo " PASO 6: Configurar Nginx"
echo "=================================================="
cat > /etc/nginx/sites-available/pos-tienda << EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/pos-tienda /etc/nginx/sites-enabled/pos-tienda
nginx -t && systemctl reload nginx
echo "✅ Nginx configurado"

echo "=================================================="
echo " PASO 7: Certificado SSL con Certbot"
echo "=================================================="
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL
echo "✅ HTTPS activado"

echo ""
echo "=================================================="
echo " ✅ SETUP COMPLETADO"
echo "=================================================="
echo "🌐 App corriendo en: https://$DOMAIN"
echo ""
echo "AHORA ve a GitHub y agrega estos 3 Secrets:"
echo "  VPS_HOST  →  76.13.109.126"
echo "  VPS_USER  →  root"
echo "  VPS_SSH_KEY  →  (la clave privada que copiaste arriba)"
echo "=================================================="
