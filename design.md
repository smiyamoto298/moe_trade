# MoE Trade サイト設計ドキュメント

## 概要

Master of Epic のゲーム内アイテム・スキルを取引するためのWebサービス。
出品一覧からアイテム／スキルを検索し、取引希望を送って交渉できるプラットフォーム。

- **フロントエンド**: React (Vite + TypeScript)
- **バックエンド**: Laravel (PHP)
- **データベース**: MySQL（本番: さくらのレンタルサーバー付属 / 開発: Docker の MySQL 8）
- **ローカル開発環境**: Docker Compose（nginx / php-fpm / React dev / MySQL / Mailpit / phpMyAdmin）
- **ホスティング**: さくらのレンタルサーバー（共用・スタンダード）。本番は **Apache + .htaccess** 構成、公開URL `https://moe-trade.sakuraweb.com`
- **デプロイ**: `deploy/` 配下に手順書（`DEPLOY.md`）と自動化スクリプト一式
- **ローカル配置**: `C:\Dev\moe_trade`（Git管理）

---

## 機能一覧

### 1. ユーザー認証
- メールアドレス＋パスワードでの新規登録・ログイン
- **メールアドレスは平文をDBに保存しない**。HMAC-SHA256のブラインドインデックスのみ保存（後述「メールアドレス保護」）
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
- **ミスリル・専用技フラグ**（`items.mithril` / `items.exclusive_skill`）: 装備品種別のみ設定可。登録・編集フォームのチェックボックスで設定し、出品一覧の追加効果列に「ミスリル」「専用技」バッジを表示
- **スキル種別**: 「スキル」カテゴリ（子: ノアピース / 秘伝の書）のアイテムは、追加効果・付加効果・特殊条件・染色の代わりに「必要スキル値」を設定する（後述）

### 3. 出品機能
- アイテム／スキルを選択して出品（価格・取引方法・コメントを入力）
- **1出品 = 1点**（`quantity` は常に 1。出品フォームに数量入力欄は無い）
- 選択中アイテムには「相場情報」ボタンを表示し、価格データ解析をポップアップ表示（後述「価格データ解析」）
- 取引可能サーバーを複数選択（Emerald / Diamond / Pearl）
- 取引方法: 即決 / 交渉可
- 通貨: AC（固定）
- **削れあり**: 耐久度に削れがある中古品かどうかを出品ごとに設定（`listings.is_worn`）。出品フォームのチェックボックスで指定
- 出品期限は7日間。期限切れは自動取り下げ、マイページから再出品可能
- 出品フォームに期限の注意書きを表示（「7日間で期限切れ／マイページから延長可能」）

#### 一括出品（`/listings/bulk`・要ログイン）
ゲーム公式サイトの「所持アイテム一覧」をコピーして貼り付け、まとめて出品できる。
- 貼り付け（タブ区切り）→「読込」で登録用テーブルを表示。列は「転送（○/×）」セルを基準に相対位置で解析するため、レンタル列の有無どちらでも動作する
- **転送が × のデータ・「空き」スロットは除外**（除外件数を表示）
- 貼り付けたアイテム名を登録済みアイテムと照合し、一致すれば自動で紐付け。公式サイトの省略表記（末尾「...」「…」）は前方一致でマッチ（`POST /api/items/match`）
- 未登録の行には「+ 新規登録」ボタンを表示し、ポップアップ（`NewItemForm`）で登録。登録すると同名の行すべてに反映
- 登録済みアイテムの行のみ「価格」「出品数（デフォルト0）」を入力可能。「相場情報」ボタンも表示
- **出品数 N → 個数1の出品を N 件、別々の出品として作成**（出品数 ≤ 所持個数。価格は1以上必須）
- 取引方法・出品サーバーはページ上部で共通指定し、全出品に適用

### 4. 検索・閲覧機能
- 出品一覧は **「装備品」「スキル」タブ** で切り替え（`/listings` と `/skills`）。`is_skill` パラメータでサーバー側が絞り込む
- **装備品タブ**: アイテム名・種別・追加効果・付加効果・特殊条件でのフィルタリング（全条件AND）。追加効果・付加効果は数値範囲での絞り込み対応
- **スキルタブ**: スキル系カテゴリ（ノアピース / 秘伝の書）のみ表示し、テーブルの効果列を「必要スキル」表示に切り替え。**必要スキル値での絞り込み**に対応（スキル名を複数選択＋スキルごとに数値範囲指定。`skill_keys` / `skill_ranges` パラメータ）
- 種別フィルターに「装備セット」を追加。通常種別を選択した場合は「装備セットを含める」チェックボックスで、選択した部位をすべて含む装備セットも対象に追加可能（AND条件）
- 価格帯・取引方法・サーバー（複数選択）でのフィルター
- **削れあり**: 出品名の横に「⚠ 削れあり」警告アイコンを表示。フィルターに「削れありを非表示」チェック（`exclude_worn`）を用意
- ソート：新着順 / 価格昇順 / 価格降順
- テーブル形式で一覧表示
- マスタ情報（カテゴリ・付加効果ラベル等）の取得が完了するまで、ページ中央にローディング表示（スピナー）

### 5. 取引希望・チャット
- 出品一覧の「取引」ボタン、または出品詳細の「取引希望を送る」からサーバー・希望時間帯・備考を入力して取引希望を送信（**要ログイン**）
- **チャットのやり取りはマイページで行う**（出品詳細にはチャット機能を置かない。出品者には「マイページで管理」への導線を表示）
- 出品者は全チャットを確認できる。取引希望者は自分のチャットのみ確認可能
- チャットステータス: 交渉中 / 取引成立 / 見送り
- 取引完了は出品者・取引希望者の双方が確認（`seller_completed` / `buyer_completed`、`POST /chats/:id/complete`）
- 「取引成立」にすると出品が `completed` になり取引履歴を記録。同じ出品の他チャット（open）は新規メッセージ送信不可（「他のユーザーの取引が成立しています」）
- 取引成立後に不成立となった場合は「取引不成立」（`POST /chats/:id/deal-failed`）で出品を `deal_failed` に変更。**チャットも `deal_failed` ステータスになり、交渉中には戻さずメッセージ送信・操作を不可（編集不可）にする**。成立時に記録した取引履歴は削除され、相場データに残らない。`relist: true` の場合は新しい出品を作成し、出品中一覧へ即時反映
- 再オープン機能あり
- **入力中に出品が取り下げ／取引成立した場合**: 取引希望送信時にバックエンドが 400 を返し、フロントはエラー表示のうえ出品一覧へ誘導する（一覧上のパネルの場合は一覧を再取得＋エラーバナー表示、出品詳細からの場合は `/listings` へリダイレクト）
- **出品詳細（`GET /api/listings/:id`）は公開対象（`active` / `completed`）のみ閲覧可**。取り下げ・期限切れ等は 404 を返し、直接URLでも閲覧できない（フロントは「見つかりませんでした」を表示）

### 6. 価格データ解析
- 統計サマリー（最安値・最高値・平均・中央値・取引成立件数・出品中件数）— **有効な取引（`is_valid = true`）＋手動登録の他サイト相場を集計**
- 相場変動グラフ（最安値・平均・中央値・最高値）— 同上。Y軸は1万以上を「万」単位（不要な小数は省略）、1万未満は実数で表示
- 過去の取引一覧（価格・サーバー・日時）— **同一IP取引（無効分）も表示し「相場対象外」バッジで区別**。他サイト相場は「他サイト」バッジで区別
- 現在の出品価格一覧
- 取引履歴が無いアイテムでも 0 埋めの統計と現在出品を返し、画面が落ちないよう防御的に実装
- 表示は共通モーダル `frontend/src/components/PriceAnalyticsModal.tsx`（出品登録・一括出品の「相場情報」ボタンから利用）と出品詳細ページで共有

#### 他サイト相場の手動登録（editor / admin）
他サイト等、サイト外で取引された相場情報を手動で登録できる。
- アイテム管理ページで、**確認済みアイテムの行に「相場登録」ボタン**を表示（未確認の行は「確認済みにする」ボタン）。クリックで価格・サーバー・取引日・メモの登録モーダルを開く（続けて登録可能）
- `POST /api/items/:id/market-prices`（`role:editor`）で `market_prices` テーブルに保存
- 登録した相場は価格データ解析（統計・グラフ・取引一覧）にそのまま反映される（`trade_history` の有効分とマージ）
- **ローカル環境（`APP_ENV=local`）ではテストのため、相場対象外（同一IP）扱いを行わず全件を有効として集計・表示する**（書き込み・表示の双方）

### 7. マイページ
- 出品中タブ：出品管理（期限更新・再出品・取り下げ）＋各出品のチャット一覧
- 取引希望タブ：自分が取引希望を出した一覧
- キャラクター管理（追加・変更・削除）
- ブラウザ通知の有効化

### 8. 通知
- 通知サマリーAPI（`GET /api/notifications/summary`）をログイン中5秒ポーリング
- **マイページバッジ（ヘッダー）**: 未読チャット数を表示。「最後の発言が相手」のチャットを未読とし、新規取引希望（メッセージ無しのチャット作成）も含む
- **運営掲示板バッジ（ヘッダー）**: 新着投稿があると赤ドット表示。admin は他人の全投稿、一般ユーザーは自分のスレッドへの返信が対象
- **未確認アイテムバッジ（editor / admin のみ）**: 未確認アイテムがあると件数バッジを表示。表示箇所は ①ヘッダーの「管理」メニュー・「アイテム管理」リンク（合計件数）②アイテム管理ページの「装備品」「テクニック」タブ（カテゴリ別件数）。`notifications/summary` の `unverified_items`（`equipment` / `technique` / `total`）を5秒ポーリングで取得
- 既読管理はクライアント側（localStorage）。チャットを開くと該当チャット既読、掲示板閲覧で掲示板既読
- **チャット画面・掲示板スレッドは5秒ポーリングで自動更新**（入力中テキストは別stateのため保持される）
- ブラウザ通知（Notification API）: 新着メッセージ・掲示板新着で発火
- 旧 `GET /api/chats/unread-count` は互換のため残置（フロントはsummaryを使用）

### 9. 運営掲示板
- ログインユーザーが運営への問い合わせ・要望スレッドを作成できる簡易掲示板（`/board`）
- スレッド（タイトル＋ステータス）と投稿（チャット形式）で構成
- スレッドステータス: `open`（受付中） / `resolved`（解決済み・admin が変更）
- **admin**: ステータス変更・スレッド削除・投稿削除が可能
- 投稿者の表示名は登録キャラクター名（メール秘匿のため）。キャラ未登録は「ユーザー#ID」、退会済みは「退会ユーザー」
- ヘッダーに「運営掲示板」リンクを常設

### 10. 管理機能（editor / admin）
- アイテム一覧・検索・確認済みフラグ管理（**「装備品」「テクニック」タブで切り替え**。各タブに未確認件数バッジ）
- アイテム編集（装備品: 追加効果・付加効果・特殊条件・染色 / スキル: 必要スキル値）
- 未確認アイテムの確認操作（行に「確認済みにする」ボタン）
- 確認済みアイテムは「相場登録」ボタンから他サイト相場を手動登録（前述「価格データ解析」）
- **アイテム削除（admin）**: 出品・取引履歴と紐づく場合は禁止せず、件数入りの**確認モーダル**を表示。承諾すると関連する出品・取引チャット・取引履歴ごと削除する（確認は `window.confirm` ではなく状態駆動のモーダルで実装。タブ非アクティブ時のダイアログ抑制を回避）
- **admin限定**: ユーザー管理（権限変更・利用停止・解除）

### 11. 相場操作・不正アカウント対策
- 同一IPからの複数アカウント自動停止（**本番環境のみ**動作）
- メール認証必須
- 相場データのIPチェック（同一IP取引は無効化）
- メールアドレスのハッシュ化保存（情報漏洩対策・後述）

---

## 共通UX仕様

### ログイン状態によるアクション制御
- **未ログイン時**は以下を非表示／ログイン導線に置き換える：
  - 出品一覧の「+ 出品する」ボタン（ヘッダーの「出品する」も同様）
  - 各出品行の「取引」ボタン
  - 出品詳細の「取引希望を送る」ボタン → 「取引するにはログインが必要です」（`/auth/login` への導線）に置換
- 出品詳細・一覧の閲覧自体は未ログインでも可能（「詳細」リンクは常時表示）

### マスタ取得中のローディング表示
- セレクトボックスの選択肢など、マスタ情報の取得が完了するまでページ中央にスピナーを表示する
- 共通コンポーネント `frontend/src/components/Spinner.tsx`（`center` 指定で縦中央寄せ）
- 適用ページ: 出品一覧（装備品/スキル）、アイテム管理、アイテム追加・編集、新規アイテム登録フォーム

### 出品一覧のタブとルーティング
- `/listings`（装備品）・`/skills`（テクニック）・`/assets`（アセット）は同一の `ListingsPage` コンポーネントを `mode` プロップ（`'equipment' | 'skill' | 'asset'`）で切り替える
- ルートごとに React の `key`（`"equipment"` / `"skill"` / `"asset"`）を付与し、タブ切り替え時に確実に再マウントさせる（検索パラメータやフィルター状態が古いまま残らないようにするため）
- 種別は検索パラメータ `item_type`（`equipment` / `technique` / `asset`）でバックエンドに渡す。旧 `is_skill` パラメータも後方互換で受け付ける（`is_skill=1`→テクニック、`is_skill=0`→装備品）
- 種別判定はアイテムの「最上位カテゴリ名」で行う：`テクニック`→テクニック、`アセット`→アセット、それ以外→装備品。フロントは `frontend/src/utils/itemType.ts` の `itemTypeOf()` に集約

---

## 画面構成

```
/ → /listings にリダイレクト
├── /listings                 # 出品一覧・検索（装備品タブ）
├── /skills                   # 出品一覧・検索（テクニックタブ）
├── /assets                   # 出品一覧・検索（アセットタブ）
│   └── /listings/:id         # 出品詳細（価格解析・取引希望送信。チャットのやり取りはマイページ）
├── /listings/new             # 出品登録フォーム
├── /listings/bulk            # 一括出品（公式の所持アイテム一覧を貼り付けて登録）
├── /auth/register            # 新規登録（キャラクター名設定含む）
├── /auth/login               # ログイン
│   ├── /auth/forgot-password # パスワード再設定申請
│   └── /auth/reset-password  # パスワード再設定
├── /mypage                   # マイページ
├── /board                    # 運営掲示板（スレッド一覧・要ログイン）
│   └── /board/:id            # スレッド詳細（投稿チャット）
├── /admin → /admin/items
│   ├── /admin/items          # アイテム管理（装備品/テクニック/アセットタブ・editor/admin）
│   ├── /admin/items/new      # アイテム追加
│   ├── /admin/items/:id/edit # アイテム編集
│   └── /admin/users          # ユーザー管理（admin限定）
```

---

## アイテム種別定義

### 装備セット
複数の部位をまとめて1アイテムとして扱う特殊種別。`items.is_equipment_set = true` で表す。
- 各部位は**通常アイテムとして独立登録**され（部位ごとに名前・追加効果・付加効果・特殊条件などを保持）、
  `equipment_set_members`（set_item_id / piece_item_id / sort_order）でセット本体に紐付く。
- 登録/編集（editor・admin・一般ユーザー）では「設定グループ」単位で入力する。1グループに複数部位をまとめ、
  追加効果・付加効果・その他設定を1回だけ入力できる（同じ設定の部位はまとめて設定）。名前は部位ごとに個別。
- `items.set_piece_category_ids` は構成部位カテゴリの派生キャッシュ（「装備セットを含める」フィルタ用）。
- 一覧の追加効果/付加効果列は、部位を効果内容でグループ化して部位名つきで表示し、設定が異なる部位は両方表示する。
- API（`GET /items` `show`、出品/買取の一覧・詳細）は `set_members` に部位アイテム（category・bonus_effects含む）を返す。

### スキル
スキルそのものを取引対象とする種別。親カテゴリ「スキル」の配下に以下の子カテゴリを持つ。
- ノアピース
- 秘伝の書

スキル種別のアイテムは追加効果・付加効果・特殊条件・染色を持たず、代わりに「必要スキル値」（`items.skill_requirements`）を設定する。
出品一覧・管理画面では「スキル」タブで表示が切り替わり、効果列が「必要スキル」表示になる。

### アセット
ハウジング等で設置するアセットを取引対象とする種別。最上位カテゴリ「アセット」を種別そのものとして選択する（子カテゴリは持たない）。
アセット種別のアイテムは追加効果・付加効果・染色・ミスリル・専用技・必要スキル値を持たず、代わりにアセット固有のパラメータ（設置個所・サイズ・ストレージ数・特殊機能）を設定する。特殊条件は装備品と共通で利用できる。
出品一覧・管理画面では「アセット」タブで表示が切り替わり、効果列が「設置・サイズ」「ストレージ・特殊機能」「特殊条件」表示になる。

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
| 防御力 | `def` |
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

### ミスリル・専用技（フラグ・装備品種別）
ミスリル装備／専用技付き装備であることを示すフラグ。
`items.mithril` / `items.exclusive_skill`（いずれも BOOLEAN・デフォルト false）に保持。
スキル種別では常に false。出品一覧では追加効果列にバッジ表示する。

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

### アセットパラメータ（アセット種別）
アセット種別のアイテムは以下の固有パラメータを持つ。

| パラメータ | カラム | 型 | 内容 |
|---|---|---|---|
| 設置個所 | `placement` | VARCHAR(20) | 選択肢: 床 / 壁 / 天井 |
| サイズ（横） | `asset_width` | SMALLINT | 横マス数（縦と組み合わせて横×縦の矩形を表す） |
| サイズ（縦） | `asset_height` | SMALLINT | 縦マス数 |
| ストレージ数 | `storage_count` | INT | 収納可能数 |
| 特殊機能 | `special_function` | VARCHAR(30) | 単一選択: 販売員 / 銀行 / タイプカプセル / 栽培 / 生産施設 / カタログ |
| 特殊条件 | `special_conditions` | JSON | 装備品と共通（上記「特殊条件」参照） |

- サイズは横×縦を別々に指定する矩形方式（正方形固定ではない）。
- 特殊機能は1つのみ選択（複数付与は不可）。
- 選択肢はフロントエンド定数 `frontend/src/utils/constants.ts` の `ASSET_PLACEMENTS` / `ASSET_FUNCTIONS` で定義。
- いずれも装備品・テクニック種別では NULL。

---

## データベース設計

### users（ユーザー）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| email | VARCHAR(255) UNIQUE | **HMAC-SHA256のブラインドインデックス**（平文は保存しない・後述） |
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

ルートカテゴリ: 装備セット / テクニック / 武器 / 防具 / 装飾品 / アセット
（テクニックの子: ノアピース・秘伝の書。装備セット・アセットは子を持たない特殊カテゴリ）

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
| mithril | BOOLEAN | ミスリル装備フラグ（デフォルト: false／装備品種別） |
| exclusive_skill | BOOLEAN | 専用技フラグ（デフォルト: false／装備品種別） |
| is_equipment_set | BOOLEAN | 装備セットフラグ（デフォルト: false）。構成部位は `equipment_set_members` で紐付く |
| set_piece_category_ids | JSON | 装備セットの構成部位カテゴリID配列の派生キャッシュ（フィルタ用。例: [3,4,5]） |
| skill_requirements | JSON | スキル種別の必要スキル値（例: {"刀剣":80,"筋力":50}）。NULL = 非スキル |
| placement | VARCHAR(20) | アセット: 設置個所（床/壁/天井）。NULL = 非アセット |
| asset_width | SMALLINT | アセット: サイズ（横マス数）。NULL = 非アセット |
| asset_height | SMALLINT | アセット: サイズ（縦マス数）。NULL = 非アセット |
| storage_count | INT | アセット: ストレージ数。NULL = 非アセット |
| special_function | VARCHAR(30) | アセット: 特殊機能（販売員/銀行/タイプカプセル/栽培/生産施設/カタログ）。NULL = 非アセット |
| verified_status | ENUM('unverified','verified') | 確認状態（デフォルト: unverified） |
| submitted_by | BIGINT FK(users) | 登録者（ユーザーが登録した場合に記録） |
| verified_by | BIGINT FK(users) | 確認者（admin/editor） |
| verified_at | TIMESTAMP | 確認日時 |
| created_at / updated_at | TIMESTAMP | |

### equipment_set_members（装備セット構成部位）
装備セット本体（items）と構成部位アイテム（items）の多対多。部位は独立した通常アイテム。

| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| set_item_id | BIGINT FK(items) | セット本体（cascade delete） |
| piece_item_id | BIGINT FK(items) | 構成部位アイテム（cascade delete。セット削除時はピボット行のみ削除され、部位アイテム自体は残る） |
| sort_order | INT | 表示順 |

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
| quantity | INT | 数量（1出品=1点のため常に 1。複数所持は別々の出品として登録） |
| trade_type | ENUM('fixed','negotiable') | 取引方法（即決 / 交渉可） |
| comment | TEXT | 出品コメント |
| is_worn | BOOLEAN | 削れあり（耐久度に削れがある中古品。デフォルト false） |
| status | ENUM('active','expired','cancelled','completed','deal_failed') | 出品状態 |
| expires_at | TIMESTAMP | 出品期限（作成・更新から7日後） |
| created_at / updated_at | TIMESTAMP | |

### listing_servers（出品サーバー）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| listing_id | BIGINT FK | |
| server | ENUM('Emerald','Diamond','Pearl') | |
| character_id | BIGINT FK(user_characters) | 連絡先キャラ（出品時のスナップショット・`ON DELETE SET NULL`） |

- UNIQUE制約: `(listing_id, server)`
- **連絡先キャラ名の表示は `character_id` を直接使わず、出品者がそのサーバーに現在登録しているキャラクター（`user_characters` は `(user_id, server)` で一意）から動的に解決する**（`Listing::resolveServerContacts()`）。これにより、マイページでキャラクター名を変更・削除＆再登録・サーバー変更しても、一覧・詳細・取引チャットの連絡先名が消えたり古いまま残ったりしない。`character_id` は出品時点の記録として保持するのみ。

### trade_chats（取引チャット）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| listing_id | BIGINT FK | |
| buyer_id | BIGINT FK(users) | 取引希望者 |
| server | ENUM('Emerald','Diamond','Pearl') | 取引希望サーバー |
| status | ENUM('open','deal','declined','deal_failed') | 交渉中 / 取引成立 / 見送り / 取引不成立（不成立は編集不可） |
| seller_completed | BOOLEAN | 出品者側の取引完了確認（デフォルト false） |
| buyer_completed | BOOLEAN | 取引希望者側の取引完了確認（デフォルト false） |
| created_at / updated_at | TIMESTAMP | |

- 「取引成立」で出品が `completed` になり、同じ listing_id の他チャット（open）はメッセージ送信不可になる
- 取引成立時に `trade_history` へ記録。双方の完了確認は `seller_completed` / `buyer_completed` で管理
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
| is_valid | BOOLEAN | 相場データとして有効か（デフォルトtrue）。同一IP取引は false（本番のみ。local では常に有効扱い） |
| traded_at | TIMESTAMP | |

### market_prices（他サイト相場・手動登録）
editor / admin が、サイト外で取引された相場情報を手動登録するためのテーブル。価格データ解析で `trade_history`（有効分）とマージして集計する。

| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| item_id | BIGINT FK(items) | cascade削除 |
| price | INT | 取引価格 |
| currency | VARCHAR(10) | 固定値: AC |
| server | ENUM('Emerald','Diamond','Pearl') | 取引サーバー |
| traded_at | TIMESTAMP | 取引日 |
| registered_by | BIGINT FK(users) | 登録者（nullOnDelete） |
| note | VARCHAR(200) | メモ（取引元サイト等・任意） |
| created_at / updated_at | TIMESTAMP | |

### board_threads（運営掲示板スレッド）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK(users) | 作成者（cascade削除） |
| title | VARCHAR(200) | スレッドタイトル |
| status | ENUM('open','resolved') | 受付中 / 解決済み（デフォルト: open） |
| created_at / updated_at | TIMESTAMP | updated_at を最終アクティブ日時として一覧ソートに使用 |

### board_posts（運営掲示板投稿）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| thread_id | BIGINT FK(board_threads) | cascade削除 |
| user_id | BIGINT FK(users) | 投稿者（cascade削除） |
| message | TEXT | 本文（最大5000文字） |
| created_at / updated_at | TIMESTAMP | |

---

## APIエンドポイント（Laravel）

### 認証
- `POST /api/auth/register` — `characters[]` パラメータで初期キャラクター登録可
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `GET  /api/email/verify/:id/:hash` — メール認証リンク。認証後 `config('app.frontend_url')`（`FRONTEND_URL`）の `/auth/login?verified=1` へリダイレクト
- `POST /api/email/resend` — 認証メール再送信。平文メールをDBに持たないため、宛先を `email` で再入力させ登録ハッシュと照合してから送信
- `POST /api/auth/forgot-password` — パスワード再設定メールの送信（`email`）
- `POST /api/auth/reset-password` — パスワードの再設定（`token` / `email` / `password` / `password_confirmation`）

### キャラクター
- `GET    /api/characters` — 自分のキャラクター一覧
- `POST   /api/characters` — 登録・更新（upsert: server単位で1件）
- `DELETE /api/characters/:id` — 削除

### アイテム
- `GET  /api/items` — 一覧・検索
- `GET  /api/items/:id` — 詳細
- `POST /api/items` — 登録（全ログインユーザー。unverified で作成。`skill_requirements` および アセット項目 `placement` / `asset_width` / `asset_height` / `storage_count` / `special_function` 対応）
- `POST /api/items/match` — アイテム名（`names[]`）をまとめて登録済みアイテムと照合（完全一致＋末尾「...」「…」は前方一致）。一括出品で使用
- `PUT  /api/items/:id` — 編集（editor/admin、または本人は unverified 期間のみ）
- `POST /api/items/:id/verify` — 確認済みにする（editor/admin）
- `POST /api/items/:id/market-prices` — 他サイト相場の手動登録（editor/admin。`price` / `server` / `traded_at` / `note`）
- `DELETE /api/items/:id` — 削除（admin）。出品・取引履歴がある場合は `force` 未指定なら `409` + `requires_confirmation` と件数を返し、`?force=1` で関連データ（出品・チャット・取引履歴）ごと削除
- `GET  /api/items/:id/price-analytics` — 価格解析データ（`stats` / `history` / `recent_deals` / `recent_listings` を返す。`trade_history` の有効分と `market_prices` をマージ。`recent_deals` は `source`（`trade` / `manual`）と `is_valid` を含む。取引履歴が無くても 0 埋めで返却）

### カテゴリ・マスタ
- `GET  /api/categories` — ツリー形式で全取得
- `POST /api/categories` — 登録（admin）
- `GET  /api/bonus-effect-types` — 付加効果種別マスタ
- `GET  /api/bonus-effect-names` — 登録済み付加効果名の一覧（サジェスト用）
- `GET  /api/bonus-value-labels` — 付加効果数値のラベル一覧（サジェスト用）

### 出品
- `GET  /api/listings` — 一覧・検索。`item_type`（`equipment` / `technique` / `asset`）でタブ別に絞り込み（旧 `is_skill` も後方互換で受付）。テクニックタブでは `skill_keys[]`（スキル名）と `skill_ranges[スキル名][min/max]`（必要値範囲）で絞り込み可。アセットタブでは `placements[]`（設置個所）・`special_functions[]`（特殊機能）・`storage_min` / `storage_max`（ストレージ数範囲）で絞り込み可。`exclude_worn=true` で削れあり出品を除外
- `GET  /api/listings/:id` — 詳細（公開対象の `active` / `completed` のみ。それ以外は 404）
- `POST /api/listings` — 出品登録（要ログイン・メール認証済み。`quantity` は常に 1。`is_worn` で削れあり指定）
- `PUT  /api/listings/:id` — 編集（本人のみ）
- `DELETE /api/listings/:id` — 削除（本人/admin）
- `POST /api/listings/:id/renew` — 出品期限を7日延長
- `GET  /api/listings/:id/chats` — チャット一覧（出品者のみ）
- `POST /api/listings/:id/chats` — 取引希望チャット作成（server・preferred_time を含む）

### 通知
- `GET /api/notifications/summary` — 通知サマリー（5秒ポーリング用）。`unread_chats[]`（最後の発言が相手のチャット一覧）・`board`（掲示板の関係する最新投稿）・`board_threads[]`・`unverified_items`（editor/admin のみ。`equipment` / `technique` / `total`）を返す

### チャット
- `GET  /api/chats/unread-count` — 未読チャット数（旧。フロントは notifications/summary を使用）
- `GET  /api/chats/:id` — チャット詳細（メッセージ含む）
- `POST /api/chats/:id/messages` — メッセージ送信
- `POST /api/chats/:id/deal` — 取引成立（出品を completed に変更し取引履歴を記録）
- `POST /api/chats/:id/complete` — 取引完了確認（出品者／取引希望者それぞれが実行）
- `POST /api/chats/:id/deal-failed` — 取引不成立（出品を `deal_failed` に変更し、成立時の取引履歴を削除。`relist: true` で同内容の再出品を作成）
- `POST /api/chats/:id/decline` — 見送り
- `POST /api/chats/:id/reopen` — 再オープン

### マイページ
- `GET /api/mypage/listings` — 自分の出品一覧
- `GET /api/mypage/chats` — 自分が取引希望者のチャット一覧
- `GET /api/mypage/selling-chats` — 自分の出品に対するチャット一覧

### 運営掲示板（要ログイン）
- `GET   /api/board/threads` — スレッド一覧（最終アクティブ順・30件ページネーション）
- `POST  /api/board/threads` — スレッド作成（`title` / `message`）
- `GET   /api/board/threads/:id` — スレッド詳細（投稿一覧含む）
- `POST  /api/board/threads/:id/posts` — 投稿追加
- `PATCH /api/board/threads/:id/status` — ステータス変更（admin）
- `DELETE /api/board/threads/:id` — スレッド削除（admin）
- `DELETE /api/board/posts/:id` — 投稿削除（admin）

### ユーザー管理（admin限定）
ルートは `role:admin` ミドルウェア。
- `GET /api/admin/users` — ユーザー一覧（`characters` を含めて全件返却）
- `PUT /api/admin/users/:id/role` — 権限変更
- `POST /api/admin/users/:id/suspend` — 利用停止
- `POST /api/admin/users/:id/unsuspend` — 停止解除

---

## 相場操作・不正アカウント対策

### ① 同一IPからの複数アカウント作成
- 登録時にIPを `register_ip` に記録
- 同一IPで2つ目のアカウントが作成された時点で、そのIPに紐づく**全アカウントの `is_suspended = true`** をリアルタイムで設定
- **本番環境（`app()->isProduction()`）でのみ動作**（ローカル開発時の誤停止を防ぐため）
- `is_suspended = true` のユーザーの出品は検索結果・一覧に表示しない
- 管理者が手動解除可能。停止時に通知メール送信

### ② メール認証必須
- 登録後、メール認証を完了しないと出品・取引希望操作不可
- `email_verified_at` カラム（Laravel標準）を使用

### ③ 相場データの改ざん防止
- `trade_history` に `seller_ip` / `buyer_ip` を記録
- 出品者と取引完了操作者のIPが一致する場合、`is_valid = false` として相場（統計・グラフ）に反映しない
- 無効分も価格解析画面の取引一覧には表示され、「相場対象外」バッジで区別される
- **ローカル環境（`APP_ENV=local`）ではテストのため相場対象外にしない**: 取引成立時の `is_valid` を常に true で記録し、価格解析の集計・表示でも全件を有効として扱う（既存データも対象）
- 他サイト相場（`market_prices`）は editor/admin が登録した正規データとして常に有効扱い。価格解析では「他サイト」バッジで区別

---

## メールアドレス保護（ブラインドインデックス）

平文メールアドレスをDBに一切保存せず、`users.email` には **HMAC-SHA256 の決定的ハッシュ**のみを格納する（漏洩時の個人情報保護）。

### 仕組み
- ハッシュ生成: `App\Support\EmailHasher::hash()`。小文字化＋trim で正規化してから `hash_hmac('sha256', email, key)` を計算
- 秘密鍵（ペッパー）: `.env` の `EMAIL_HASH_KEY`。未設定時は `APP_KEY` にフォールバック。**一度決めたら変更不可**（変更すると全ユーザーがログイン不能になる）
- 決定的ハッシュのため、ログイン認証・重複チェック・パスワード再設定時のユーザー検索に使用可能
- `User::$hidden` に `email` を含め、APIレスポンスには出さない

### メール送信の扱い
- 平文が必要な場面（認証メール・パスワード再設定メール）では、リクエスト時にユーザーが入力した平文を `$user->plainEmail` に一時保持して宛先に使用（DBには保存しない）
- 認証メール再送（`/api/email/resend`）はメールアドレスの再入力が必須。登録ハッシュと照合してから送信
- 掲示板等でのユーザー表示名はメールではなく登録キャラクター名を使用

### 既存データの移行
- マイグレーション `2026_06_06_000001_hash_existing_user_emails` で `@` を含む（＝平文の）既存行をハッシュへ変換。不可逆のため down は無し
- 平文メールでキー付けされていた既存パスワードリセットトークンは全削除

---

## 出品期限・自動取り下げ仕様

- 出品時に `expires_at = created_at + 7日` をセット
- `/api/listings/:id/renew` で7日延長
- 毎日バッチ処理で期限切れ出品を `expired` に変更（Artisanコマンド `listings:expire`）
- 本番は `deploy/cron-expire-listings.sh` をさくらコントロールパネルの cron に登録（1日1回・例 4:00。ログは `storage/logs/cron.log` に出力）

```
# さくらコントロールパネル → cron（タスクスケジューリング）
/home/<アカウント名>/www/moe_trade/deploy/cron-expire-listings.sh
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

## テスト自動化

### バックエンド（PHPUnit）
- テストDBは **SQLiteインメモリ**（`phpunit.xml` で設定済み）。各テストで `RefreshDatabase` により全マイグレーションを実行
- `phpunit.xml` にテスト用 `APP_KEY` を定義（`EMAIL_HASH_KEY` 未設定時は `APP_KEY` がペッパーのフォールバックになる）
- MySQL専用の生SQLマイグレーション（listings の ENUM 変更）はドライバ判定でスキップし、`create_listings_table` 側で全ステータスを定義してSQLite互換を確保
- 共通ヘルパーは `tests/TestCase.php`（`makeUser` / `makeUserWithRole` / `makeCategoryTree` / `makeItem` / `makeListing`）

| テストファイル | 対象 |
|---|---|
| `tests/Unit/EmailHasherTest.php` | メールハッシュの決定性・正規化・不可逆性 |
| `tests/Feature/AuthTest.php` | 登録（ハッシュ保存・重複・正規化）／ログイン／me／再送／ログアウト |
| `tests/Feature/PasswordResetTest.php` | 再設定メール送信・アカウント列挙対策・トークン検証・既存トークン失効 |
| `tests/Feature/ItemApiTest.php` | アイテムCRUD・unverified編集権限・verify(editor)・削除(admin)・スキル必要値 |
| `tests/Feature/ListingApiTest.php` | 出品CRUD・メール認証/停止チェック・is_skill/価格フィルター・renew・期限切れバッチ |
| `tests/Feature/ChatApiTest.php` | チャット作成・重複防止・成立/不成立/完了確認・相場IPチェック・未読数 |
| `tests/Feature/BoardApiTest.php` | 掲示板スレッド/投稿・表示名・admin操作権限 |
| `tests/Feature/AdminUserApiTest.php` | ユーザー管理API・権限チェック |

実行方法:
```bash
# ローカル（Docker）
docker compose exec php php artisan test

# または
docker compose exec php vendor/bin/phpunit
```

### テスト整備時に修正した実装
- `ListingPolicy` を新設（`ListingController@update` の `authorize()` がポリシー未定義で常に403になっていた）
- `POST /api/items/:id/verify` に `role:editor`、`DELETE /api/items/:id` に `role:admin` ミドルウェアを追加（一般ユーザーでも実行できてしまっていた）

### CI（GitHub Actions）
`.github/workflows/ci.yml` — main への push / PR で自動実行。
- **backend-tests**: PHP 8.3 + composer install → PHPUnit（SQLiteインメモリ）
- **frontend-build**: Node 22 + npm ci → `tsc && vite build`（型チェック＋ビルド確認）

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

### Phase 3: 結合・リリース（完了）
- [x] フロントとバックエンドの結合（`USE_MOCK = false`）
- [x] メールアドレスのハッシュ化保存（ブラインドインデックス）
- [x] 運営掲示板（スレッド・投稿・admin管理）
- [x] ミスリルフラグ
- [x] さくらサーバーへのデプロイ設定（`deploy/` 一式・手順書・初回リリース）
- [x] メール認証リダイレクトの `FRONTEND_URL` 対応

### Phase 4: テスト自動化
- [x] バックエンドAPIテスト（PHPUnit・Feature/Unit 8ファイル・SQLiteインメモリ）
- [x] GitHub Actions CI（バックエンドテスト＋フロント型チェック・ビルド）
- [ ] フロントエンド単体テスト（Vitest 等・必要になったら導入）

### Phase 5: レスポンシブ対応
- [ ] レスポンシブデザイン対応（スマートフォン・タブレット向けレイアウト）

### 追加実装（運用フェーズ）
- [x] 一括出品（公式の所持アイテム一覧を貼り付けて登録・`POST /api/items/match`）
- [x] 出品は1点単位（数量入力を廃止・`quantity` は常に 1）
- [x] 出品詳細は `active` / `completed` のみ閲覧可（取り下げ済みは 404）
- [x] 取引希望送信時に出品が無効化されていた場合のエラー＋一覧誘導
- [x] アイテム削除を「禁止」から「確認モーダル＋関連データごと削除」に変更
- [x] 未確認アイテムの通知バッジ（editor/admin・ヘッダー＋管理タブ・5秒ポーリング）
- [x] 他サイト相場の手動登録（`market_prices`）と価格データ解析へのマージ・「相場情報」ボタン
- [x] ローカル環境では相場対象外（同一IP）扱いを無効化
- [x] アイテム種別に「アセット」を追加し、一覧を装備品 / テクニック / アセットの3タブに分割（`item_type` パラメータ・`/assets` ルート）。アセット固有パラメータ（設置個所・サイズ横×縦・ストレージ数・特殊機能）を登録/編集/一覧/詳細/絞り込みに対応

---

## さくらのレンタルサーバー デプロイ構成

詳細手順は **`deploy/DEPLOY.md`**（初回リリース手順書）を参照。

### 構成（共用サーバの制約に合わせた方針）
- **プラン**: スタンダード以上（SSH + Composer 必須）／ PHP 8.3
- **Webサーバ**: root・Docker・nginx 不可 → **Apache + .htaccess**（`deploy/public.htaccess` → `backend/public/.htaccess`）で `/api` と SPA を振り分け
- **公開フォルダ**: `/home/<アカウント名>/moe_trade/backend/public` に設定（`.env`・`vendor` を非公開にするため）
- **React**: サーバに Node が無いため**手元PCでビルド**し、`dist` の中身を `backend/public/` にアップロード
- **キュー**: 常駐プロセス不可のため `QUEUE_CONNECTION=sync`（即時実行）
- **認証**: Bearerトークン方式・API は相対パス `/api` → 同一ドメインで無調整で動作
- **MySQL**: コントロールパネルから utf8mb4 で作成（`DB_HOST` はさくらのDBサーバ名）
- **SSL**: Let's Encrypt 無料SSL ＋ HTTPS転送ON
- **公開URL**: `https://moe-trade.sakuraweb.com`

### deploy/ ディレクトリ
| ファイル | 役割 |
|---|---|
| `DEPLOY.md` | 初回リリース手順書（コンパネ設定〜動作確認・トラブルシュート） |
| `.env.production.example` | 本番 `.env` テンプレート（サーバ上でコピーして編集） |
| `public.htaccess` | 公開ディレクトリ用 .htaccess（API振り分け・SPAフォールバック） |
| `build-and-upload.sh` | 手元PC用（bash/WSL）: フロントビルド→rsyncアップロード→サーバ更新まで一括 |
| `deploy.ps1` | 手元PC用（Windows PowerShell）: rsync不要、標準 ssh/scp/tar のみで同等のデプロイ。`-SkipBuild` / `-BackendOnly` / `-FrontendOnly` オプション |
| `update-on-server.sh` | サーバ側更新処理（composer install --no-dev → migrate --force → config/route/view キャッシュ再構築） |
| `cron-expire-listings.sh` | 期限切れ出品バッチの cron 用ラッパー |

### 本番 .env の重要キー
- `APP_DEBUG=false` / `APP_ENV=production`
- `FRONTEND_URL` — メール認証後のリダイレクト先（同一ドメインなら `APP_URL` と同値）
- `EMAIL_HASH_KEY` — メールハッシュのペッパー。**一度決めたら変更しない**
- `DB_*` / `MAIL_*`（さくらのSMTP: `<アカウント>.sakura.ne.jp` / 587 / tls）
