#!/bin/bash
# =============================================================
# imparatorluk.online - Sunucu Kurulum Scripti
# Kullanim: cd /var/www/imparatorluk && bash setup-server.sh
# =============================================================

set -e
SITE_DIR="/var/www/imparatorluk"
cd "$SITE_DIR"

echo "========================================"
echo " imparatorluk.online Kurulum Basliyor..."
echo "========================================"

# -------------------------------------------------------
# 1. .env dosyasini kontrol et / guncelle
# -------------------------------------------------------
echo ""
echo "[1/5] .env dosyasi kontrol ediliyor..."

if [ ! -f ".env" ]; then
  echo "  .env bulunamadi, olusturuluyor..."
  touch .env
fi

# Gerekli degiskenleri ekle (varsa degistirmez)
add_or_update_env() {
  KEY=$1
  VALUE=$2
  if grep -q "^$KEY=" .env 2>/dev/null; then
    # Guncelle
    sed -i "s|^$KEY=.*|$KEY=$VALUE|" .env
    echo "  Guncellendi: $KEY=$VALUE"
  else
    # Ekle
    echo "$KEY=$VALUE" >> .env
    echo "  Eklendi: $KEY=$VALUE"
  fi
}

add_or_update_env "GAME_ENV" "prod"
add_or_update_env "CDN_BASE" "https://imparatorluk.online"
add_or_update_env "DOMAIN" "imparatorluk.online"
add_or_update_env "NUM_WORKERS" "2"
add_or_update_env "GIT_COMMIT" "$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

# .env goster
echo ""
echo "  Mevcut .env:"
cat .env | grep -v "PASSWORD\|SECRET\|KEY\|HASH" | sed 's/^/    /'

# -------------------------------------------------------
# 2. Nginx konfigurasyonuna api-backend route ekle
# -------------------------------------------------------
echo ""
echo "[2/5] Nginx api-backend route kontrol ediliyor..."

NGINX_CONF="/etc/nginx/nginx.conf"

if grep -q "api-backend" "$NGINX_CONF"; then
  echo "  api-backend route zaten mevcut, atlanıyor."
else
  echo "  api-backend route ekleniyor..."

  # api/health blogunun oncesine api-backend blogu ekle
  TEMP_FILE=$(mktemp)
  awk '
  /location = \/api\/health/ {
    print "    # Custom Auth API backend (JWT, login, admin)"
    print "    location ^~ /api-backend/ {"
    print "        proxy_pass http://127.0.0.1:3003/;"
    print "        proxy_http_version 1.1;"
    print "        proxy_cache off;"
    print "        add_header Cache-Control \"no-store, no-cache, must-revalidate\";"
    print "        proxy_set_header Host $host;"
    print "        proxy_set_header X-Real-IP $remote_addr;"
    print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
    print "        proxy_set_header X-Forwarded-Proto $scheme;"
    print "        proxy_buffer_size 32k;"
    print "        proxy_buffers 4 32k;"
    print "    }"
    print ""
    print "    # Admin panel kisayolu"
    print "    location ^~ /admin {"
    print "        proxy_pass http://127.0.0.1:3003/admin;"
    print "        proxy_http_version 1.1;"
    print "        proxy_cache off;"
    print "        proxy_set_header Host $host;"
    print "        proxy_set_header X-Real-IP $remote_addr;"
    print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
    print "        proxy_set_header X-Forwarded-Proto $scheme;"
    print "    }"
    print ""
  }
  { print }
  ' "$NGINX_CONF" > "$TEMP_FILE"

  cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
  mv "$TEMP_FILE" "$NGINX_CONF"
  echo "  Eklendi! Yedek: ${NGINX_CONF}.backup.*"
fi

# -------------------------------------------------------
# 3. Nginx test et ve reload et
# -------------------------------------------------------
echo ""
echo "[3/5] Nginx test ediliyor..."
if nginx -t 2>&1; then
  echo "  Nginx config OK!"
  systemctl reload nginx
  echo "  Nginx reload edildi."
else
  echo "  HATA: Nginx config hatali! Manuel kontrol gerekiyor."
  exit 1
fi

# -------------------------------------------------------
# 4. PM2 ile sunucuyu yeniden baslat
# -------------------------------------------------------
echo ""
echo "[4/5] PM2 surecleri yeniden baslatiliyor..."

# openfront-api (port 3003) - Custom API
if pm2 describe openfront-api > /dev/null 2>&1; then
  pm2 restart openfront-api
  echo "  openfront-api yeniden baslatildi."
else
  pm2 start api-backend/server.js --name "openfront-api"
  echo "  openfront-api baslatildi."
fi

sleep 2

# Ana oyun sunucusu (imparatorluk / openfront)
# imparatorluk process'i var mi?
if pm2 describe imparatorluk > /dev/null 2>&1; then
  pm2 restart imparatorluk
  echo "  imparatorluk (oyun sunucusu) yeniden baslatildi."
elif pm2 describe openfront > /dev/null 2>&1; then
  pm2 restart openfront
  echo "  openfront (oyun sunucusu) yeniden baslatildi."
else
  echo "  Oyun sunucusu baslatiliyor..."
  pm2 start npm --name "imparatorluk" -- run start:server
fi

# -------------------------------------------------------
# 5. Kontrol
# -------------------------------------------------------
echo ""
echo "[5/5] Durum kontrol ediliyor..."
sleep 5

echo ""
echo "  PM2 Durum:"
pm2 status

echo ""
echo "  Port Kontrol:"
ss -tlnp | grep -E "3000|3001|3002|3003" || true

echo ""
echo "  Health Check:"
sleep 3
curl -s http://localhost:3000/api/health || echo "  UYARI: Health check basarisiz!"

echo ""
echo "  JWKS Test (JWT dogrulamasi icin kritik!):"
curl -s http://localhost:3003/.well-known/jwks.json | head -c 200 || echo "  UYARI: JWKS endpoint basarisiz!"

echo ""
echo "========================================"
echo " Kurulum TAMAMLANDI!"
echo " Site: https://imparatorluk.online"
echo " Admin Panel: https://imparatorluk.online/api-backend/admin"
echo "========================================"
