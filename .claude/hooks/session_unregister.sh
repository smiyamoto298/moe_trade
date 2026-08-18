#!/usr/bin/env bash
# .claude/hooks/session_unregister.sh — SessionEnd hook。
# session_register.sh が共有 .git/claude-sessions/ に置いたマーカーを片付ける。
# (プロセス異常終了で残ったマーカーは register 側の生存判定が掃除する)
set -uo pipefail

input="$(cat 2>/dev/null || true)"
sid="$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$sid" ] || exit 0

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
COMMON="$(git rev-parse --git-common-dir 2>/dev/null || echo .git)"
case "$COMMON" in
  /*)              ;;
  [A-Za-z]:[/\\]*) command -v cygpath >/dev/null 2>&1 && COMMON="$(cygpath -u "$COMMON")" ;;
  *)               COMMON="$ROOT/$COMMON" ;;
esac

rm -f "$COMMON/claude-sessions/$sid" 2>/dev/null
exit 0
