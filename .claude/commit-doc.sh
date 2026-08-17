#!/usr/bin/env bash
# .claude/commit-doc.sh — design.md など「必ず触る共有ドキュメント」を、その変更分だけ
# 即座に小さくコミットするためのヘルパー。
#
# 使い方:
#   bash .claude/commit-doc.sh design.md "feat: 〇〇のAPIを追記"
#   bash .claude/commit-doc.sh design.md            # メッセージ省略時は既定文
#
# 狙い: design.md は全セッション/全 worktree が触る共有ファイルなので、大きな差分を溜め込むと
# 統合時のマージコンフリクトが大きくなる。「編集したらすぐ、その1ファイルだけコミット」する
# 運用にして、章・機能単位の小さなコミットに保つ。
#
# 指定ファイル「だけ」を pathspec コミットするので、他に未コミットの作業が staged/unstaged で
# 残っていてもそれらは巻き込まない。

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ $# -ge 1 ] || { echo "usage: commit-doc.sh <file> [message]" >&2; exit 2; }
file="$1"; shift || true
msg="${*:-docs: update ${file##*/}}"

if [ -z "$(git status --porcelain -- "$file" 2>/dev/null)" ]; then
  echo "NOTE: '$file' に未コミットの変更はありません。何もしません。"
  exit 0
fi

git add -- "$file"
git commit -m "$msg" -- "$file"

echo "OK committed: $file"
