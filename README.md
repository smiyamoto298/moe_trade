# MoE Trade

MMORPG『Master of Epic』のゲーム内アイテム・スキルを取引するための個人運営・非営利のWebサービスです。
出品（売りたい）・買取（買いたい）の一覧からアイテムを検索し、取引希望を送って交渉できます。
成立した取引は相場データとして価格解析に反映されます。

**公開サイト**: https://moe-trade.sakuraweb.com

> このリポジトリはポートフォリオとしてソースコードを公開しているものです。利用条件は [LICENSE](LICENSE) を参照してください。

## 主な機能

- 出品・買取の登録と検索（装備品の性能値・追加効果・付加効果など MoE 固有の属性で絞り込み）
- 先着順の順番待ち（キュー）で管理する取引チャット
- オークション形式の出品と自動成立バッチ
- 成立取引に基づく相場情報・価格解析
- 所持アイテム台帳（アイテムボックス）・運営掲示板・お知らせ・管理画面

## 技術構成

| レイヤー | 技術 |
|---|---|
| フロントエンド | React (Vite + TypeScript) — `frontend/` |
| バックエンド | Laravel (PHP 8.3) — `backend/` |
| DB | MySQL 8（テストは SQLite インメモリ） |
| ローカル開発 | Docker Compose（nginx / php-fpm / scheduler / frontend / db / mailpit / phpmyadmin） |
| CI | GitHub Actions（backend PHPUnit ＋ frontend 型チェック・ビルド） |

設計の正本は [design.md](design.md)（機能一覧・DB設計・API・画面構成・セキュリティ設計）です。

## 設計上の特徴

- **メールアドレスの非保持**: 平文メールは保存せず、HMAC-SHA256 のブラインドインデックスで認証・照合する（`App\Support\EmailHasher`）
- **多層防御の期限管理**: 出品期限はバッチ（cron）だけに依存せず、公開クエリ側のスコープでも期限切れを除外する
- **SQLインジェクション対策**: 検索キーを SQL の JSON パスへ補間する箇所はホワイトリストで検証（`App\Support\Stats`）
- **共用サーバー制約への適応**: 常駐ワーカー不可・WAF による PUT 制限などレンタルサーバーの制約に合わせた設計（design.md 参照）
- **テスト**: バックエンド PHPUnit 380件超・フロントエンド Vitest。認可・404・バリデーション・破壊的処理を重点カバー

## 開発環境の起動

```bash
docker compose up -d                          # 全サービス起動
docker compose exec -T php php artisan test   # バックエンドテスト
cd frontend && npm run build                  # フロント型チェック＋ビルド
```

## リポジトリに含まれないもの

- **『Master of Epic』公式素材の画像**（公式配布バナー・ファンサイトキット素材）: 公式ガイドラインで「個人の非営利WEBサイトでのみ使用可」とされているため、再配布を避ける目的でリポジトリから除外しています（`.gitignore` 参照）。そのため clone してビルドしても一部画像は表示されません。
- **デプロイ・運用ファイル**: 本番サーバーの情報を含むため非公開で管理しています。
- **`.env` 実体**: `.env.example` / `backend/.env.example` を雛形として使用します。

## 著作権表記

『Master of Epic』に関する著作権はすべて権利者に帰属します。

(C)MOE K.K. (C)Konami Digital Entertainment 株式会社MOE及び株式会社コナミデジタルエンタテインメントの著作権を侵害する行為は禁止されています。

- Master of Epic 公式サイト: https://moepic.com/
