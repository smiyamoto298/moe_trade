#!/usr/bin/env bash
# .claude/test-scope.sh — 変更領域に絞ったバックエンドテスト実行。
#
# 設計意図(1セッション = 1worktree = 1スタック運用):
#  - 各 worktree では「このツリーで変更したテストファイルだけ」を実行する(高速・並行安全)。
#  - 全件テストは統合時(Stop hook)に実行し、回帰を最終担保する。
#  - 実行先は「そのツリー自身の Docker スタック」(worktree ごとに COMPOSE_PROJECT_NAME が
#    分かれているので、exec するだけで自分の backend が対象になる)。
#  - スタックを起動していない worktree(new-worktree.ps1 -NoStart)向けのフォールバックとして、
#    main スタックに自分の backend を -v で上書きマウントしたエフェメラルコンテナで実行する。
#    テストは SQLite :memory: なので並列実行しても DB 競合しない。
#
# 終了コード: 0=OK/スキップ, 2=テスト失敗 または backend 変更があるのにテスト未追加。
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 0

# 共有 .git(= main リポジトリ)の場所。docker-compose.yml はここにある。
# Windows の git は "C:/Dev/moe_trade/.git" 形式を返すことがあるので、
# ドライブレター付きも「絶対パス」として扱い、unix 形式へ正規化してから解決する。
COMMON="$(git rev-parse --git-common-dir 2>/dev/null || echo .git)"
case "$COMMON" in
  /*)            ;;                        # 絶対パス(unix 形式)
  [A-Za-z]:[/\\]*) if command -v cygpath >/dev/null 2>&1; then COMMON="$(cygpath -u "$COMMON")"; fi ;;
  *)             COMMON="$ROOT/$COMMON";;  # 相対 → ツリー基準で解決
esac
MAIN_ROOT="$(cd "$(dirname "$COMMON")" 2>/dev/null && pwd)"
[ -n "$MAIN_ROOT" ] || MAIN_ROOT="$ROOT"
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

# そのツリーのスタックで php が動いているか(worktree なら worktree 自身の .env が効く)。
stack_running() { ( cd "$1" && docker compose ps --status running -q php ) 2>/dev/null | grep -q . ; }

if stack_running "$ROOT"; then
  # 自分のスタックの常駐 php コンテナで実行(main / worktree 共通の通常経路)。
  out="$( cd "$ROOT" && docker compose exec -T php php artisan test $paths 2>&1 )"; code=$?
elif [ "$ROOT" != "$MAIN_ROOT" ] && stack_running "$MAIN_ROOT"; then
  # このツリーのスタックは未起動。main スタックに自分の backend をマウントして実行。
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
else
  echo "NOTE: php コンテナ未起動のためスコープテスト未実行(統合時に全件で確認)。" >&2
  echo "      このツリーのスタックを使うなら: docker compose up -d" >&2
  exit 0
fi

if [ "$code" -ne 0 ]; then
  echo "SCOPED_TEST_FAIL: 変更テストが失敗しました。修正してから完了してください。" >&2
  printf '%s\n' "$out" | tail -40 >&2
  exit 2
fi
echo "SCOPED_TEST_OK: $paths" >&2
exit 0
