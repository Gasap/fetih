#!/usr/bin/env python3
"""
fix_nginx.py - Nginx'e /api-backend/ route ekler
Kullanim: python3 /var/www/imparatorluk/fix_nginx.py
"""
import re, shutil, os, subprocess, datetime

NGINX_CONF = "/etc/nginx/sites-enabled/imparatorluk"

API_BACKEND_BLOCK = """
    # Custom Auth API backend (JWT, login, admin) - Imparatorluk
    location ^~ /api-backend/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_http_version 1.1;
        proxy_cache off;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffer_size 32k;
        proxy_buffers 4 32k;
    }

    # Admin panel
    location ^~ /admin {
        proxy_pass http://127.0.0.1:4000/admin;
        proxy_http_version 1.1;
        proxy_cache off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffer_size 32k;
        proxy_buffers 4 32k;
    }
"""

def main():
    if not os.path.exists(NGINX_CONF):
        print(f"HATA: {NGINX_CONF} bulunamadi!")
        return

    with open(NGINX_CONF, "r") as f:
        content = f.read()

    if "api-backend" in content:
        print("api-backend zaten mevcut, islem yapilmadi.")
        return

    # Yedek al
    backup_path = f"{NGINX_CONF}.backup.{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(NGINX_CONF, backup_path)
    print(f"Yedek alindi: {backup_path}")

    # /api/health blogunun hemen oncesine ekle
    pattern = r"([ \t]*location\s*=\s*/api/health)"
    replacement = API_BACKEND_BLOCK + r"\1"
    new_content = re.sub(pattern, replacement, content, count=1)

    if new_content == content:
        # Fallback: ilk server {} blogunun icine en basa ekle
        pattern2 = r"(server\s*\{)"
        replacement2 = r"\1" + "\n" + API_BACKEND_BLOCK
        new_content = re.sub(pattern2, replacement2, content, count=1)

    if new_content == content:
        print("HATA: Ekleme noktasi bulunamadi. Manuel ekleme gerekiyor.")
        return

    with open(NGINX_CONF, "w") as f:
        f.write(new_content)

    print("api-backend blogu eklendi!")

    # Test
    result = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
    print(result.stdout)
    print(result.stderr)

    if result.returncode == 0:
        print("Nginx config OK! Reload ediliyor...")
        subprocess.run(["systemctl", "reload", "nginx"])
        print("Nginx reload edildi!")
    else:
        print("HATA: Nginx config hatali! Yedekten geri yukleniyor...")
        shutil.copy2(backup_path, NGINX_CONF)
        print(f"Yedek geri yuklendi: {backup_path}")

if __name__ == "__main__":
    main()
