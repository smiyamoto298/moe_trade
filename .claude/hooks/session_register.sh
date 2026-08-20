#!/usr/bin/env bash
# .claude/hooks/session_register.sh — SessionStart hook。
#
# 「1セッション = 1worktree」運用の入口ガード。
#  - 起動したセッションを共有 .git/claude-sessions/ に登録する(worktree でも main .git を共有)。
#  - 同じ作業ツリー(ROOT)を使う生存中の別セッションを検知したら、コンテキストに
#    「worktree 分岐を必ず確認 → 承認時は new-worktree.ps1 を自動実行」の指示を注入する。
#  - 生存判定は claude プロセスの Windows PID(tasklist)。PID が取れないマーカーは 12 時間で失効。
# 対になる片付けは session_unregister.sh (SessionEnd)。
set -uo pipefail

input="$(cat 2>/dev/null || true)"
sid="$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$sid" ] || sid="unknown-$$"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# 共有 .git の場所(worktree はここを共有する)。Windows の "C:/..." 形式も unix 形式へ正規化。
COMMON="$(git rev-parse --git-common-dir 2>/dev/null || echo .git)"
case "$COMMON" in
  /*)              ;;
  [A-Za-z]:[/\\]*) command -v cygpath >/dev/null 2>&1 && COMMON="$(cygpath -u "$COMMON")" ;;
  *)               COMMON="$ROOT/$COMMON" ;;
esac
DIR="$COMMON/claude-sessions"
mkdir -p "$DIR" 2>/dev/null || exit 0

# 自分の claude プロセスの Windows PID を解決する。
# MSYS の exec 委譲で Windows 側の親チェーンは途中で切れることがあるため、
# まず MSYS の /proc で最上位の bash まで遡り(ppid=1 が起点)、そこから Windows 側の
# 親をたどってシェルラッパー(bash/sh/cmd)を飛ばした先を claude とみなす。
mypid=0
mpid=$$
while :; do
  pp="$(cat /proc/$mpid/ppid 2>/dev/null || true)"
  if [ -z "$pp" ] || [ "$pp" = "1" ]; then break; fi
  mpid=$pp
done
topwin="$(cat /proc/$mpid/winpid 2>/dev/null || true)"
if [ -n "$topwin" ] && command -v powershell >/dev/null 2>&1; then
  resolved="$(powershell -NoProfile -Command "
    \$p = $topwin
    for (\$i = 0; \$i -lt 8; \$i++) {
      \$proc = Get-CimInstance Win32_Process -Filter \"ProcessId=\$p\" -ErrorAction SilentlyContinue
      if (-not \$proc) { break }
      if (\$proc.Name -notmatch '^(bash|sh|cmd|conhost)') { Write-Output \$p; break }
      \$p = \$proc.ParentProcessId
    }" 2>/dev/null | tr -d '\r[:space:]')"
  case "$resolved" in ''|*[!0-9]*) ;; *) mypid="$resolved" ;; esac
fi

rootkey="$(printf '%s' "$ROOT" | tr 'A-Z' 'a-z')"
printf '%s\n%s\n' "$mypid" "$rootkey" > "$DIR/$sid" 2>/dev/null || exit 0

# マーカーの生存判定。PID があれば tasklist、無ければ mtime 12 時間で失効。
alive() {
  local pid="$1" f="$2" now age
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    MSYS_NO_PATHCONV=1 tasklist /NH /FI "PID eq $pid" 2>/dev/null | grep -qw "$pid"
  else
    now=$(date +%s); age=$(( now - $(stat -c %Y "$f" 2>/dev/null || echo 0) ))
    [ "$age" -lt 43200 ]
  fi
}

conflicts=0
for f in "$DIR"/*; do
  [ -f "$f" ] || continue
  [ "$(basename "$f")" = "$sid" ] && continue
  pid="$(sed -n 1p "$f" 2>/dev/null)"; root="$(sed -n 2p "$f" 2>/dev/null)"
  # 同じ claude プロセスのマーカーは自分自身(resume や /clear で session_id が変わった残骸)。
  # 競合に数えず掃除する(1 claude プロセス = 1 セッション)。
  if [ "$mypid" != "0" ] && [ "$pid" = "$mypid" ]; then rm -f "$f"; continue; fi
  if ! alive "$pid" "$f"; then rm -f "$f"; continue; fi
  [ "$root" = "$rootkey" ] && conflicts=$((conflicts+1))
done

if [ "$conflicts" -gt 0 ]; then
  cat <<EOF
[parallel-sessions] 同じ作業ツリー($ROOT)を使う別の Claude Code セッションが ${conflicts} 件並行しています。
プロジェクトルール(CLAUDE.md): 作業に着手する前に、最初の応答で AskUserQuestion を使い「この作業を専用 worktree に分岐するか」を必ず確認すること。選択肢:
1. 分岐する(推奨): ユーザー承認後、Bash で「powershell -File scripts/new-worktree.ps1 -Branch <作業内容に合った短い名前> -Lean」を実行し(専用 Docker スタックの起動まで行うため数分かかる)、出力された worktree パス(../moe_trade-<name>)へ EnterWorktree ツールで移動してから元の依頼を続行する。実装・修正はこれを選ぶ。
2. 分岐する・Docker なし: 動作確認が不要でテストだけ回す場合に限り、「-Lean」の代わりに「-NoStart」を付けて実行(ブラウザでの動作確認はできない)。移動手順は同じ。
3. 分岐しない: 調査・質問のみ等、ファイル編集を伴わない場合。そのまま続行してよいが、編集を伴う作業になったら改めて分岐を提案すること。
分岐した場合の終了手順(CLAUDE.md「作業完了時のフロー」): 作業が終わったら、その worktree の環境(http://localhost:81xx)で動作確認した結果を示し、AskUserQuestion で「この内容で main にマージしてよいか」をユーザーに必ず確認する。OK が出るまでマージも破棄もしない。OK なら main へマージし、そのあと「powershell -File scripts/remove-worktree.ps1 -Branch <name> -DeleteBranch」で Docker スタック・worktree・ブランチを破棄する。
EOF
fi
exit 0
