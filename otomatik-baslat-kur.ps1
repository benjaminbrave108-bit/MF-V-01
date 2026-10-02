# MF-V-01'i Windows oturumu açıldığında gizli olarak otomatik başlatır.
# Kullanım (proje klasöründe):  powershell -ExecutionPolicy Bypass -File .\otomatik-baslat-kur.ps1
# Kaldırmak için:               powershell -ExecutionPolicy Bypass -File .\otomatik-baslat-kur.ps1 -Kaldir
param([switch]$Kaldir)
$ErrorActionPreference = "Stop"
$taskName = "MFV01-Sunucu"
$proje = $PSScriptRoot

if ($Kaldir) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Otomatik baslatma kaldirildi."
  return
}

# PostgreSQL servisi bilgisayar açılışında otomatik başlasın
Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | ForEach-Object {
  Set-Service -Name $_.Name -StartupType Automatic
  if ($_.Status -ne "Running") { Start-Service $_.Name }
}

$komut = "Set-Location '$proje'; npm.cmd run dev *>> '$proje\sunucu.log'"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$komut`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Tamam. Sunucu arka planda baslatildi ve her oturum acilisinda otomatik baslayacak."
Write-Host "Birkac saniye sonra http://localhost:5173 adresini acabilirsiniz. Kayit: $proje\sunucu.log"
