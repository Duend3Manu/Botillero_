param([string]$TaskName = "Botillero")
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Servicio eliminado: $TaskName"
