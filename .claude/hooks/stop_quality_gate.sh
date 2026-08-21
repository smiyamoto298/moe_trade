#!/usr/bin/env bash
# .claude/hooks/stop_quality_gate.sh
# Stop hook。セッション全体を終了する前の最終品質ゲート。
# CLAUDE.md の必須ワークフロー(design.md 最新化 / テスト追加・緑)を仕組みで担保する。
#
# チェック内容:
#  1) バックエンドテストが緑であること
#  2) フロントの型チェック+ビルドが通ること
#  3) コード変更があるのに design.md が未更新でないこと(警告)
#
# いずれか失敗なら終了コード2で差し戻す。
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

fail=0
msgs=()

# 1) バックエンドテスト
# worktree セッションでは、そのツリーの .env(COMPOSE_PROJECT_NAME) が効くので
# cd した先のスタック = 自分のスタックで全件を回すことになる。
if docker compose ps --status running -q php 2>/dev/null | grep -q .; then
  if ! docker compose exec -T php php artisan test >/tmp/be.log 2>&1; then
    fail=1; msgs+=("バックエンドテストが失敗(tail: $(tail -5 /tmp/be.log | tr '\n' ' '))")
  fi
else
  msgs+=("WARN: php コンテナ未起動。テスト未実行。docker compose up -d 後に確認を。")
fi

# 2) フロント型チェック+ビルド
#    ホストに node_modules があればホストで、無ければそのツリーの frontend コンテナで実行する。
#    （new-worktree.ps1 は node_modules をコンテナの named volume にしか作らないため、
#      新しい worktree のホスト側には tsc が無く「'tsc' は認識されていません」で必ず落ちていた）
if [ -d "$ROOT/frontend" ]; then
  if [ -x "$ROOT/frontend/node_modules/.bin/tsc" ] && command -v npm >/dev/null 2>&1; then
    if ! ( cd "$ROOT/frontend" && npm run build >/tmp/fe.log 2>&1 ); then
      fail=1; msgs+=("frontend のビルド/型チェックが失敗(tail: $(tail -5 /tmp/fe.log | tr '\n' ' '))")
    fi
  elif docker compose ps --status running -q frontend 2>/dev/null | grep -q .; then
    if ! docker compose exec -T frontend npm run build >/tmp/fe.log 2>&1; then
      fail=1; msgs+=("frontend のビルド/型チェックが失敗(コンテナ実行, tail: $(tail -5 /tmp/fe.log | tr '\n' ' '))")
    fi
  else
    msgs+=("WARN: frontend の node_modules が無く frontend コンテナも未起動のため、ビルド/型チェックを実行できませんでした。docker compose up -d frontend か frontend/ で npm ci を実行してください。")
  fi
fi

# 3) design.md 鮮度チェック(git があれば)。
#    backend/ または frontend/src/ に変更があるのに design.md が未変更なら警告。
if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse >/dev/null 2>&1; then
  changed="$(git -C "$ROOT" status --porcelain)"
  if printf '%s' "$changed" | grep -qE '^\s*[AM].*(backend/|frontend/src/)' \
     && ! printf '%s' "$changed" | grep -q 'design.md'; then
    msgs+=("WARN: 実装が変更されていますが design.md が未更新です。CLAUDE.md の必須ワークフローに従い仕様を最新化してください。")
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "STOP_GATE_FAIL: 品質ゲート未通過。完了前に下記を解消してください:" >&2
  for m in "${msgs[@]}"; do echo " - $m" >&2; done
  exit 2
fi

# 失敗ではない警告は通知のみ
if [ "${#msgs[@]}" -gt 0 ]; then
  echo "STOP_GATE_NOTES:" >&2
  for m in "${msgs[@]}"; do echo " - $m" >&2; done
fi
exit 0
