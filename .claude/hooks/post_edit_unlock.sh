#!/usr/bin/env bash
# .claude/hooks/post_edit_unlock.sh
# PostToolUse(Edit|Write) hook。編集が終わった共有ファイルのロックを解放する。
# pre_edit_lock.sh と対になっており、同じ shared 判定で対象を絞る。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHARED_LIST="$ROOT/.claude/shared_paths.txt"
payload="$(cat)"

extract() {        # $1 = jq path, $2 = フォールバック用キー名
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$payload" | jq -r "$1 // empty"
  else
    printf '%s' "$payload" \
      | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
      | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/'
  fi
}

file_path="$(extract '.tool_input.file_path' 'file_path')"
agent_id="$(extract '.subagent_type' 'subagent_type')"
[ -n "$agent_id" ] || agent_id="$(extract '.agent_id' 'agent_id')"
[ -n "$agent_id" ] || agent_id="main"
[ -n "$file_path" ] || exit 0
rel="${file_path#$ROOT/}"
[ -f "$SHARED_LIST" ] || exit 0

while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  case "$rel" in *"$pat"*)
    bash "$ROOT/.claude/lock.sh" release "$agent_id" "$rel" >/dev/null 2>&1 || true
    break;;
  esac
done < "$SHARED_LIST"
exit 0
