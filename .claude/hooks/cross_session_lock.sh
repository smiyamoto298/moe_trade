#!/usr/bin/env bash
# .claude/hooks/cross_session_lock.sh
# PreToolUse(Edit|Write|MultiEdit) hook。同一ワーキングツリーで複数の Claude Code
# セッションが並行して走るときに、同じファイルの同時編集を防ぐ。
#
# 仕組み:
#  - 編集しようとしたファイルのロックを session_id 名義で取得する。
#  - 他セッションが「未コミットで編集中」のファイルなら取得に失敗し、編集をブロック(exit 2)。
#    モデルには「相手のコミットを待つ/先に他作業を進める」よう促すメッセージを返す。
#  - ロックは対象ファイルが git で clean(=コミット済み)になると自動で解放される
#    (lock.sh の acquire が clean を検知して奪取する)。明示解放は不要。
#
# つまり「編集中のファイル情報をセッション間で共有し、相手のコミットを待つ」を、
# .claude/locks/ という共有ディレクトリ + git の clean 判定だけで実現する。
#
# 対象は「編集する全ファイル」。別ファイルを触る限り衝突しないので並行作業の摩擦は小さい。

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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
session="$(extract '.session_id' 'session_id')"
[ -n "$session" ] || session="$(extract '.subagent_type' 'subagent_type')"
[ -n "$session" ] || session="main"

# file_path が取れない(別形式のツール)なら関与しない
[ -n "$file_path" ] || exit 0

# Windows パス(C:\Dev\... や C:/Dev/...)が来ても Git Bash の ROOT(/c/Dev/...)と
# 突き合わせられるよう、unix 形式へ正規化してから相対化する。
norm() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    p="$(cygpath -u "$p" 2>/dev/null || printf '%s' "$1")"
  else
    p="$(printf '%s' "$p" | sed 's#\\\\#/#g')"   # cygpath 不在: バックスラッシュ→スラッシュ
  fi
  printf '%s' "$p"
}
abs="$(norm "$file_path")"

# 絶対パスをリポジトリ相対へ。ツリー外(他ディレクトリ)のファイルは対象外。
rel="${abs#$ROOT/}"
case "$rel" in
  /*|[A-Za-z]:*) exit 0 ;;          # ROOT 配下に正規化できなかった = ツリー外
  .claude/locks/*) exit 0 ;;        # ロック置き場自体は対象外
esac

# ロック取得を試みる(holder = session_id)
if bash "$ROOT/.claude/lock.sh" acquire "$session" "$rel" >/dev/null 2>/tmp/cslock.$$; then
  rm -f /tmp/cslock.$$
  exit 0
else
  reason="$(cat /tmp/cslock.$$ 2>/dev/null || true)"; rm -f /tmp/cslock.$$
  cat >&2 <<EOF
BLOCKED(cross-session): '$rel' は他のセッションが未コミットで編集中です。
  $reason
このファイルは編集しないでください。対応:
  1) 相手セッションがコミットするまで待つ(コミット後に再試行すれば自動で通ります)
  2) 先に別の(衝突しない)ファイルの作業を進める
  3) どうしても待つ場合: bash .claude/lock.sh wait "$session" "$rel"
現在のロック状況は: bash .claude/lock.sh list
EOF
  exit 2
fi
