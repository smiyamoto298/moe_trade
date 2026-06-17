#!/usr/bin/env bash
# .claude/commit-doc.sh — design.md など「必ず触る共有ドキュメント」を、その変更分だけ
# 即座に小さくコミットしてロックを手放すためのヘルパー。
#
# 使い方:
#   bash .claude/commit-doc.sh design.md "feat: 〇〇のAPIを追記"
#   bash .claude/commit-doc.sh design.md            # メッセージ省略時は既定文
#
# 狙い: クロスセッション運用では、編集中(未コミット)のファイルは他セッションをブロックする。
# design.md のような共有ドキュメントは「編集したらすぐ、その1ファイルだけコミット」する運用に
# することで、他セッションの待ち時間を最小化する(=細かくコミットして並行作業を成立させる)。
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

# 対象が clean になったので、関連ロックを掃除しておく(他セッションは即取得可能になる)。
bash "$ROOT/.claude/lock.sh" gc >/dev/null 2>&1 || true
echo "OK committed & lock freed: $file"
