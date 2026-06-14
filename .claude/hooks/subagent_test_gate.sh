#!/usr/bin/env bash
# .claude/hooks/subagent_test_gate.sh
# SubagentStop hook。実装系サブエージェント(implementer / simple-impl)が完了したら
# バックエンドのテストを実行し、失敗していれば「未完」として差し戻す。
#
# 品質ゲートを edit ループ内で機械的に enforce するのが目的。
# テスト実行は CLAUDE.md / design.md の規約に合わせる:
#   docker compose exec -T php php artisan test
#
# 失敗時は終了コード2でモデルに結果を返し、サブエージェントに修正を促す。
set -uo pipefail
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

agent="$(extract '.subagent_type' 'subagent_type')"

# 実装系のみテストゲートを適用(レビュー/リント/設計系では走らせない)
case "$agent" in
  implementer|simple-impl) ;;
  *) exit 0 ;;
esac

cd "$ROOT"
# php コンテナが起動していない環境ではスキップ(ゲートを誤って失敗にしない)
if ! docker compose ps php >/dev/null 2>&1; then
  echo "NOTE: php コンテナ未検出のためテストゲートをスキップしました。手動で 'docker compose exec -T php php artisan test' を実行してください。" >&2
  exit 0
fi

out="$(docker compose exec -T php php artisan test 2>&1)"; code=$?
if [ $code -ne 0 ]; then
  echo "TEST_GATE_FAIL: バックエンドテストが失敗しています。修正してから完了してください。" >&2
  echo "$out" | tail -40 >&2
  exit 2
fi
exit 0
