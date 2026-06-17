# CLAUDE.md

このリポジトリでコードを変更する際の必須ルールとプロジェクト情報。

## 変更時の必須ワークフロー（毎回）

コードの修正・機能追加を行うときは、以下を1セットとして必ず実施する:

1. **design.md を最新化する**
   `design.md` が仕様の正本。実装を変えたら該当箇所（機能一覧・DB設計・APIエンドポイント・画面構成・セキュリティ章など）を必ず更新する。
   （過去に Phase3 時点のまま放置され、実装と大きく乖離した経緯があるため）

2. **テストを必ず追加・更新する**
   変更に対応するテスト（主にバックエンド PHPUnit `backend/tests/Feature` / `backend/tests/Unit`）を追加し、
   コミット前に実行して緑を確認する。公開境界（認可・404・バリデーション）と破壊的処理は特に厚くカバーする。

## エージェント運用（自動化開発のルール）

このリポジトリは複数のサブエージェントで開発を自動化する。役割とモデルは `.claude/agents/` の定義で固定されている。**設定で縛るのが原則。品質の上流（仕様・テスト観点）は必ず opus が担い、ゲートは飛ばさない。** コスト削減は「ゲート省略」ではなく **実行回数・モデル・コンテキストの最適化** で行う。

> **起動はユーザー起点（重要）**: 以下のサブエージェント・フローは、ユーザーが明示的に依頼したとき（例: 「エージェントフローで実装して」「architect に設計させて」）にのみ起動する。**この文書を根拠にサブエージェントを自動起動しない。** ハーネス側で「ユーザーが明示依頼しない限りサブエージェントを起動しない」と制約されている場合はそれに従う（本文書はフローの**手順**を定義するもので、自動起動を許可するものではない）。明示依頼が無いタスクは、メインセッションが自分のツールでインライン処理する。

| エージェント | モデル | 役割 |
|---|---|---|
| architect | opus | 仕様策定・タスク分類（simple/normal/critical）・worktree ストリーム割当 |
| test-designer | opus | テスト観点設計（全タスク）・テストレビュー（`[critical]` のみ品質ゲート） |
| implementer | sonnet | 判断を要する通常実装 |
| simple-impl | haiku | 仕様が自明な単純実装 |
| reviewer | sonnet | コードレビュー（既定の単一レビュー） |
| linter | haiku | リント/フォーマットの機械的修正 |

### 標準フロー

1. **architect（opus）** が要件を `design.md` 準拠の仕様に落とし、各タスクを `[simple]`/`[normal]` に分類（取引ロジック・認可・破壊的処理は `[critical]`）、**worktree 作業ストリーム** と編集ファイルを作業計画の表で明示する。
2. **test-designer（opus）** がテスト観点を `docs/test-plan/` に設計する（全タスク）。
3. orchestrator が **独立ストリームを `isolation: "worktree"` で並行ディスパッチ**（必要に応じ `run_in_background: true`）。各サブエージェントは自分の worktree 内だけで作業する（下記）。
4. **implementer / simple-impl** が仕様＋テスト計画どおりに実装し、`bash .claude/test-scope.sh` で**変更したテストだけ**を緑にする。
5. **reviewer（sonnet）** がレビュー（`REVIEW: APPROVED` / `CHANGES_REQUESTED`）。
6. `[critical]` タスクのみ **test-designer（opus）** が事後テストレビューで `GATE: PASS` / `FAIL` を出す。
7. orchestrator が各 worktree をマージして統合。**Stop 時に最終品質ゲート（全件テスト緑・ビルド通過・design.md 鮮度）を main ツリーで自動チェック**。

### 並行作業は git worktree で分離する（第一原則）

同一ファイルの同時編集による破壊を、ロックの順番待ち（＝直列化）ではなく **worktree 分離** で根本的に防ぐ。各作業ストリームに独立した git チェックアウトを与え、衝突は git のマージ時に解決する。

- orchestrator は独立ストリームを **`isolation: "worktree"`** でディスパッチする。各 implementer/simple-impl は自分の worktree 内だけで編集・テストする。ストリーム間はファイルが物理的に別ツリーなので衝突しない。
- architect は「重ならないモジュール単位（例: order/ risk/ feed/）」でストリームを割り当てる。**依存のあるタスクは同一ストリームに寄せる**（直列に処理させる）。
- 統合は orchestrator が各 worktree をマージして行い、コンフリクトは git で解決する。
- **フォールバック（単一ツリーで複数編集する場合のみ）**: `bash .claude/lock.sh acquire/release/check <agent> <相対パス>` と `.claude/shared_paths.txt` を手動で使う。pre/post edit の自動ロック hook は撤去済み（worktree が標準のため不要かつ毎編集のオーバーヘッド）。

### テスト品質ゲート（カバレッジ維持・実行回数を最適化）

全件テストを毎サブエージェント停止ごとに回すのをやめ（最大のコスト要因だった）、**スコープ実行＋統合時全件**でカバレッジを同等に保つ:

- **実装中（各 worktree）**: `bash .claude/test-scope.sh` が **変更したテストファイルだけ** を実行する。テストは SQLite `:memory:` なので worktree ごとのエフェメラル php コンテナで並列実行しても DB 競合しない。backend のコードを変更したのにテスト未追加なら **gate FAIL**（テスト追加を機械的に強制）。
- **統合時（Stop hook）**: `stop_quality_gate.sh` が main ツリーで **全件**（backend PHPUnit ＋ frontend ビルド）を実行し、回帰を最終担保する。
- SubagentStop hook は backstop（main ツリーに変更が見えればスコープ実行、無ければ no-op）。

## 複数セッションの並行作業（クロスセッション・ロック）

同一ワーキングツリーで **複数の Claude Code セッション（別々の `claude` プロセス）を並行**して走らせる場合の、ファイル衝突防止の仕組み。worktree 分離（前章）は「1セッション内の複数サブエージェント」向け、こちらは「独立した複数セッション」向け。**自動で効くので普段は意識不要**だが、ブロックされたときの対処と design.md の扱いだけ把握しておく。

**仕組み（自動）**: `PreToolUse(Edit|Write|MultiEdit)` フック `.claude/hooks/cross_session_lock.sh` が、編集しようとした全ファイルを `session_id` 名義でロックする。`.claude/locks/` が全セッション共有のレジストリ（=「いま誰が何を編集中か」）。

- **ロックの寿命 = コミットまで**。対象ファイルが git で clean（コミット済み）になると自動解放され、待っていた別セッションが即座に取得できる。明示解放は不要。
- 他セッションが **未コミットで編集中** のファイルを触ろうとすると **編集がブロックされる（exit 2）**。別ファイルを触る限り衝突しないので並行作業の摩擦は小さい。

**ブロックされたときの対処**（フックがメッセージで案内する）:
1. 相手がコミットするまで待つ → コミット後に同じ編集を再試行すれば自動で通る。
2. 先に別の（衝突しない）ファイルの作業を進める。
3. どうしても待ちたい場合のみ: `bash .claude/lock.sh wait <session_id> <file> [timeout]`。
- 状況確認: `bash .claude/lock.sh list`（誰が何を未コミットで持っているか）。

**design.md など「必ず触る共有ファイル」は細かく即コミット**して他セッションを待たせない:
- 編集したらすぐ、その1ファイルだけコミット: `bash .claude/commit-doc.sh design.md "feat: 〇〇を追記"`（指定ファイルだけを pathspec コミットし、他の未コミット作業は巻き込まない。コミット後にロックも自動解放）。
- 大きな仕様変更を1コミットに溜め込まない。章・機能単位で小さくコミットすることで、design.md を巡るブロックを最小化し並行作業を成立させる。
- 設計上 30 分（`MOE_LOCK_STALE_SEC`）放置されたロックはクラッシュ扱いで奪取可能。長時間 design.md を未コミットで抱えないこと。

> ロックファイル（`.claude/locks/*.lock`）は実行時の一時状態で git 追跡しない（`.claude/locks/.gitignore`）。`shared_paths.txt` と `.claude/lock.sh acquire/release` の手動運用は、worktree もクロスセッションも使わない単一ツリー・サブエージェントのフォールバック用に残置。

### レビュー

- 既定は **reviewer（sonnet）1本**。`[critical]`（取引ロジック・認可・破壊的処理）のみ **test-designer（opus）** の事後テストレビューを追加する。
- 実装前の **opus テスト計画は全タスクで実施**（高レバレッジなので落とさない）。

### コスト運用

- 完了したエージェントは停止する（アイドルの opus もトークンを消費する）。
- ディスパッチ間で `/clear`。サブエージェントは**簡潔な構造化結果**（task_id / PASS・FAIL / 変更ファイル一覧）だけ返し、orchestrator のコンテキストを薄く保つ。
- 独立ストリームは `run_in_background` で非同期化し、待ちの往復を減らす。
- 全件テストは統合時1回。code review は sonnet、lint は haiku に固定（`.claude/agents/` で強制済み）。

## 構成

- フロントエンド: React (Vite + TypeScript) … `frontend/`
- バックエンド: Laravel (PHP 8.3) … `backend/`
- DB: MySQL 8（開発は Docker）。テストは SQLite インメモリ
- ローカル開発: Docker Compose（nginx / php / frontend / db / mailpit / phpmyadmin）

## よく使うコマンド

```bash
# 起動
docker compose up -d

# バックエンドのテスト（PHP はホストに無いため php コンテナで実行する）
docker compose exec -T php php artisan test

# マイグレーション
docker compose exec php php artisan migrate

# フロントの型チェック＋ビルド
cd frontend && npm run build
```

## メモ

- メールアドレスは平文を保存せず HMAC-SHA256 のブラインドインデックスで扱う（`App\Support\EmailHasher`）
- 一覧検索で `base_stats` 等のキーを SQL の JSON パスへ補間する箇所は、必ず `App\Support\Stats` などの
  ホワイトリストで検証する（リクエスト由来のキーをそのまま使わない）
- CI: `.github/workflows/ci.yml`（backend PHPUnit ＋ frontend 型チェック・ビルド）
