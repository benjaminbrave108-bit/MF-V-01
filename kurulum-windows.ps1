# MF-V-01 Windows kurulum betiği.
# Kullanım: PowerShell'de proje klasöründe  ->  powershell -ExecutionPolicy Bypass -File .\kurulum-windows.ps1
# Node.js 22, PostgreSQL 16 ve Git'i winget ile kurar; veritabanını, .env.local'i
# hazırlar; migration + seed çalıştırır ve geliştirme sunucusunu başlatır.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function RefreshPath {
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}

if (-not (Has "node"))  { winget install -e --id OpenJS.NodeJS --accept-source-agreements --accept-package-agreements; RefreshPath }
if (-not (Has "git"))   { winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements; RefreshPath }

$pgPass = "mfv_dev_pw"
if (-not (Has "psql")) {
  winget install -e --id PostgreSQL.PostgreSQL.16 --accept-source-agreements --accept-package-agreements `
    --override "--mode unattended --unattendedmodeui none --superpassword $pgPass"
  $pgBin = Get-ChildItem "C:\Program Files\PostgreSQL\16\bin" -ErrorAction SilentlyContinue
  $env:Path += ";C:\Program Files\PostgreSQL\16\bin"
}
$env:PGPASSWORD = $pgPass
$exists = & psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='mfv01'"
if (-not $exists) { & psql -U postgres -h localhost -c "CREATE DATABASE mfv01" }

if (-not (Test-Path ".env.local")) {
@"
DATABASE_URL=postgres://postgres:$pgPass@localhost:5432/mfv01
SESSION_COOKIE_SECURE=false
SEED_ADMIN_PASSWORD=Admin-Dev-12345
SEED_MANAGER_PASSWORD=Manager-Dev-12345
SEED_USER_PASSWORD=User-Dev-12345
"@ | Set-Content -Encoding ASCII .env.local
}

npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci basarisiz oldu." }
$env:DATABASE_URL = "postgres://postgres:$pgPass@localhost:5432/mfv01"
npx drizzle-kit migrate
if ($LASTEXITCODE -ne 0) { throw "Migration basarisiz oldu (yukaridaki hataya bakin)." }
node --env-file=.env.local scripts/seed-users.mjs
if ($LASTEXITCODE -ne 0) { throw "Seed basarisiz oldu (yukaridaki hataya bakin)." }

Write-Host "`nHazir. Tarayicida (Edge/Chrome) http://localhost:5173 adresini ac. Giris: admin / Admin-Dev-12345`n"
Start-Process "http://localhost:5173"
npm run dev
