# MoE Trade サイト設計ドキュメント

## 概要

Master of Epic のゲーム内アイテム・スキルを取引するためのWebサービス。
出品一覧からアイテム／スキルを検索し、取引希望を送って交渉できるプラットフォーム。

- **フロントエンド**: React (Vite + TypeScript)
- **バックエンド**: Laravel (PHP)
- **データベース**: MySQL（本番: さくらのレンタルサーバー付属 / 開発: Docker の MySQL 8）
- **ローカル開発環境**: Docker Compose（nginx / php-fpm / React dev / MySQL / Mailpit / phpMyAdmin）
- **ホスティング**: さくらのレンタルサーバー
- **ローカル配置**: `C:\Dev\moe_trade`

---

## 機能一覧

### 1. ユーザー認証
- メールアドレス＋パスワードでの新規登録・ログイン
- 新規登録画面表示時に利用規約モーダルを表示し、同意必須（同意するまで登録不可）
- 登録時にサーバーごとのキャラクター名を設定可能（任意）
- パスワードリセット（メール送信）
- メール認証必須（認証完了前は出品不可）
- **未ログイン時は「出品する」「取引」ボタンを非表示／ログイン導線に置き換え**（後述「共通UX仕様」）

### 2. アイテム・スキル情報管理
- **ユーザー**: 出品時に未登録アイテム／スキルを新規登録できる（`unverified` として登録）
- **編集者・管理者**: 情報の確認・修正・`verified` への変更、削除
- アイテムカテゴリ階層管理（装備品系・スキル・装備セット）
- CSVインポートによる一括登録（admin）
- 未確認アイテムには ⚠ 警告バナーを表示
- **スキル種別**: 「スキル」カテゴリ（子: ノアピース / 秘伝の書）のアイテムは、追加効果・付加効果・特殊条件・染色の代わりに「必要スキル値」を設定する（後述）

### 3. 出品機能
- アイテム／スキルを選択して出品（価格・数量・取引方法・コメントを入力）
- 取引可能サーバーを複数選択（Emerald / Diamond / Pearl）
- 取引方法: 即決 / 交渉可
- 通貨: AC（固定）
- 出品期限は7日間。期限切れは自動取り下げ、マイページから再出品可能

### 4. 検索・閲覧機能
- 出品一覧は **「装備品」「スキル」タブ** で切り替え（`/listings` と `/skills`）。`is_skill` パラメータでサーバー側が絞り込む
- **装備品タブ**: アイテム名・種別・追加効果・付加効果・特殊条件でのフィルタリング（全条件AND）。追加効果・付加効果は数値範囲での絞り込み対応
- **スキルタブ**: スキル系カテゴリ（ノアピース / 秘伝の書）のみ表示し、テーブルの効果列を「必要スキル」表示に切り替え
- 種別フィルターに「装備セット」を追加。通常種別を選択した場合は「装備セットを含める」チェックボックスで、選択した部位をすべて含む装備セットも対象に追加可能（AND条件）
- 価格帯・取引方法・サーバー（複数選択）でのフィルター
- ソート：新着順 / 価格昇順 / 価格降順
- テーブル形式で一覧表示
- マスタ情報（カテゴリ・付加効果ラベル等）の取得が完了するまで、ページ中央にローディング表示（スピナー）

### 5. 取引希望・チャット
- 出品一覧から「取引」ボタンでサーバー・希望時間帯・備考を入力して取引希望を送信（**要ログイン**）
- 出品者は全チャットを確認できる。取引希望者は自分のチャットのみ確認可能
- チャットステータス: 交渉中 / 取引成立 / 見送り
- 取引完了は出品者・取引希望者の双方が確認（`seller_completed` / `buyer_completed`）
- 「取引成立」にすると同じ出品の他チャットは自動で「見送り」に
- 再オープン機能あり

### 6. 価格データ解析
- 統計サマリー（最安値・最高値・平均・中央値・取引成立件数・出品中件数）
- 相場変動グラフ（最安値・平均・中央値・最高値）
- 過去の取引成立一覧（価格・サーバー・日時）
- 現在の出品価格一覧
- 取引履歴が無いアイテムでも 0 埋めの統計と現在出品を返し、画面が落ちないよう防御的に実装

### 7. マイページ
- 出品中タブ：出品管理（期限更新・再出品・取り下げ）＋各出品のチャット一覧
- 取引希望タブ：自分が取引希望を出した一覧
- キャラクター管理（追加・変更・削除）
- ブラウザ通知の有効化

### 8. 通知
- 未読チャットのヘッダーバッジ表示
- 5秒ポーリングで新着チェック
- ブラウザ通知（Notification API）

### 9. 管理機能（editor / admin）
- アイテム一覧・検索・確認済みフラグ管理（**「装備品」「スキル」タブで切り替え**）
- アイテム編集（装備品: 追加効果・付加効果・特殊条件・染色 / スキル: 必要スキル値）
- 未確認アイテムの確認操作
- **admin限定**: ユーザー管理（権限変更・利用停止・解除）

### 10. 相場操作・不正アカウント対策
- 同一IPからの複数アカウント自動停止
- メール認証必須
- 相場データのIPチェック（同一IP取引は無効化）

---

## 共通UX仕様

### ログイン状態によるアクション制御
- **未ログイン時**は以下を非表示／ログイン導線に置き換える：
  - 出品一覧の「+ 出品する」ボタン（ヘッダーの「出品する」も同様）
  - 各出品行の「取引」ボタン
  - 出品詳細の「取引希望チャットを開く」ボタン → 「取引するにはログインが必要です」（`/auth/login` への導線）に置換
- 出品詳細・一覧の閲覧自体は未ログインでも可能（「詳細」リンクは常時表示）

### マスタ取得中のローディング表示
- セレクトボックスの選択肢など、マスタ情報の取得が完了するまでページ中央にスピナーを表示する
- 共通コンポーネント `frontend/src/components/Spinner.tsx`（`center` 指定で縦中央寄せ）
- 適用ページ: 出品一覧（装備品/スキル）、アイテム管理、アイテム追加・編集、新規アイテム登録フォーム

### 出品一覧のタブとルーティング
- `/listings`（装備品）と `/skills`（スキル）は同一の `ListingsPage` コンポーネントを `mode` プロップで切り替える
- ルートごとに React の `key`（`"equipment"` / `"skill"`）を付与し、タブ切り替え時に確実に再マウントさせる（`is_skill` 検索パラメータやフィルター状態が古いまま残らないようにするため）

---

## 画面構成

```
/ → /listings にリダイレクト
├── /listings                 # 出品一覧・検索（装備品タブ）
├── /skills                   # 出品一覧・検索（スキルタブ）
│   └── /listings/:id         # 出品詳細（価格解析・チャット）
├── /listings/new             # 出品登録フォーム
├── /auth/register            # 新規登録（キャラクター名設定含む）
├── /auth/login               # ログイン
├── /mypage                   # マイページ
├── /admin → /admin/items
│   ├── /admin/items          # アイテム・スキル管理（装備品/スキルタブ・editor/admin）
│   ├── /admin/items/new      # アイテム追加
│   ├── /admin/items/:id/edit # アイテム編集
│   └── /admin/users          # ユーザー管理（admin限定）
```

---

## アイテム種別定義

### 装備セット
複数の部位をまとめて1アイテムとして扱う特殊種別。
登録時に既存の部位カテゴリ（武器・防具・装飾品の子カテゴリ）から構成部位を複数選択する。
`items.is_equipment_set = true` かつ `items.set_piece_category_ids` に構成部位のカテゴリIDを配列で保持。

### スキル
スキルそのものを取引対象とする種別。親カテゴリ「スキル」の配下に以下の子カテゴリを持つ。
- ノアピース
- 秘伝の書

スキル種別のアイテムは追加効果・付加効果・特殊条件・染色を持たず、代わりに「必要スキル値」（`items.skill_requirements`）を設定する。
出品一覧・管理画面では「スキル」タブで表示が切り替わり、効果列が「必要スキル」表示になる。

### 武器
刀剣 / こん棒 / 槍 / 銃器 / 投げ / 弓 / 素手

### 防具
頭 / 胴 / 手 / パ / 靴 / 肩 / 腰

### 装飾品
頭(装) / 顔(装) / 耳(装) / 指(装) / 胸(装) / 背中(装) / 腰(装)

---

## アイテムパラメータ定義

### 追加効果（数値パラメータ・装備品種別）
| パラメータ名 | キー |
|---|---|
| 攻撃力 | `atk` |
| 魔力 | `mag` |
| 攻撃ディレイ | `atk_delay` |
| 魔法ディレイ | `mag_delay` |
| 最大HP | `max_hp` |
| 最大ST | `max_st` |
| 最大MP | `max_mp` |
| 命中力 | `hit` |
| 回避 | `eva` |
| 耐火属性 | `res_fire` |
| 耐地属性 | `res_earth` |
| 耐水属性 | `res_water` |
| 耐風属性 | `res_wind` |
| 耐無属性 | `res_none` |
| 最大重量 | `max_weight` |
| 移動速度 | `move_speed` |

→ `items.base_stats` カラムにJSONで保持。よく検索される項目はGenerated Column + Indexで高速化。

### 付加効果（複数数値対応・装備品種別）
1つの付加効果に複数の数値を持てる。例：「剛剣の使い手」→ 物理ダメージ+15% / 命中-5% / 回避-5%

### 特殊条件（フラグ・装備品種別）
| 略称 | 意味 |
|---|---|
| NT | No Trade — 他プレイヤーへのトレード不可 |
| OP | One Per Person — 一人一個のみ |
| CS | Can't Sell — 売却不可 |
| CR | Can't Repair — 修理不可 |
| PM | Power Maintain — 消耗度による威力計算なし |
| NC | No Cut-down — 修理による最大耐久度低下なし |
| NB | No Break — 耐久度による武器破壊なし |
| ND | No Drop — 死亡時ドロップなし |
| CA | Chaos Age — カオスエイジで死亡しても消えない |
| DL | Dead Lost — 死亡すると消える |
| TC | Time Capsule — タイムカプセルボックス不可 |
| LO | Logout — ログアウトすると消える |
| AL | Area Limit — 現在のエリア限定 |
| WA | War Age — WarAgeでは性能低下 |
| DA | Designated Area — 指定エリア外では性能反映なし |

→ `items.special_conditions` カラムにJSON配列で保持。例: `["NT", "ND", "PM"]`

### 必要スキル値（スキル種別）
スキル種別のアイテムは、各スキルの必要値（0〜100）を `items.skill_requirements` に
`{ "スキル名": 値 }` 形式のJSONで保持する。例: `{ "刀剣": 80, "筋力": 50 }`

スキル一覧（グループ別）:

| グループ | スキル |
|---|---|
| 戦闘 | 筋力 / 着こなし / 攻撃回避 / 生命力 / 知能 / 持久力 / 精神力 / 集中力 / 呪文抵抗力 |
| 基本 | 落下耐性 / 水泳 / 死体回収 / 包帯 / 自然回復 / 採掘 / 伐採 / 収穫 / 釣り / 解読 |
| 生産 | 料理 / 鍛冶 / 醸造 / 木工 / 裁縫 / 薬調合 / 装飾細工 / 複製 / 栽培 / 美容 |
| 熟練 | 素手 / 刀剣 / こんぼう / 槍 / 銃器 / 弓 / 盾 / 投げ / 牙 / 罠 / キック / 戦闘技術 / 酩酊 / 物まね / 調教 / 破壊魔法 / 回復魔法 / 強化魔法 / 神秘魔法 / 召喚魔法 / 死の魔法 / 魔法熟練 / 自然調和 / 暗黒命令 / 取引 / シャウト / 音楽 / 盗み / ギャンブル / ﾊﾟﾌｫｰﾏﾝｽ / ダンス |

→ フロントエンド定数 `frontend/src/utils/constants.ts` の `SKILL_GROUPS` で定義。

---

## データベース設計

### users（ユーザー）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| email | VARCHAR(255) UNIQUE | |
| password | VARCHAR(255) | ハッシュ済み |
| role | ENUM('user','editor','admin') | 権限 |
| register_ip | VARCHAR(45) | 登録時IPアドレス（IPv6対応） |
| is_suspended | BOOLEAN | 出品非表示フラグ（デフォルトfalse） |
| email_verified_at | TIMESTAMP | Laravel標準。NULLなら未認証 |
| created_at / updated_at | TIMESTAMP | |

### user_characters（キャラクター）
1ユーザーが複数サーバーにキャラクターを持てる。サーバーごとに1キャラクターまで。

| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | |
| server | ENUM('Emerald','Diamond','Pearl') | |
| character_name | VARCHAR(100) | ゲーム内キャラクター名 |
| created_at / updated_at | TIMESTAMP | |

- UNIQUE制約: `(user_id, server)` — 同じサーバーに2つ登録不可

### item_categories（アイテムカテゴリ）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| parent_id | BIGINT FK(self) | 親カテゴリ（NULLならルート） |
| name | VARCHAR(100) | カテゴリ名（例: 武器、刀剣、スキル、ノアピース） |
| sort_order | INT | 表示順 |

ルートカテゴリ: 装備セット / スキル / 武器 / 防具 / 装飾品
（スキルの子: ノアピース・秘伝の書。装備セットは子を持たない特殊カテゴリ）

### items（アイテムマスタ）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| category_id | BIGINT FK | 装備セットの場合は「装備セット」親カテゴリのID |
| name | VARCHAR(200) | アイテム名 |
| description | TEXT | 説明文 |
| image_url | VARCHAR(500) | アイテム画像 |
| base_stats | JSON | 追加効果の数値（atk, mag, max_hp 等／装備品種別） |
| special_conditions | JSON | 特殊条件フラグ配列（例: ["NT","ND"]／装備品種別） |
| dyeable | BOOLEAN | 染色可否（NULL = 未設定／装備品種別） |
| is_equipment_set | BOOLEAN | 装備セットフラグ（デフォルト: false） |
| set_piece_category_ids | JSON | 装備セットの構成部位カテゴリID配列（例: [3,4,5]） |
| skill_requirements | JSON | スキル種別の必要スキル値（例: {"刀剣":80,"筋力":50}）。NULL = 非スキル |
| verified_status | ENUM('unverified','verified') | 確認状態（デフォルト: unverified） |
| submitted_by | BIGINT FK(users) | 登録者（ユーザーが登録した場合に記録） |
| verified_by | BIGINT FK(users) | 確認者（admin/editor） |
| verified_at | TIMESTAMP | 確認日時 |
| created_at / updated_at | TIMESTAMP | |

### bonus_effect_types（付加効果種別マスタ）
検索フィルターで使用する付加効果の種別定義。

| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| type_key | VARCHAR(50) UNIQUE | 検索キー（例: `magic_dmg_up`） |
| label | VARCHAR(100) | 表示名（日本語） |
| category | VARCHAR(50) | 大分類（attack / magic / defense / recovery / skill / speed / production / misc） |

### item_bonus_effects（付加効果）
1つの付加効果に複数の数値を持てる構造。

| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| item_id | BIGINT FK | |
| effect_name | VARCHAR(200) | 付加効果名（例: 炎の魔剣） |
| values | JSON | 数値配列 `[{value, value_unit, label}]` |
| description | TEXT | 説明文 |

`values` の要素構造：
```json
[
  { "value": 15, "value_unit": "%", "label": "物理ダメージ" },
  { "value": -5, "value_unit": "%", "label": "命中" }
]
```

`value_unit` の値: `%` / `fixed`（固定値） / `x`（倍率） / `per_min`（毎分）

### listings（出品）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | 出品者 |
| item_id | BIGINT FK | |
| price | INT | 価格（AC） |
| currency | VARCHAR(10) | 固定値: AC |
| quantity | INT | 数量 |
| trade_type | ENUM('fixed','negotiable') | 取引方法（即決 / 交渉可） |
| comment | TEXT | 出品コメント |
| status | ENUM('active','expired','cancelled','completed','deal_failed') | 出品状態 |
| expires_at | TIMESTAMP | 出品期限（作成・更新から7日後） |
| created_at / updated_at | TIMESTAMP | |

### listing_servers（出品サーバー）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| listing_id | BIGINT FK | |
| server | ENUM('Emerald','Diamond','Pearl') | |
| character_id | BIGINT FK(user_characters) | 連絡先キャラ |

- UNIQUE制約: `(listing_id, server)`

### trade_chats（取引チャット）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| listing_id | BIGINT FK | |
| buyer_id | BIGINT FK(users) | 取引希望者 |
| server | ENUM('Emerald','Diamond','Pearl') | 取引希望サーバー |
| status | ENUM('open','deal','declined') | 交渉中 / 取引成立 / 見送り |
| seller_completed | BOOLEAN | 出品者側の取引完了確認（デフォルト false） |
| buyer_completed | BOOLEAN | 取引希望者側の取引完了確認（デフォルト false） |
| created_at / updated_at | TIMESTAMP | |

- 「取引成立」にすると同じ listing_id の他チャットは自動で `declined` に
- 双方が完了確認すると取引成立として `trade_history` に記録
- 希望時間帯・備考は取引希望時の最初のメッセージとして送信（カラムなし）

### trade_messages（チャットメッセージ）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| chat_id | BIGINT FK(trade_chats) | |
| user_id | BIGINT FK | |
| message | TEXT | |
| created_at | TIMESTAMP | |

### trade_history（取引履歴・相場データ）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| listing_id | BIGINT FK | |
| item_id | BIGINT FK | |
| seller_id | BIGINT FK | |
| seller_ip | VARCHAR(45) | 出品者のIP |
| buyer_ip | VARCHAR(45) | 取引完了操作時のIP |
| price | INT | 取引価格 |
| currency | VARCHAR(10) | |
| server | ENUM('Emerald','Diamond','Pearl') | 取引サーバー |
| is_valid | BOOLEAN | 相場データとして有効か（デフォルトtrue） |
| traded_at | TIMESTAMP | |

---

## APIエンドポイント（Laravel）

### 認証
- `POST /api/auth/register` — `characters[]` パラメータで初期キャラクター登録可
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `POST /api/email/resend` — 認証メール再送信
- `POST /api/auth/forgot-password` — パスワード再設定メールの送信（`email`）
- `POST /api/auth/reset-password` — パスワードの再設定（`token` / `email` / `password` / `password_confirmation`）

### キャラクター
- `GET    /api/characters` — 自分のキャラクター一覧
- `POST   /api/characters` — 登録・更新（upsert: server単位で1件）
- `DELETE /api/characters/:id` — 削除

### アイテム
- `GET  /api/items` — 一覧・検索
- `GET  /api/items/:id` — 詳細
- `POST /api/items` — 登録（全ログインユーザー。unverified で作成。`skill_requirements` 対応）
- `PUT  /api/items/:id` — 編集（editor/admin、または本人は unverified 期間のみ）
- `POST /api/items/:id/verify` — 確認済みにする（editor/admin）
- `DELETE /api/items/:id` — 削除（admin）
- `GET  /api/items/:id/price-analytics` — 価格解析データ（`stats` / `history` / `recent_deals` / `recent_listings` を返す。取引履歴が無くても 0 埋めで返却）

### カテゴリ
- `GET  /api/categories` — ツリー形式で全取得
- `POST /api/categories` — 登録（admin）

### 出品
- `GET  /api/listings` — 一覧・検索。`is_skill`（true: スキル系カテゴリのみ / false: それ以外）でタブ別に絞り込み
- `GET  /api/listings/:id` — 詳細
- `POST /api/listings` — 出品登録（要ログイン・メール認証済み）
- `PUT  /api/listings/:id` — 編集（本人のみ）
- `DELETE /api/listings/:id` — 削除（本人/admin）
- `POST /api/listings/:id/renew` — 出品期限を7日延長
- `GET  /api/listings/:id/chats` — チャット一覧（出品者のみ）
- `POST /api/listings/:id/chats` — 取引希望チャット作成（server・preferred_time を含む）

### チャット
- `GET  /api/chats/:id` — チャット詳細（メッセージ含む）
- `POST /api/chats/:id/messages` — メッセージ送信
- `POST /api/chats/:id/deal` — 取引成立（同出品の他チャットを declined に）
- `POST /api/chats/:id/decline` — 見送り
- `POST /api/chats/:id/reopen` — 再オープン

### 管理（admin/editor）
- `GET /api/admin/users` — ユーザー一覧（admin。`characters` を含めて全件返却）
- `PUT /api/admin/users/:id/role` — 権限変更（admin）
- `POST /api/admin/users/:id/suspend` — 利用停止（admin）
- `POST /api/admin/users/:id/unsuspend` — 停止解除（admin）

---

## 相場操作・不正アカウント対策

### ① 同一IPからの複数アカウント作成
- 登録時にIPを `register_ip` に記録
- 同一IPで2つ目のアカウントが作成された時点で、そのIPに紐づく**全アカウントの `is_suspended = true`** をリアルタイムで設定
- `is_suspended = true` のユーザーの出品は検索結果・一覧に表示しない
- 管理者が手動解除可能。停止時に通知メール送信

### ② メール認証必須
- 登録後、メール認証を完了しないと出品・取引希望操作不可
- `email_verified_at` カラム（Laravel標準）を使用

### ③ 相場データの改ざん防止
- `trade_history` に `seller_ip` / `buyer_ip` を記録
- 出品者と取引完了操作者のIPが一致する場合、`is_valid = false` として相場に反映しない

---

## 出品期限・自動取り下げ仕様

- 出品時に `expires_at = created_at + 7日` をセット
- `/api/listings/:id/renew` で7日延長
- 毎日0時にバッチ処理で期限切れ出品を `expired` に変更（Artisanコマンド `listings:expire`）

```
# さくらのレンタルサーバー cron 設定
0 0 * * * php /home/{user}/laravel/artisan listings:expire
```

---

## 利用規約同意フロー

新規登録画面（`/auth/register`）を開くと、利用規約モーダルを画面前面に表示し、同意するまで登録手続きへ進めない。

### 動作仕様
- 登録画面マウント時にモーダル（`TermsModal`）を自動表示。`agreed` 状態が `false` の間は常に前面に表示し、背後の登録フォームは操作できない。
- モーダルには利用規約の全文をスクロール領域で表示。
- 「同意する」を押下すると `agreed = true` となりモーダルを閉じ、登録フォームが操作可能になる。
- 「同意しない」を押下するとトップページ（`/`）へ遷移する。
- 同意前は「登録する」ボタンを無効化（`disabled`）。さらに送信処理（`handleSubmit`）の冒頭でも同意チェックを行い、未同意の場合は「利用規約に同意してください」を表示して処理を中断する（二重の安全策）。

### 規約内容（初期・暫定）
1. 第1条（適用）
2. 第2条（アカウント登録）
3. 第3条（取引について） — RMT（リアルマネートレード）禁止を明記
4. 第4条（禁止事項）
5. 第5条（免責事項）
6. 第6条（規約の変更）

※ 文面は暫定。正式リリース前に確定版へ差し替える。

### 実装
- コンポーネント: `frontend/src/components/TermsModal.tsx`（`onAgree` / `onDecline` を props で受け取る）
- 組み込み先: `frontend/src/pages/RegisterPage.tsx`（`agreed` 状態で表示制御）
- 同意状態はクライアント側のみで保持（現時点ではサーバーへの同意記録は行わない）。

---

## ローカル開発環境（Docker Compose）

`docker-compose.yml` で以下のサービスを起動する。

| サービス | 内容 | ポート |
|---|---|---|
| nginx | リバースプロキシ（Laravel / フロント配信） | 80 |
| php | Laravel（php-fpm 8.3 + composer + node） | - |
| frontend | React 開発サーバー（`npm install && npm run dev`） | 5173 |
| db | MySQL 8.0（DB: moe_trade） | 3306 |
| mailpit | 開発用メールサーバー（Web UI / SMTP） | 8025 / 1025 |
| phpmyadmin | DB管理UI | 8080 |

### よく使うコマンド
```bash
# 起動（vendor / node_modules はコンテナ側で生成）
docker compose up -d --build
docker compose exec php composer install

# マイグレーション・シーダー
docker compose exec php php artisan migrate
docker compose exec php php artisan db:seed --class=ItemCategorySeeder

# 個別シーダー（ItemCategorySeeder は実行前にテーブルを truncate）
docker compose exec -e COMPOSER_PROCESS_TIMEOUT=0 php composer install   # unzip タイムアウト回避
```

> 補足: `vendor` をホストのバインドマウントに書き込むと展開が遅くタイムアウトしやすい。
> 必要に応じて `vendor` を名前付きボリュームに分離すると高速化できる。

---

## パスワード再設定フロー

ログイン画面の「パスワードをお忘れですか？」から、メール経由でパスワードを再設定できる。Laravel標準のパスワードブローカー（`password_reset_tokens` テーブル）を利用する。

### フロー
1. ログイン画面（`/auth/login`）→「パスワードをお忘れですか？」リンク → 再設定申請画面（`/auth/forgot-password`）。
2. メールアドレスを入力して送信 → `POST /api/auth/forgot-password`。
3. サーバーが再設定トークンを発行し、再設定メールを送信（`ResetPasswordJapanese` 通知）。メール内リンクはフロントの `/auth/reset-password?token=...&email=...` を指す。
4. リンクを開く → 再設定画面（`/auth/reset-password`）。新しいパスワードを入力して送信 → `POST /api/auth/reset-password`。
5. 成功後、ログイン画面（`/auth/login?reset=1`）へ遷移し、完了メッセージを表示。

### 仕様・セキュリティ
- トークン有効期限は60分（`config/auth.php` の `passwords.users.expire`）。
- 同一メールへの再送はスロットリング（60秒）。超過時は `429` を返す。
- `forgot-password` はメールアドレスの存在有無に関わらず同一メッセージを返し、アカウントの有無を推測されないようにする（アカウント列挙対策）。
- 再設定成功時、該当ユーザーの既存APIトークン（Sanctum）を全て失効させ、`remember_token` を再生成する。
- 再設定画面はクエリの `token` / `email` が欠落している場合は無効リンクとして扱う。

### 実装
- バックエンド: `AuthController@forgotPassword` / `@resetPassword`、`App\Notifications\ResetPasswordJapanese`、`User::sendPasswordResetNotification()` のオーバーライド。
- フロントエンド: `pages/ForgotPasswordPage.tsx` / `pages/ResetPasswordPage.tsx`、`api/auth.ts`（`forgotPassword` / `resetPassword`）、ログイン画面への導線。

---

## 開発フェーズ

### Phase 1: フロントエンド（完了）
- [x] React プロジェクト初期化（Vite + TypeScript）
- [x] 出品一覧・検索ページ（テーブル形式・装備品/スキルタブ）
- [x] 出品登録フォーム・アイテム新規登録（スキル必要値対応）
- [x] ログイン・登録画面（キャラクター名設定含む）
- [x] マイページ（出品管理・キャラクター管理）
- [x] 取引希望チャット機能
- [x] 出品詳細（価格データ解析）
- [x] 管理画面（アイテム管理・ユーザー管理・装備品/スキルタブ）
- [x] 通知機能（バッジ・ブラウザ通知）
- [x] 未ログイン時のアクション制御・マスタ取得中のローディング表示

### Phase 2: バックエンド（完了）
- [x] Docker環境構築
- [x] Laravel プロジェクト初期化・DB接続設定
- [x] 認証API（Laravel Sanctum）・メール認証
- [x] マイグレーション・シーダー（カテゴリ・付加効果種別）
- [x] アイテム・出品・チャットのCRUD API（スキル種別対応）
- [x] 価格解析API
- [x] 管理API（ユーザー管理）
- [x] 自動取り下げバッチ（Artisanコマンド `listings:expire`）

### Phase 3: 結合・リリース（進行中）
- [x] フロントとバックエンドの結合（`USE_MOCK = false`）
- [ ] レスポンシブデザイン対応
- [ ] さくらサーバーへのデプロイ設定
- [ ] 画像アップロード機能

---

## さくらのレンタルサーバー デプロイ構成

- **PHP**: スタンダード以上推奨（PHP 8.x）
- **Laravel**: `/home/{user}/laravel/` に配置、`public/` をドキュメントルートに設定
- **React**: `npm run build` でビルドした `dist/` を Laravel の `public/` 以下に配置
- **MySQL**: さくらのコントロールパネルからDB作成
- **`.env`**: サーバー上に直接設置（Git管理外）
- **cron**: Laravelスケジューラ用に手動設定が必要
