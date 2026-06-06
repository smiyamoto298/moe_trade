Write-Host "=== MoE Trade Setup ===" -ForegroundColor Cyan
Set-Location $PSScriptRoot

# [1/5] Build Docker images
Write-Host "[1/5] Building Docker images..." -ForegroundColor Yellow
docker compose build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

# [2/5] Create Laravel project
$artisan = Join-Path $PSScriptRoot "backend\artisan"
if (Test-Path $artisan) {
    Write-Host "[2/5] Laravel already set up." -ForegroundColor Green
} else {
    Write-Host "[2/5] Creating Laravel project..." -ForegroundColor Yellow
    docker compose run --rm php composer create-project laravel/laravel . --prefer-dist
    if ($LASTEXITCODE -ne 0) { Write-Host "Laravel setup failed." -ForegroundColor Red; exit 1 }
}

# [3/5] .env setup
$envExample = Join-Path $PSScriptRoot "backend\.env.example"
$envFile    = Join-Path $PSScriptRoot "backend\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
}

$content = Get-Content $envFile
$content = $content -replace "DB_HOST=.*",     "DB_HOST=db"
$content = $content -replace "DB_DATABASE=.*", "DB_DATABASE=moe_trade"
$content = $content -replace "DB_USERNAME=.*", "DB_USERNAME=moe"
$content = $content -replace "DB_PASSWORD=.*", "DB_PASSWORD=moe_password"
Set-Content $envFile $content

Write-Host "[3/5] Generating app key..." -ForegroundColor Yellow
docker compose run --rm php php artisan key:generate

# [4/5] Start containers
Write-Host "[4/5] Starting containers..." -ForegroundColor Yellow
docker compose up -d

# [5/5] Migrate
Write-Host "[5/5] Waiting for DB (15s)..." -ForegroundColor Yellow
Start-Sleep -Seconds 15
docker compose exec php php artisan migrate --force

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "  Frontend  : http://localhost"
Write-Host "  API       : http://localhost/api"
Write-Host "  phpMyAdmin: http://localhost:8080"
