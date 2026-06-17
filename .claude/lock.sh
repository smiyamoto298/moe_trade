#!/usr/bin/env bash
# .claude/lock.sh — 並行作業のファイル衝突防止ロック(サブエージェント＆クロスセッション共用)。
#
# 使い方:
#   bash .claude/lock.sh acquire <holder_id> <relative_filepath>  # 取得(取れなければ非0)
#   bash .claude/lock.sh release <holder_id> <relative_filepath>  # 解放(自分のロックのみ)
#   bash .claude/lock.sh check   <relative_filepath>             # 保有者を表示(無ければ空)
#   bash .claude/lock.sh wait    <holder_id> <relative_filepath> [timeout_sec]
#                                                                # 空くまで待って取得(既定600s)
#   bash .claude/lock.sh list                                    # 現在のロック一覧
#   bash .claude/lock.sh gc                                      # コミット済み(=clean)ロックを掃除
#
# holder_id は「誰が」を表す任意の文字列。
#   - サブエージェント運用: agent_id(implementer 等)
#   - クロスセッション運用: Claude Code の session_id(独立した claude プロセスごとに別)
#
# 【ロックの寿命 = コミットまで】従来の「編集ごとに取得→解放」ではなく、
# 対象ファイルが git で clean(=コミット済み)になるまでロックを保持する。
# これにより「他セッションのコミットを待つ」が自然に実現し、コミットされた瞬間に
# 次のセッションが自動でロックを奪える(post-commit フック不要)。
#   - 保有者 != 自分 かつ ファイルが clean(=保有者がコミット完了) → 奪取可。
#   - 保有者 != 自分 かつ ファイルが dirty(=編集中) かつ STALE 未満 → 取得失敗(待つ)。
#   - STALE_SEC 秒より古いロックは保有者がクラッシュした可能性として奪取可。
#
# 設計意図: 依存を増やさないため bash + ファイルのみ。Windows でも Git Bash / WSL で動く。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_DIR="$ROOT/.claude/locks"
STALE_SEC="${MOE_LOCK_STALE_SEC:-1800}"   # 既定30分
WAIT_POLL_SEC="${MOE_LOCK_POLL_SEC:-5}"
mkdir -p "$LOCK_DIR"

now() { date +%s; }

sanitize() {
  # パス区切り等をアンダースコアに。ロックファイル名を1階層に潰す。
  printf '%s' "$1" | sed 's#[/\\: ]#_#g'
}

lockfile_for() {
  printf '%s/%s.lock' "$LOCK_DIR" "$(sanitize "$1")"
}

# ファイルが git 上で dirty(未コミット/未追跡)か。git 不在時は dirty 扱い(=安全側でロック保持)。
is_dirty() {
  local rel="$1"
  command -v git >/dev/null 2>&1 || return 0
  git -C "$ROOT" rev-parse >/dev/null 2>&1 || return 0
  [ -n "$(git -C "$ROOT" status --porcelain -- "$rel" 2>/dev/null)" ]
}

cmd="${1:-}"; shift || true

case "$cmd" in
  acquire)
    holder="${1:?holder_id required}"; filepath="${2:?filepath required}"
    lf="$(lockfile_for "$filepath")"
    if [ -f "$lf" ]; then
      cur_holder="$(awk 'NR==1{print $1}' "$lf")"
      ts="$(awk 'NR==1{print $2}' "$lf")"
      age=$(( $(now) - ${ts:-0} ))
      if [ "$cur_holder" = "$holder" ]; then
        # 自分が既に保有(再入可) → タイムスタンプ更新
        printf '%s %s %s\n' "$holder" "$(now)" "$filepath" > "$lf"
        echo "OK reentrant $filepath"; exit 0
      fi
      if ! is_dirty "$filepath"; then
        # 保有者は居るがファイルは clean = コミット済み → 奪取
        echo "TAKEOVER committed-by $cur_holder $filepath" >&2
      elif [ "$age" -lt "$STALE_SEC" ]; then
        echo "LOCKED_BY $cur_holder (age ${age}s, uncommitted) $filepath" >&2
        exit 3   # 取得失敗 = 呼び出し側は待つ
      else
        echo "STALE_TAKEOVER from $cur_holder (age ${age}s) $filepath" >&2
      fi
    fi
    printf '%s %s %s\n' "$holder" "$(now)" "$filepath" > "$lf"
    echo "OK acquired $filepath"
    ;;

  wait)
    holder="${1:?holder_id required}"; filepath="${2:?filepath required}"
    timeout="${3:-600}"; deadline=$(( $(now) + timeout ))
    while :; do
      if bash "$ROOT/.claude/lock.sh" acquire "$holder" "$filepath" >/dev/null 2>/tmp/lockwait.$$; then
        rm -f /tmp/lockwait.$$; echo "OK acquired $filepath"; exit 0
      fi
      if [ "$(now)" -ge "$deadline" ]; then
        echo "TIMEOUT waiting for $filepath: $(cat /tmp/lockwait.$$ 2>/dev/null)" >&2
        rm -f /tmp/lockwait.$$; exit 5
      fi
      sleep "$WAIT_POLL_SEC"
    done
    ;;

  release)
    holder="${1:?holder_id required}"; filepath="${2:?filepath required}"
    lf="$(lockfile_for "$filepath")"
    if [ -f "$lf" ]; then
      cur_holder="$(awk 'NR==1{print $1}' "$lf")"
      if [ "$cur_holder" = "$holder" ]; then
        rm -f "$lf"; echo "OK released $filepath"
      else
        echo "REFUSE not owner (held by $cur_holder) $filepath" >&2; exit 4
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

  list)
    found=0
    shopt -s nullglob dotglob   # .で始まるパス由来のロックファイルも拾う
    for lf in "$LOCK_DIR"/*.lock; do
      [ -e "$lf" ] || continue
      found=1
      holder="$(awk 'NR==1{print $1}' "$lf")"
      ts="$(awk 'NR==1{print $2}' "$lf")"
      rel="$(awk 'NR==1{print $3}' "$lf")"
      age=$(( $(now) - ${ts:-0} ))
      if is_dirty "$rel"; then state="uncommitted"; else state="committed(解放可)"; fi
      printf '%-12s  age=%-6s  %-16s  %s\n' "$holder" "${age}s" "$state" "$rel"
    done
    [ "$found" -eq 1 ] || echo "(ロックなし)"
    ;;

  gc)
    # clean(=コミット済み)になったロックを掃除する。
    n=0
    shopt -s nullglob dotglob   # .で始まるパス由来のロックファイルも拾う
    for lf in "$LOCK_DIR"/*.lock; do
      [ -e "$lf" ] || continue
      rel="$(awk 'NR==1{print $3}' "$lf")"
      [ -n "$rel" ] || continue
      if ! is_dirty "$rel"; then rm -f "$lf"; n=$((n+1)); fi
    done
    echo "GC removed $n committed lock(s)"
    ;;

  *)
    echo "usage: lock.sh {acquire|release|wait|check|list|gc} ..." >&2; exit 2
    ;;
esac
