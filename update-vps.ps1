# Script para bajar los cambios de GitHub, recompilar y reiniciar el VPS de DonWeb
Write-Host "Obteniendo ultimos cambios de GitHub en el VPS..." -ForegroundColor Cyan

ssh -p 5490 root@138.219.42.117 "cd /var/www/aoweb && git pull && cd server && pnpm install && pnpm build && pnpm export-frontend-maps && cd ../frontend && pnpm install && pnpm build && cd ../api && pnpm install && pnpm build && pm2 restart all && pm2 save && pm2 list"

Write-Host "¡Servidor VPS actualizado y reiniciado con exito!" -ForegroundColor Green
