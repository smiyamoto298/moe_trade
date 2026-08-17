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
- ファイルロックの仕組みは**全廃した**（`lock.sh` / `.claude/locks/` / PreToolUse フック）。ロックは「相手のコミット待ち」で相互デッドロックを起こすため、分離で解決する。

### テスト品質ゲート（カバレッジ維持・実行回数を最適化）

全件テストを毎サブエージェント停止ごとに回すのをやめ（最大のコスト要因だった）、**スコープ実行＋統合時全件**でカバレッジを同等に保つ:

- **実装中（各 worktree）**: `bash .claude/test-scope.sh` が **変更したテストファイルだけ** を実行する。実行先はそのツリー自身の Docker スタック（未起動なら main スタックに自分の backend をマウントしたエフェメラルコンテナ）。テストは SQLite `:memory:` なので並列実行しても DB 競合しない。backend のコードを変更したのにテスト未追加なら **gate FAIL**（テスト追加を機械的に強制）。
- **統合時（Stop hook）**: `stop_quality_gate.sh` がそのツリーで **全件**（backend PHPUnit ＋ frontend ビルド）を実行し、回帰を最終担保する。
- SubagentStop hook は backstop（main ツリーに変更が見えればスコープ実行、無ければ no-op）。

## 複数セッションの並行作業（1セッション = 1ブランチ = 1 worktree = 1 Docker スタック）

複数の Claude Code セッション（別々の `claude` プロセス）を同時に走らせるときは、**ロックで待ち合わせない。物理的に分離する。** セッションごとに専用の git worktree（別フォルダ・別ブランチ）と、そこに紐づく独立した Docker スタックを持たせる。

> かつては `.claude/locks/` のクロスセッション・ロックで同時編集を防いでいたが、**解放条件が「コミット済みになること」だったため、全員が作業中＝全員が未コミット＝誰も解放しない相互デッドロック**を起こした。仕組みごと撤去済み。

### 鉄則

- **main のワーキングツリー（`C:\Dev\moe_trade`）で走らせるセッションは常に1つだけ。** 2つ目以降は必ず worktree を作る。
- 各セッションは**自分の worktree の中だけ**を編集する。他セッションの worktree には触らない。
- 統合は git のマージで行う。同じファイルを触っていてもマージ時に解決すればよく、作業中に待つ必要はない。

### 2つ目以降のセッションの始め方

```powershell
# 1) worktree + 専用 Docker スタックを作成（Slot 省略で空きポートを自動採番）
powershell -File scripts/new-worktree.ps1 -Branch feat-chat

# 2) 表示されたパスへ移動して claude を起動
cd ..\moe_trade-feat-chat
claude
```

`new-worktree.ps1` がやること:
- `../moe_trade-<branch>` に worktree を作成（ブランチが無ければ `main` から分岐）
- `COMPOSE_PROJECT_NAME` とホストポートをずらしたルート `.env` を生成（named volume も分離＝**DB も完全に独立**）
- main の `backend/.env` をコピーし `APP_URL` / `FRONTEND_URL` / `SANCTUM_STATEFUL_DOMAINS` をその worktree のポートに合わせる（合わせないと cookie 認証が壊れる）
- スタック起動 → `composer install` → `migrate --seed` まで実行（`-NoStart` で抑止、`-Lean` で mailpit / phpMyAdmin / scheduler を省いて軽量起動、`-CopyDb` で main の DB 内容を複製）

すでに走っているセッションを worktree へ移す場合は、`scripts/new-worktree.ps1 -NoStart` で作ってから **EnterWorktree ツール**に `path` を渡す（Claude Code のネイティブ機能。セッションの作業ディレクトリごと移動する）。

### 片付け

```powershell
# コンテナ + DB ボリューム破棄 → worktree 削除 → ブランチ削除まで一括
powershell -File scripts/remove-worktree.ps1 -Branch feat-chat -DeleteBranch
```

未コミット変更や main 未マージのコミットが残っていると中断する（`-Force` で強行）。**worktree を消さないとポート枠（Slot）が空かない**ので、終わったら必ず片付ける。

### 統合フロー

1. worktree 側でコミット（`design.md` とテストは CLAUDE.md 冒頭の必須ワークフローどおり）
2. main のセッションで `git merge <branch>`（または PR）
3. main ツリーで全件テスト＋ビルド（Stop hook の品質ゲートが自動で回す）

`design.md` は全セッションが触る共有ファイルなので、**章・機能単位で小さくコミット**する（`bash .claude/commit-doc.sh design.md "feat: 〇〇を追記"`）。ブロックはされなくなったが、マージコンフリクトを小さく保つために有効。

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
- ローカル開発: Docker Compose（nginx / php / scheduler / frontend / db / mailpit / phpmyadmin）。scheduler は `php artisan schedule:work` で定期バッチ（auctions:resolve=15分ごと等）を自動実行

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
