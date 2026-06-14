#!/usr/bin/env bash
# .claude/hooks/subagent_test_gate.sh
# SubagentStop hook。実装系サブエージェント(implementer / simple-impl)が完了したら
# 「変更領域だけ」のスコープテストを実行する(全件は統合時の Stop hook で実行)。
#
# worktree 運用では各 implementer が自分の worktree 内で test-scope.sh を回すのが主経路。
# このフックは backstop: main セッションから見える範囲(= main ツリー)に変更があれば
# スコープ実行し、無ければ no-op で終わる(全件を毎回回さないのがコスト最適化の要点)。
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

# 実装系のみテストゲートを適用(レビュー/リント/設計系では走らせない)。
case "$agent" in
  implementer|simple-impl) ;;
  *) exit 0 ;;
esac

exec bash "$ROOT/.claude/test-scope.sh"
