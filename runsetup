#!/bin/bash

# Nginx config yaz
cat > /etc/nginx/sites-available/imparatorluk << 'NGINXEOF'
server {
    listen 80;
    server_name imparatorluk.online www.imparatorluk.online;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXEOF

echo "Nginx config yazildi"

# Eski symlink/copy sil
rm -f /etc/nginx/sites-enabled/imparatorluk

# Yeni config kopyala
cp /etc/nginx/sites-available/imparatorluk /etc/nginx/sites-enabled/imparatorluk
echo "Nginx config aktif edildi"

# Default siteyi kapat
rm -f /etc/nginx/sites-enabled/default

# Nginx test
nginx -t && echo "Nginx test OK" || echo "Nginx test FAILED"

# Nginx yeniden baslat
systemctl restart nginx && echo "Nginx yeniden basladi" || echo "Nginx baslatma FAILED"

# SSL kur
apt install -y certbot python3-certbot-nginx

# SSL sertifikasi al
certbot --nginx -d imparatorluk.online -d www.imparatorluk.online --non-interactive --agree-tos --email olgunuysal42@gmail.com

echo ""
echo "==============================="
echo "KURULUM TAMAMLANDI!"
echo "Siteniz: https://imparatorluk.online"
echo "==============================="
