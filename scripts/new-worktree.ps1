<#
.SYNOPSIS
  機能を平行開発するための git worktree + 独立した Docker スタックを作る。

.DESCRIPTION
  - ../moe_trade-<branch> に worktree を作成（ブランチが無ければ Base から分岐して新規作成）
  - Slot 番号からホストポートを一意にずらした root .env を生成（COMPOSE_PROJECT_NAME も設定）
  - main の backend/.env をコピーし、APP_URL / FRONTEND_URL / SANCTUM_STATEFUL_DOMAINS を
    その worktree の nginx ポートへ合わせる（別ポートアクセスでのログイン破綻を防ぐ）

  内部のサービス間通信はサービス名解決（php:9000 / frontend:5173 / db:3306）なので、
  ホスト公開ポートをずらすだけで複数スタックを同時に動かせる。

.EXAMPLE
  pwsh scripts/new-worktree.ps1 -Branch feat-chat -Slot 1
  # → ../moe_trade-feat-chat を作成。nginx=8101 で http://localhost:8101 から確認できる
#>
[CmdletBinding()]
param(
    # 作成/チェックアウトするブランチ名
    [Parameter(Mandatory = $true)]
    [string]$Branch,

    # ポートをずらす枠番号（1,2,3...）。同時に立てるスタックごとに別の番号にする
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 50)]
    [int]$Slot,

    # 新規ブランチを分岐させる元（既存ブランチをチェックアウトする場合は無視される）
    [string]$Base = "main"
)

$ErrorActionPreference = "Stop"

# リポジトリのルート（このスクリプトの1つ上）を基準にする
$repoRoot = Split-Path -Parent $PSScriptRoot
$parent   = Split-Path -Parent $repoRoot

# compose プロジェクト名は小文字英数とアンダースコアのみ
$safe = ($Branch.ToLower() -replace '[^a-z0-9]+', '_').Trim('_')
$projectName = "moe_$safe"
$worktreePath = Join-Path $parent "moe_trade-$safe"

# Slot からポートを算出（範囲を分けて衝突しないようにする）
$ports = [ordered]@{
    NGINX_PORT        = 8100 + $Slot
    VITE_PORT         = 5173 + $Slot
    DB_PORT           = 3306 + $Slot
    PMA_PORT          = 8200 + $Slot
    MAILPIT_UI_PORT   = 8300 + $Slot
    MAILPIT_SMTP_PORT = 1025 + $Slot
}

if (Test-Path $worktreePath) {
    throw "既に存在します: $worktreePath（先に git worktree remove するか別の Branch 名を）"
}

# --- worktree 作成 ---
$branchExists = (git -C $repoRoot branch --list $Branch) -or (git -C $repoRoot branch -r --list "origin/$Branch")
if ($branchExists) {
    Write-Host "既存ブランチ $Branch を worktree にチェックアウトします"
    git -C $repoRoot worktree add $worktreePath $Branch
} else {
    Write-Host "新規ブランチ $Branch を $Base から分岐して worktree を作成します"
    git -C $repoRoot worktree add -b $Branch $worktreePath $Base
}

# --- root .env（compose 用）を生成 ---
# UTF-8 BOM が付くと compose/dotenv が先頭キーを誤読するため、BOM なしで書く
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$envLines = @("COMPOSE_PROJECT_NAME=$projectName")
foreach ($k in $ports.Keys) { $envLines += "$k=$($ports[$k])" }
[System.IO.File]::WriteAllText((Join-Path $worktreePath ".env"), ($envLines -join "`n") + "`n", $utf8NoBom)

# --- backend/.env を main からコピーしてポートを合わせる ---
$srcBackendEnv = Join-Path $repoRoot "backend/.env"
$dstBackendEnv = Join-Path $worktreePath "backend/.env"
if (Test-Path $srcBackendEnv) {
    $nginx = $ports["NGINX_PORT"]
    $origin = "http://localhost:$nginx"
    $content = Get-Content $srcBackendEnv
    $content = $content -replace '^APP_URL=.*',                "APP_URL=$origin"
    $content = $content -replace '^FRONTEND_URL=.*',           "FRONTEND_URL=$origin"
    $content = $content -replace '^SANCTUM_STATEFUL_DOMAINS=.*', "SANCTUM_STATEFUL_DOMAINS=localhost,localhost:$nginx,127.0.0.1"
    [System.IO.File]::WriteAllText($dstBackendEnv, ($content -join "`n") + "`n", $utf8NoBom)
    Write-Host "backend/.env を生成しました（オリジン: $origin）"
} else {
    Write-Warning "main の backend/.env が無いため backend/.env を生成できませんでした。手動で用意してください。"
}

Write-Host ""
Write-Host "=== 作成完了 ===" -ForegroundColor Green
Write-Host "worktree   : $worktreePath"
Write-Host "project    : $projectName"
Write-Host "ブラウザ   : http://localhost:$($ports['NGINX_PORT'])"
Write-Host "phpMyAdmin : http://localhost:$($ports['PMA_PORT'])"
Write-Host "Mailpit    : http://localhost:$($ports['MAILPIT_UI_PORT'])"
Write-Host ""
Write-Host "次の手順:" -ForegroundColor Cyan
Write-Host "  cd `"$worktreePath`""
Write-Host "  docker compose up -d"
Write-Host "  docker compose exec php php artisan migrate   # 初回のみ（DB は独立）"
Write-Host ""
Write-Host "片付け:" -ForegroundColor Cyan
Write-Host "  docker compose -p $projectName down -v        # コンテナ + DB ボリュームを破棄"
Write-Host "  git -C `"$repoRoot`" worktree remove `"$worktreePath`""
