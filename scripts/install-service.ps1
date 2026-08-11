param(
    [string]$TaskName = "Botillero",
    [string]$NodePath = "node.exe"
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$IndexPath = Join-Path $ProjectRoot "index.js"

if (!(Test-Path -LiteralPath $IndexPath)) { throw "No se encontró index.js en $ProjectRoot" }

$Action = New-ScheduledTaskAction -Execute $NodePath -Argument 'index.js' -WorkingDirectory $ProjectRoot
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Botillero WhatsApp" -Force
Write-Host "Servicio instalado. Inícialo con: Start-ScheduledTask -TaskName $TaskName"
