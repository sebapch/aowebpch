# Script para bajar los cambios de GitHub, recompilar y reiniciar el VPS de DonWeb
#
# Ya no corre `export-frontend-maps`: los mapas estaticos de
# `frontend/public/maps/` estan versionados y llegan por el `git pull`, asi que
# regenerarlos aca solo ensuciaria el arbol y haria fallar el pull siguiente.
# El estatico es el respaldo; lo que se ve en `/play` sale del endpoint en vivo
# del servidor de juego (`GET /maps/mapa_N.json`).
#
# El frontend NO se builda aca: esta en Vercel (proyecto "csao2") y se
# despliega solo con cada push a GitHub.
Write-Host "Obteniendo ultimos cambios de GitHub en el VPS..." -ForegroundColor Cyan

ssh -p 5490 root@138.219.42.117 "cd /var/www/aoweb && git pull && cd server && pnpm install && pnpm build && cd ../api && pnpm install && pnpm build && pm2 restart all && pm2 save && pm2 list"

Write-Host "¡Servidor VPS actualizado y reiniciado con exito!" -ForegroundColor Green
