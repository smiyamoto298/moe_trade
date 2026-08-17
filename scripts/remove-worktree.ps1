<#
.SYNOPSIS
  new-worktree.ps1 で作った worktree と、その Docker スタックを丸ごと片付ける。

.DESCRIPTION
  片付けが面倒だと worktree 運用は続かないので、以下を一括で行う。

  1. worktree に未コミット変更 / main 未マージのコミットが無いか確認（あれば中断。-Force で強行）
  2. その worktree の Docker スタックを down -v（コンテナ + DB / vendor / node_modules ボリューム破棄）
  3. git worktree remove
  4. -DeleteBranch 指定時はブランチも削除

  worktree を消さないとポート枠（Slot）が空かないため、作業が終わったら必ず実行する。

.EXAMPLE
  powershell -File scripts/remove-worktree.ps1 -Branch feat-chat -DeleteBranch

.EXAMPLE
  powershell -File scripts/remove-worktree.ps1 -List
  # → 現在の worktree とスタック（プロジェクト名 / ポート）の一覧
#>
[CmdletBinding()]
param(
    # 片付ける worktree のブランチ名（-List 時は不要）
    [string]$Branch,

    # 一覧表示だけして終了する
    [switch]$List,

    # 未コミット変更 / 未マージコミットがあっても破棄して片付ける
    [switch]$Force,

    # worktree 削除後にブランチも削除する
    [switch]$DeleteBranch,

    # DB などの named volume を残す（同じブランチで作り直すとき用）
    [switch]$KeepVolumes
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$parent   = Split-Path -Parent $repoRoot

# --- 一覧表示 ---
if ($List) {
    Write-Host "=== worktree / スタック一覧 ===" -ForegroundColor Cyan
    $current = $null
    foreach ($line in (git -C $repoRoot worktree list --porcelain)) {
        if ($line -match '^worktree\s+(.+)$') { $current = $Matches[1] -replace '/', '\' }
        if ($line -match '^branch\s+refs/heads/(.+)$' -and $current) {
            $br = $Matches[1]
            $envPath = Join-Path $current ".env"
            $proj = "(main / 既定ポート)"
            if (Test-Path $envPath) {
                $p = ""; $n = ""
                foreach ($l in (Get-Content $envPath)) {
                    if ($l -match '^\s*COMPOSE_PROJECT_NAME\s*=\s*(.+)$') { $p = $Matches[1].Trim() }
                    if ($l -match '^\s*NGINX_PORT\s*=\s*(\d+)')           { $n = $Matches[1] }
                }
                if ($p) { $proj = "$p  http://localhost:$n  (slot $([int]$n - 8100))" }
            }
            Write-Host ("{0,-24} {1,-40} {2}" -f $br, $current, $proj)
        }
    }
    exit 0
}

if (-not $Branch) { throw "-Branch を指定してください（一覧は -List）" }

$safe = ($Branch.ToLower() -replace '[^a-z0-9]+', '_').Trim('_')
$projectName  = "moe_$safe"
$worktreePath = Join-Path $parent "moe_trade-$safe"

if (-not (Test-Path $worktreePath)) {
    throw "worktree が見つかりません: $worktreePath"
}
if ((Resolve-Path $worktreePath).Path -eq (Resolve-Path $repoRoot).Path) {
    throw "main のワーキングツリーは削除できません。"
}

# --- 1) 未コミット / 未マージの確認 ---
if (-not $Force) {
    $dirty = git -C $worktreePath status --porcelain
    if ($dirty) {
        Write-Host "未コミットの変更が残っています:" -ForegroundColor Red
        $dirty | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
        throw "先にコミット（または破棄）してください。強行するなら -Force。"
    }
    $unmerged = git -C $repoRoot log --oneline "main..$Branch" 2>$null
    if ($unmerged) {
        Write-Host "main に未マージのコミットがあります:" -ForegroundColor Red
        $unmerged | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
        throw "先に main へマージしてください。強行するなら -Force。"
    }
}

# --- 2) Docker スタックの破棄 ---
Write-Host "[1/3] Docker スタック $projectName を停止します..." -ForegroundColor Yellow
Push-Location $worktreePath
try {
    if ($KeepVolumes) {
        docker compose down
    } else {
        docker compose down -v
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "docker compose down が失敗しました（既に停止済みなら無視して構いません）。"
    }
} finally {
    Pop-Location
}

# --- 3) worktree 削除 ---
Write-Host "[2/3] worktree を削除します: $worktreePath" -ForegroundColor Yellow
if ($Force) {
    git -C $repoRoot worktree remove --force $worktreePath
} else {
    git -C $repoRoot worktree remove $worktreePath
}
if ($LASTEXITCODE -ne 0) { throw "git worktree remove に失敗しました" }
git -C $repoRoot worktree prune

# --- 4) ブランチ削除 ---
if ($DeleteBranch) {
    Write-Host "[3/3] ブランチ $Branch を削除します" -ForegroundColor Yellow
    if ($Force) {
        git -C $repoRoot branch -D $Branch
    } else {
        git -C $repoRoot branch -d $Branch
    }
    if ($LASTEXITCODE -ne 0) { Write-Warning "ブランチ削除に失敗しました（未マージなら -Force）。" }
} else {
    Write-Host "[3/3] ブランチ $Branch は残しました（削除するなら -DeleteBranch）" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=== 片付け完了: $Branch ===" -ForegroundColor Green
Write-Host "ポート枠（slot）が空きました。次の worktree で自動採番されます。"
