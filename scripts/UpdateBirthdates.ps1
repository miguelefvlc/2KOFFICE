$birthdates = @{}
Write-Host "Obteniendo datos de la API de ESPN..."
for ($i = 1; $i -le 30; $i++) {
    try {
        $url = "http://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/$i/roster"
        $response = Invoke-RestMethod -Uri $url -ErrorAction SilentlyContinue
        if ($response -and $response.athletes) {
            foreach ($athlete in $response.athletes) {
                if ($athlete.fullName -and $athlete.dateOfBirth) {
                    $name = $athlete.fullName.ToLower() -replace '[^\w\s]', ''
                    $date = $athlete.dateOfBirth.Split('T')[0]
                    $birthdates[$name] = $date
                }
            }
        }
    } catch {
        # Ignorar errores de red temporales
    }
}

Write-Host "Datos obtenidos. Actualizando players.csv..."
$lines = Get-Content -Path "players.csv"
$newLines = @()

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($i -eq 0) {
        $newLines += $line
        continue
    }
    
    $parts = $line -split ','
    $rawName = $parts[0]
    $cleanName = $rawName.ToLower() -replace '[^\w\s]', ''
    
    if ($birthdates.ContainsKey($cleanName)) {
        # Update the last column (FechaNacimiento)
        $parts[$parts.Length - 1] = $birthdates[$cleanName]
        $newLines += ($parts -join ',')
    } else {
        $newLines += $line
    }
}

Set-Content -Path "players.csv" -Value $newLines
Write-Host "Actualizacion completada."
