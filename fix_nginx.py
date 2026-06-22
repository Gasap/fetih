#!/usr/bin/env python3
"""
fix_nginx.py - Nginx ayarlarini otomatik gunceller (API ve WebSoket Yonlendirmeleri)
Kullanim: python3 fix_nginx.py
"""
import re, shutil, os, subprocess, datetime

NGINX_CONF = "/etc/nginx/sites-enabled/imparatorluk"

MAP_BLOCK = """# WebSocket settings
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
"""

API_AND_WORKERS_BLOCK = """
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

    # Worker locations - Game Servers & WebSockets
    location ~* ^/w(\\d+)(/.*)?$ {
        set $worker $1;
        set $worker_port 3001;
        
        if ($worker = "0") { set $worker_port 3001; }
        if ($worker = "1") { set $worker_port 3002; }
        if ($worker = "2") { set $worker_port 3003; }
        if ($worker = "3") { set $worker_port 3004; }
        if ($worker = "4") { set $worker_port 3005; }
        if ($worker = "5") { set $worker_port 3006; }
        if ($worker = "6") { set $worker_port 3007; }
        if ($worker = "7") { set $worker_port 3008; }
        if ($worker = "8") { set $worker_port 3009; }
        if ($worker = "9") { set $worker_port 3010; }
        
        # Preserve query string
        proxy_pass http://127.0.0.1:$worker_port$2$is_args$args;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
"""

def main():
    if not os.path.exists(NGINX_CONF):
        print(f"HATA: {NGINX_CONF} bulunamadi!")
        return

    with open(NGINX_CONF, "r") as f:
        content = f.read()

    # 1. Map blogunu ekle (eger yoksa)
    if "connection_upgrade" not in content:
        print("WebSocket map blogu ekleniyor...")
        content = MAP_BLOCK + "\n" + content

    # 2. api-backend ve worker yonlendirmelerini ekle
    if "api-backend" in content or "location ~* ^/w" in content:
        print("UYARI: api-backend veya wX yonlendirmeleri zaten mevcut! Eski olanlar temizleniyor...")
        # Temizle (eski versiyonlari silelim ki ust uste binmesin)
        content = re.sub(r"\s*# Custom Auth API backend.*?\n\s*}\n\s*# Admin panel.*?\n\s*}\n\s*# Worker locations.*?\n\s*}", "", content, flags=re.DOTALL)
        content = re.sub(r"\s*location \^~ /api-backend/.*?\n\s*}", "", content, flags=re.DOTALL)
        content = re.sub(r"\s*location \^~ /admin.*?\n\s*}", "", content, flags=re.DOTALL)
        content = re.sub(r"\s*location ~\* \^/w.*?\n\s*}", "", content, flags=re.DOTALL)

    # Simdi temizlenmis/yeni dosyaya blogu ekle
    # Ekleme noktasi: ilk listen 443 veya ssl_certificate içeren server blogunun baslangici
    match = re.search(r"listen\s+443 ssl.*?;\n", content)
    if match:
        idx = match.end()
        new_content = content[:idx] + API_AND_WORKERS_BLOCK + content[idx:]
    else:
        # Fallback: ilk server blogunun en basina ekle
        new_content = content.replace("server {", "server {" + API_AND_WORKERS_BLOCK, 1)

    # Yedek al
    backup_path = f"{NGINX_CONF}.backup.{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(NGINX_CONF, backup_path)
    print(f"Yedek alindi: {backup_path}")

    with open(NGINX_CONF, "w") as f:
        f.write(new_content)

    print("Yeni Nginx kuralları başarıyla eklendi/güncellendi!")

    # Test
    result = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
    print(result.stdout)
    print(result.stderr)

    if result.returncode == 0:
        print("Nginx syntax OK! Reload ediliyor...")
        subprocess.run(["systemctl", "reload", "nginx"])
        print("Nginx reload edildi ve yeni kurallar aktif!")
    else:
        print("HATA: Nginx config hatali! Yedekten geri yukleniyor...")
        shutil.copy2(backup_path, NGINX_CONF)
        print(f"Yedek geri yuklendi: {backup_path}")

if __name__ == "__main__":
    main()
