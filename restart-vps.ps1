# Script para reiniciar los procesos (API y Server) en el VPS de DonWeb
Write-Host "Reiniciando procesos (aoweb-api y aoweb-server) en el VPS..." -ForegroundColor Cyan

ssh -p 5490 root@138.219.42.117 "pm2 restart all && pm2 list"

Write-Host "¡Procesos reiniciados con éxito!" -ForegroundColor Green
