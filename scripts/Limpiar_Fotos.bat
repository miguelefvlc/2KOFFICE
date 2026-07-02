@echo off
echo =======================================================
echo     Limpiando nombres de las fotos de 2kratings...
echo =======================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0photos' -File | ForEach-Object { $newName = $_.Name -replace '(?i)^imgi_\d+_(.*?)(-2k-rating.*)?(\.[a-z0-9]+)$', '$1$3'; $newName = $newName.ToLower(); if ($newName -ne $_.Name) { try { Rename-Item -Path $_.FullName -NewName $newName -ErrorAction Stop; Write-Host ('Renombrado: ' + $_.Name + ' -^> ' + $newName) } catch { Write-Host ('Saltando (quizas ya existe): ' + $_.Name) } } }"

echo.
echo =======================================================
echo                 PROCESO COMPLETADO
echo =======================================================
timeout /t 5
