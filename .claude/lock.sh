#!/usr/bin/env bash
# .claude/lock.sh — 並行サブエージェントのファイル衝突防止用ロック。
#
# 使い方:
#   bash .claude/lock.sh acquire <agent_id> <relative_filepath>   # 取得(取れなければ非0で終了)
#   bash .claude/lock.sh release <agent_id> <relative_filepath>   # 解放(自分のロックのみ)
#   bash .claude/lock.sh check   <relative_filepath>              # 保有者を表示(無ければ空)
#
# ロックは .claude/locks/<sanitized_path>.lock に「<agent_id> <epoch>」を書く。
# STALE_SEC 秒より古いロックは自動的に奪取可能(クラッシュ時の握りっぱなし対策)。
#
# 設計意図: 依存を増やさないため bash + ファイルのみで実装。Windows でも Git Bash /
# WSL 上で動く。実装エージェントは編集前に acquire し、取れなければ待つ(=順番待ち)。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_DIR="$ROOT/.claude/locks"
STALE_SEC="${MOE_LOCK_STALE_SEC:-1800}"   # 既定30分
mkdir -p "$LOCK_DIR"

now() { date +%s; }

sanitize() {
  # パス区切り等をアンダースコアに。ロックファイル名を1階層に潰す。
  printf '%s' "$1" | sed 's#[/\\: ]#_#g'
}

lockfile_for() {
  printf '%s/%s.lock' "$LOCK_DIR" "$(sanitize "$1")"
}

cmd="${1:-}"; shift || true

case "$cmd" in
  acquire)
    agent_id="${1:?agent_id required}"; filepath="${2:?filepath required}"
    lf="$(lockfile_for "$filepath")"
    if [ -f "$lf" ]; then
      holder="$(awk '{print $1}' "$lf")"
      ts="$(awk '{print $2}' "$lf")"
      age=$(( $(now) - ${ts:-0} ))
      if [ "$holder" = "$agent_id" ]; then
        # 自分が既に保有(再入可)
        printf '%s %s\n' "$agent_id" "$(now)" > "$lf"
        echo "OK reentrant $filepath"
        exit 0
      fi
      if [ "$age" -lt "$STALE_SEC" ]; then
        echo "LOCKED_BY $holder (age ${age}s) $filepath" >&2
        exit 3   # 取得失敗 = 呼び出し側は待つ
      fi
      echo "STALE_TAKEOVER from $holder (age ${age}s) $filepath" >&2
    fi
    printf '%s %s\n' "$agent_id" "$(now)" > "$lf"
    echo "OK acquired $filepath"
    ;;
  release)
    agent_id="${1:?agent_id required}"; filepath="${2:?filepath required}"
    lf="$(lockfile_for "$filepath")"
    if [ -f "$lf" ]; then
      holder="$(awk '{print $1}' "$lf")"
      if [ "$holder" = "$agent_id" ]; then
        rm -f "$lf"; echo "OK released $filepath"
      else
        echo "REFUSE not owner (held by $holder) $filepath" >&2; exit 4
      fi
    else
      echo "OK already free $filepath"
    fi
    ;;
  check)
    filepath="${1:?filepath required}"
    lf="$(lockfile_for "$filepath")"
    [ -f "$lf" ] && cat "$lf" || true
    ;;
  *)
    echo "usage: lock.sh {acquire|release|check} ..." >&2; exit 2
    ;;
esac
