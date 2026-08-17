<#
.SYNOPSIS
  セッションを分離するための git worktree + 独立した Docker スタックを作る。

.DESCRIPTION
  「1セッション = 1ブランチ = 1 worktree = 1 Docker スタック」運用の入口。
  複数の Claude Code セッション / 開発者が同じリポジトリを同時に触っても、ファイルも
  コンテナも DB も物理的に分離されるため、待ち合わせ（ロック）が一切要らなくなる。

  やること:
  - ../moe_trade-<branch> に worktree を作成（ブランチが無ければ Base から分岐して新規作成）
  - Slot 番号からホストポートを一意にずらした root .env を生成（COMPOSE_PROJECT_NAME も設定）。
    Slot 省略時は既存 worktree と実際の LISTEN 状況を見て空き番号を自動採番する
  - main の backend/.env をコピーし、APP_URL / FRONTEND_URL / SANCTUM_STATEFUL_DOMAINS を
    その worktree の nginx ポートへ合わせる（別ポートアクセスでのログイン破綻を防ぐ）
  - スタックを起動し、composer install → migrate --seed まで済ませて使える状態にする

  内部のサービス間通信はサービス名解決（php:9000 / frontend:5173 / db:3306）なので、
  ホスト公開ポートをずらすだけで複数スタックを同時に動かせる。

.EXAMPLE
  powershell -File scripts/new-worktree.ps1 -Branch feat-chat
  # → ../moe_trade-feat-chat を作成し、空き Slot のポートで起動まで済ませる

.EXAMPLE
  powershell -File scripts/new-worktree.ps1 -Branch feat-chat -Lean
  # → mailpit / phpMyAdmin / scheduler を省いた軽量スタック（コンテナ7→4）

.EXAMPLE
  powershell -File scripts/new-worktree.ps1 -Branch feat-chat -NoStart
  # → ファイルだけ用意して Docker は起動しない（テストだけ回すセッション向け）
#>
[CmdletBinding()]
param(
    # 作成/チェックアウトするブランチ名
    [Parameter(Mandatory = $true)]
    [string]$Branch,

    # ポートをずらす枠番号（1,2,3...）。省略時は空き枠を自動採番する
    [ValidateRange(1, 50)]
    [int]$Slot = 0,

    # 新規ブランチを分岐させる元（既存ブランチをチェックアウトする場合は無視される）
    [string]$Base = "main",

    # Docker を起動せず、ファイル生成だけ行う
    [switch]$NoStart,

    # mailpit / phpMyAdmin / scheduler を起動しない軽量スタック
    [switch]$Lean,

    # main スタックの DB 内容を新スタックへコピーする（既定は migrate --seed の空DB）
    [switch]$CopyDb
)

$ErrorActionPreference = "Stop"

# リポジトリのルート（このスクリプトの1つ上）を基準にする
$repoRoot = Split-Path -Parent $PSScriptRoot
$parent   = Split-Path -Parent $repoRoot

# compose プロジェクト名は小文字英数とアンダースコアのみ
$safe = ($Branch.ToLower() -replace '[^a-z0-9]+', '_').Trim('_')
if (-not $safe) { throw "Branch 名から有効なスタック名を作れません: $Branch" }
$projectName  = "moe_$safe"
$worktreePath = Join-Path $parent "moe_trade-$safe"

# --- Slot からポートを算出するテーブル（範囲を分けて衝突しないようにする） ---
function Get-SlotPorts([int]$s) {
    return [ordered]@{
        NGINX_PORT        = 8100 + $s
        VITE_PORT         = 5173 + $s
        DB_PORT           = 3306 + $s
        PMA_PORT          = 8200 + $s
        MAILPIT_UI_PORT   = 8300 + $s
        MAILPIT_SMTP_PORT = 1025 + $s
    }
}

# 既存 worktree の .env から使用中 Slot を集める（NGINX_PORT - 8100 = Slot）
function Get-UsedSlots {
    $used = @()
    $lines = git -C $repoRoot worktree list --porcelain
    foreach ($line in $lines) {
        if ($line -notmatch '^worktree\s+(.+)$') { continue }
        $wt = $Matches[1] -replace '/', '\'
        $envPath = Join-Path $wt ".env"
        if (-not (Test-Path $envPath)) { continue }
        foreach ($l in (Get-Content $envPath)) {
            if ($l -match '^\s*NGINX_PORT\s*=\s*(\d+)') { $used += ([int]$Matches[1] - 8100) }
        }
    }
    return $used
}

# そのポート群が実際に空いているか（他プロセスの LISTEN もチェック）
function Test-PortsFree($ports) {
    try {
        $listening = (Get-NetTCPConnection -State Listen -ErrorAction Stop).LocalPort
    } catch {
        return $true   # 取得できない環境ではポート衝突チェックを諦める（起動時に判明する）
    }
    foreach ($p in $ports.Values) {
        if ($listening -contains $p) { return $false }
    }
    return $true
}

if ($Slot -eq 0) {
    $used = Get-UsedSlots
    for ($i = 1; $i -le 50; $i++) {
        if ($used -contains $i) { continue }
        if (-not (Test-PortsFree (Get-SlotPorts $i))) { continue }
        $Slot = $i; break
    }
    if ($Slot -eq 0) { throw "空きスロットがありません。不要な worktree を scripts/remove-worktree.ps1 で片付けてください。" }
    Write-Host "Slot を自動採番しました: $Slot" -ForegroundColor Cyan
}
$ports = Get-SlotPorts $Slot

if (Test-Path $worktreePath) {
    throw "既に存在します: $worktreePath（先に scripts/remove-worktree.ps1 で片付けるか、別の Branch 名を）"
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
if ($LASTEXITCODE -ne 0) { throw "git worktree add に失敗しました" }

# --- root .env（compose 用）を生成 ---
# UTF-8 BOM が付くと compose/dotenv が先頭キーを誤読するため、BOM なしで書く
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$envLines = @("COMPOSE_PROJECT_NAME=$projectName")
foreach ($k in $ports.Keys) { $envLines += "$k=$($ports[$k])" }
[System.IO.File]::WriteAllText((Join-Path $worktreePath ".env"), ($envLines -join "`n") + "`n", $utf8NoBom)

# --- backend/.env を main からコピーしてポートを合わせる ---
$srcBackendEnv = Join-Path $repoRoot "backend/.env"
$dstBackendEnv = Join-Path $worktreePath "backend/.env"
$nginx  = $ports["NGINX_PORT"]
$origin = "http://localhost:$nginx"
if (Test-Path $srcBackendEnv) {
    $content = Get-Content $srcBackendEnv
    $content = $content -replace '^APP_URL=.*',                  "APP_URL=$origin"
    $content = $content -replace '^FRONTEND_URL=.*',             "FRONTEND_URL=$origin"
    $content = $content -replace '^SANCTUM_STATEFUL_DOMAINS=.*', "SANCTUM_STATEFUL_DOMAINS=localhost,localhost:$nginx,127.0.0.1"
    [System.IO.File]::WriteAllText($dstBackendEnv, ($content -join "`n") + "`n", $utf8NoBom)
    Write-Host "backend/.env を生成しました（オリジン: $origin）"
} else {
    Write-Warning "main の backend/.env が無いため backend/.env を生成できませんでした。手動で用意してください。"
}

# --- gitignore 対象で worktree に入らないローカル設定を引き継ぐ ---
$srcFrontEnv = Join-Path $repoRoot "frontend/.env.local"
if (Test-Path $srcFrontEnv) {
    Copy-Item $srcFrontEnv (Join-Path $worktreePath "frontend/.env.local")
    Write-Host "frontend/.env.local をコピーしました"
}
# Claude Code のローカル許可設定（無いと worktree セッションで権限を聞き直される）
$srcLocalSettings = Join-Path $repoRoot ".claude/settings.local.json"
if (Test-Path $srcLocalSettings) {
    Copy-Item $srcLocalSettings (Join-Path $worktreePath ".claude/settings.local.json")
    Write-Host ".claude/settings.local.json をコピーしました"
}

# --- スタック起動 + 初期化 ---
if (-not $NoStart) {
    Push-Location $worktreePath
    try {
        # 軽量スタックは mailpit / phpmyadmin / scheduler を省く（コンテナ7→4）
        $services = @()
        if ($Lean) { $services = @("db", "php", "nginx", "frontend") }

        Write-Host "[1/4] コンテナを起動します..." -ForegroundColor Yellow
        docker compose up -d @services
        if ($LASTEXITCODE -ne 0) { throw "docker compose up に失敗しました" }

        # vendor は named volume（プロジェクトごとに新規＝空）なので必ず入れ直す
        Write-Host "[2/4] composer install（vendor はスタックごとに独立）..." -ForegroundColor Yellow
        docker compose exec -T -e COMPOSER_PROCESS_TIMEOUT=0 php composer install
        if ($LASTEXITCODE -ne 0) { Write-Warning "composer install に失敗しました。worktree 内で手動実行してください。" }

        Write-Host "[3/4] DB の起動を待機..." -ForegroundColor Yellow
        # 注: native コマンドの stderr を PowerShell 側でリダイレクトすると
        # NativeCommandError になり得るため、あえて捨てずに終了コードだけ見る。
        $ready = $false
        for ($i = 0; $i -lt 30; $i++) {
            docker compose exec -T db mysqladmin ping -h localhost -u root -proot | Out-Null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 2
        }
        if (-not $ready) { Write-Warning "DB が起動しませんでした。docker compose logs db を確認してください。" }

        if ($CopyDb -and $ready) {
            Write-Host "[4/4] main スタックの DB を複製します..." -ForegroundColor Yellow
            $dumpFile = Join-Path $env:TEMP "moe_trade_$safe.sql"
            Push-Location $repoRoot
            # Out-File は BOM を付けてしまい mysql 取り込みが壊れるので BOM なしで書く
            $dump = docker compose exec -T db mysqldump -u root -proot --databases moe_trade
            Pop-Location
            if ($LASTEXITCODE -eq 0 -and $dump) {
                [System.IO.File]::WriteAllText($dumpFile, ($dump -join "`n") + "`n", $utf8NoBom)
            }
            if (Test-Path $dumpFile) {
                Get-Content $dumpFile | docker compose exec -T db mysql -u root -proot
                Remove-Item $dumpFile -Force
                Write-Host "main の DB 内容を複製しました" -ForegroundColor Green
            } else {
                Write-Warning "main の DB ダンプに失敗しました。migrate --seed で空DBを作ってください。"
            }
        } elseif ($ready) {
            Write-Host "[4/4] migrate --seed（DB はスタックごとに独立）..." -ForegroundColor Yellow
            docker compose exec -T php php artisan migrate --force --seed
            if ($LASTEXITCODE -ne 0) { Write-Warning "migrate に失敗しました。worktree 内で手動実行してください。" }
        }
    } finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "=== 作成完了 ===" -ForegroundColor Green
Write-Host "worktree   : $worktreePath"
Write-Host "branch     : $Branch"
Write-Host "project    : $projectName (slot $Slot)"
Write-Host "ブラウザ   : $origin"
if (-not $Lean) {
    Write-Host "phpMyAdmin : http://localhost:$($ports['PMA_PORT'])"
    Write-Host "Mailpit    : http://localhost:$($ports['MAILPIT_UI_PORT'])"
}
Write-Host ""
Write-Host "このセッション用のターミナルで:" -ForegroundColor Cyan
Write-Host "  cd `"$worktreePath`""
if ($NoStart) { Write-Host "  docker compose up -d   # 必要なら" }
Write-Host "  claude"
Write-Host ""
Write-Host "片付け:" -ForegroundColor Cyan
Write-Host "  powershell -File `"$repoRoot\scripts\remove-worktree.ps1`" -Branch $Branch -DeleteBranch"
