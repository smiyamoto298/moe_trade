#!/usr/bin/env bash
# .claude/hooks/pre_edit_lock.sh
# PreToolUse(Edit|Write) hook。編集対象が [shared] 指定ファイルなら、ロックが
# 他エージェントに保有されている間はツール実行をブロックする(=順番待ちさせる)。
#
# Claude Code は hook へ JSON を stdin で渡す。tool_input.file_path を取り出して判定。
# 終了コード != 0 でツール実行をブロックし、stderr の内容がモデルに返る。
#
# shared 対象の決め方:
#   .claude/shared_paths.txt に1行1パターン(部分一致)を列挙する。
#   architect が作業計画で [shared] とした共有ファイルをここに追記する運用。
#   ファイルが無い/該当しなければロック不要としてそのまま通す。

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHARED_LIST="$ROOT/.claude/shared_paths.txt"

payload="$(cat)"

# jq があれば jq path で取り出す。無ければキー名指定で grep フォールバック。
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

# file_path が取れない(別形式のツール)なら関与しない
[ -n "$file_path" ] || exit 0

# 絶対パスをリポジトリ相対へ
rel="${file_path#$ROOT/}"

# shared リストが無ければロック不要
[ -f "$SHARED_LIST" ] || exit 0

is_shared=0
while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  case "$rel" in *"$pat"*) is_shared=1; break;; esac
done < "$SHARED_LIST"

[ "$is_shared" -eq 1 ] || exit 0   # 非共有ファイルは自由に編集

# 共有ファイル: ロック取得を試みる
if bash "$ROOT/.claude/lock.sh" acquire "$agent_id" "$rel" >/dev/null 2>err.tmp; then
  rm -f err.tmp
  exit 0
else
  reason="$(cat err.tmp 2>/dev/null || true)"; rm -f err.tmp
  echo "BLOCKED: 共有ファイル '$rel' は他の作業がロック中です($reason)。順番待ちし、ロックが空くまでこのファイルを編集しないでください。先に他の割当タスクを進めるか、解放を待ってから再試行してください。" >&2
  exit 2
fi
