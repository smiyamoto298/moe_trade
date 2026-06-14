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

このリポジトリは複数のサブエージェントで開発を自動化する。役割とモデルは `.claude/agents/` の定義で固定されている。**設定で縛るのが原則で、安いモデルへ勝手に落としたり、品質ゲートを飛ばしたりしない。**

| エージェント | モデル | 役割 |
|---|---|---|
| architect | opus | 仕様策定・タスク分類（simple/normal）・ファイル領域割当 |
| test-designer | opus | テスト観点設計・テストレビュー（品質ゲート） |
| implementer | sonnet | 判断を要する通常実装 |
| simple-impl | haiku | 仕様が自明な単純実装 |
| reviewer | sonnet | コードレビュー |
| linter | haiku | リント/フォーマットの機械的修正 |

### 標準フロー

1. **architect（opus）** が要件を `design.md` 準拠の仕様に落とし、各タスクを `[simple]`/`[normal]` に分類、編集ファイルと `[shared]` を作業計画の表で明示する。
2. **test-designer（opus）** がテスト観点を `docs/test-plan/` に設計する。
3. orchestrator が並行ディスパッチ。**編集ファイルが重ならないタスクのみ並行**で走らせ、重なる場合・`[shared]` ファイルはロックで順番待ちさせる（下記）。
4. **implementer / simple-impl** が仕様＋テスト計画どおりに実装＋テストを書く。
5. **reviewer（sonnet）** がレビュー（`REVIEW: APPROVED` / `CHANGES_REQUESTED`）。
6. **test-designer（opus）** がテストをレビューし `GATE: PASS` / `FAIL` を出す。
7. Stop 時に最終品質ゲート（テスト緑・ビルド通過・design.md 鮮度）を自動チェック。

品質の上流（仕様・テスト観点）は必ず opus が担う。実装のみ sonnet/haiku に流すが、テスト観点・テストレビューは落とさない。

### 並行作業のファイル衝突防止（重要）

同一ファイルを複数エージェントが同時編集すると破壊が起きる。3層で防ぐ:

1. **領域分割（第一防衛線）**: architect が各タスクの編集ファイルを重複しないように割り当てる。担当外のファイルは編集しない。
2. **共有ファイルのロック**: ルーティング定義・共通型・`design.md` など避けられない共有対象は `.claude/shared_paths.txt` に列挙してある。これらを編集する前に必ずロックを取り、取れなければ**待つ**。
   - 取得: `bash .claude/lock.sh acquire <自分のagent名> <相対パス>`（非0で失敗＝保有者あり。待つ）
   - 解放: `bash .claude/lock.sh release <自分のagent名> <相対パス>`（編集完了後すぐ）
   - 確認: `bash .claude/lock.sh check <相対パス>`
   - ロックが取れない間は、自分の他の割当タスクを先に進める。空くまで対象ファイルは触らない。
3. **hook による強制**: `Edit/Write` の前後で `.claude/hooks/pre_edit_lock.sh` / `post_edit_unlock.sh` が自動でロック取得・解放する。共有ファイルがロック中なら編集はブロックされる（人手に頼らず機械的に順番待ちになる）。

`[shared]` に新しいファイルが必要になったら `.claude/shared_paths.txt` に追記する。

### コスト運用

- タスク完了したエージェントは停止する（アイドルの opus セッションもトークンを消費する）。
- ディスパッチ間で `/clear` し、陳腐化した履歴の再送を避ける。
- code review は sonnet、lint は haiku に固定（`.claude/agents/` で強制済み）。

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
