#!/usr/bin/env bash
# .claude/test-scope.sh — 変更領域に絞ったバックエンドテスト実行。
#
# 設計意図(worktree 並行運用):
#  - 各 worktree では「このツリーで変更したテストファイルだけ」を実行する(高速・並行安全)。
#  - 全件テストは統合時(Stop hook)に main ツリーで実行し、回帰を最終担保する。
#  - テストは SQLite :memory: なので、worktree ごとにエフェメラル php コンテナを立てて
#    並列実行しても DB 競合しない(docker-compose.yml の php は main の ./backend を
#    マウントするため、linked worktree は -v で自分の backend を上書きマウントする)。
#
# 終了コード: 0=OK/スキップ, 2=テスト失敗 または backend 変更があるのにテスト未追加。
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 0

# 共有 .git(= main リポジトリ)の場所。docker-compose.yml はここにある。
COMMON="$(git rev-parse --git-common-dir 2>/dev/null || echo .git)"
case "$COMMON" in
  /*) ;;                        # 絶対パス
  *)  COMMON="$ROOT/$COMMON";;  # 相対 → ツリー基準で解決
esac
MAIN_ROOT="$(cd "$(dirname "$COMMON")" && pwd)"
COMPOSE="$MAIN_ROOT/docker-compose.yml"

# 変更ファイル収集(コミット済み diff + 作業ツリーの未コミット/未追跡)。
base="$(git merge-base HEAD main 2>/dev/null || echo HEAD)"
changed="$( { git diff --name-only "$base" HEAD 2>/dev/null
              git status --porcelain 2>/dev/null | sed 's/^...//'; } | sort -u )"

changed_backend="$(printf '%s\n' "$changed" | grep -E '^backend/' || true)"
if [ -z "$changed_backend" ]; then
  echo "NOTE: backend に変更なし。スコープテストはスキップ(統合時に全件)。" >&2
  exit 0
fi

changed_tests="$(printf '%s\n' "$changed_backend" | grep -E '^backend/tests/.*Test\.php$' || true)"
changed_app="$(printf '%s\n' "$changed_backend" | grep -Ev '^backend/tests/' \
                 | grep -E '^backend/(app|routes|config|database)/' || true)"

# backend のロジックを変えたのにテスト未追加 → 安価に(=実行せず)ゲートで弾く。
if [ -n "$changed_app" ] && [ -z "$changed_tests" ]; then
  echo "TEST_GATE_FAIL: backend のコードを変更していますがテストが追加・変更されていません。" >&2
  echo "CLAUDE.md の必須ワークフローに従い、対応するテストを追加してください。" >&2
  exit 2
fi

if [ -z "$changed_tests" ]; then
  echo "NOTE: 実行対象のテスト変更なし。スキップ。" >&2
  exit 0
fi

# artisan へ渡す相対パス(先頭の backend/ を除去)。
paths="$(printf '%s\n' "$changed_tests" | sed 's#^backend/##' | tr '\n' ' ')"

# docker は native(Windows)側。Git Bash の /c/... パスを -f/-v にそのまま渡すと
# C:\c\... に化けるため、compose は cwd 解決(cd MAIN_ROOT)、マウントパスは cygpath で変換。
: "$COMPOSE"  # 参照用に保持(cwd 解決するので -f には使わない)
to_win() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

if ! ( cd "$MAIN_ROOT" && docker compose ps php ) >/dev/null 2>&1; then
  echo "NOTE: php コンテナ未起動のためスコープテスト未実行(統合時に全件で確認)。" >&2
  exit 0
fi

if [ "$ROOT" = "$MAIN_ROOT" ]; then
  # main ツリー: 既存の常駐 php コンテナで実行。
  out="$( cd "$MAIN_ROOT" && docker compose exec -T php php artisan test $paths 2>&1 )"; code=$?
else
  # linked worktree: 自分の backend をマウントしたエフェメラルコンテナで実行。
  wtmount="$(to_win "$ROOT/backend"):/var/www/backend"
  out="$( cd "$MAIN_ROOT" && MSYS_NO_PATHCONV=1 docker compose run --rm -T \
            -w /var/www/backend -v "$wtmount" \
            php php artisan test $paths 2>&1 )"; code=$?
  # マウント失敗は環境依存。ハード失敗にせず統合時の全件に委ねる(早期フィードバックは best-effort)。
  if [ "$code" -ne 0 ] && printf '%s' "$out" | grep -qiE 'cannot find the path|no such file|mount|invalid reference|bind'; then
    echo "NOTE: worktree マウントに失敗(環境依存)。スコープテストはスキップし統合時の全件に委ねます。" >&2
    printf '%s\n' "$out" | tail -10 >&2
    exit 0
  fi
fi

if [ "$code" -ne 0 ]; then
  echo "SCOPED_TEST_FAIL: 変更テストが失敗しました。修正してから完了してください。" >&2
  printf '%s\n' "$out" | tail -40 >&2
  exit 2
fi
echo "SCOPED_TEST_OK: $paths" >&2
exit 0
