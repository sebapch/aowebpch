#!/usr/bin/env bash
#
# Agrega el `location /maps/` al nginx del VPS, para que las peticiones de mapas
# en vivo lleguen al game server (127.0.0.1:7666) en vez de caer en el catch-all
# `location /` que las manda a la api.
#
# Sin esto, `GET /maps/mapa_N.json` lo contesta Express con un 404 y el cliente
# cae en silencio al archivo estatico de `public/maps/`, que solo cambia con un
# redeploy del frontend.
#
# Uso (desde PowerShell, en la raiz del repo):
#   Get-Content scripts/add-nginx-maps-location.sh -Raw | ssh -p 5490 root@138.219.42.117 "bash -s"
#
# Es idempotente: si el bloque ya existe, no toca nada.

set -euo pipefail

CONF=$(grep -rl 'location /maps/' /etc/nginx/ 2>/dev/null | head -1 || true)
if [ -n "$CONF" ]; then
    echo "Ya existe un 'location /maps/' en $CONF. No hago nada."
    exit 0
fi

CONF=$(grep -rl 'location /editor/' /etc/nginx/ 2>/dev/null | head -1 || true)
if [ -z "$CONF" ]; then
    echo "ERROR: no encontre ningun archivo con 'location /editor/' en /etc/nginx/." >&2
    exit 1
fi

echo "Archivo de config: $CONF"

BACKUP="${CONF}.bak-$(date +%Y%m%d%H%M%S)"
cp -p "$CONF" "$BACKUP"
echo "Backup: $BACKUP"

# Insertamos el bloque nuevo justo antes del de /editor/, que ya apunta al 7666.
awk '
    /location \/editor\/[[:space:]]*\{/ && !inserted {
        print "    location /maps/ {"
        print "        proxy_pass http://127.0.0.1:7666/maps/;"
        print "        proxy_set_header Host $host;"
        print "        proxy_set_header X-Real-IP $remote_addr;"
        print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
        print "        proxy_set_header X-Forwarded-Proto $scheme;"
        print "    }"
        print ""
        inserted = 1
    }
    { print }
' "$BACKUP" > "$CONF"

if ! grep -q 'location /maps/' "$CONF"; then
    cp -p "$BACKUP" "$CONF"
    echo "ERROR: no se pudo insertar el bloque. Restaure el backup, nada cambio." >&2
    exit 1
fi

if nginx -t; then
    systemctl reload nginx
    echo
    echo "nginx recargado. Verificacion:"
    curl -s -o /dev/null -w "  game server directo -> %{http_code}\n" \
        http://127.0.0.1:7666/maps/mapa_1.json
    # Con --resolve, no con -H "Host:": pegarle a https://127.0.0.1 no manda SNI
    # (el TLS no lo permite con IPs), nginx elige otro server block y devuelve un
    # 404 enganioso aunque la config este perfecta.
    curl -s -o /dev/null -w "  a traves de nginx   -> %{http_code}\n" \
        -k --resolve vps-6227968-x.dattaweb.com:443:127.0.0.1 \
        https://vps-6227968-x.dattaweb.com/maps/mapa_1.json
else
    cp -p "$BACKUP" "$CONF"
    echo "ERROR: 'nginx -t' fallo. Restaure el backup y NO recargue nada." >&2
    exit 1
fi
