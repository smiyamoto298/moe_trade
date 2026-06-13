# MoE Trade サイト設計ドキュメント

## 概要

Master of Epic のゲーム内アイテム・スキルを取引するためのWebサービス。
出品（売りたい）・買取（買いたい）の一覧からアイテム／スキルを検索し、取引希望を送って交渉できるプラットフォーム。
取引チャットは先着順の順番待ち（キュー）で管理し、成立した取引は相場データとして価格解析に反映される。

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

### 3-B. 買取機能（買いたい）
出品（売りたい）と対称の「買いたい」を登録できる。登録者(`buy_requests.user_id`)は**買い手**を表す。
- アイテム／価格・取引方法・コメント・取引可能サーバーを指定して買取登録（**要ログイン・メール認証済み**）。`quantity` は所持数の概念が無いため任意の整数だが運用上は出品と対称に扱う
- 一覧・詳細は `/buy-requests`・`/buy-requests/:id`。種別タブは持たず、**アイテム名のみ**で横断検索（装備品・テクニック・アセットをまとめて表示）。複数アイテム名（`item_names[]`、末尾「...」「…」は前方一致）にも対応
- **出品期限は1ヶ月**（出品の7日とは異なる）。期限切れは出品と同じ日次バッチ（`listings:expire`）で `expired` 化
- 売り手（相手側）は買取詳細の「売却を申し出る」からチャットを作成（`POST /api/buy-requests/:id/chats`）。出品チャットと同じ `trade_chats` を `buy_request_id` で使い回す
- 価格データ解析では、買取由来の成立を**「買い相場」**、出品由来を**「売り相場」**として由来別に分割表示する（`origin` = `listing` / `buy_request`）

### 4. 検索・閲覧機能
- 出品一覧は **「装備品」「スキル」タブ** で切り替え（`/listings` と `/skills`）。`is_skill` パラメータでサーバー側が絞り込む
- **装備品タブ**: アイテム名・種別・追加効果・付加効果・特殊条件でのフィルタリング（全条件AND）。追加効果・付加効果は数値範囲での絞り込み対応
- **スキルタブ**: スキル系カテゴリ（ノアピース / 秘伝の書）のみ表示し、テーブルの効果列を「必要スキル」表示に切り替え。**必要スキル値での絞り込み**に対応（スキル名を複数選択＋スキルごとに数値範囲指定。`skill_keys` / `skill_ranges` パラメータ）
- 種別フィルターに「装備セット」を追加。通常種別を選択した場合は「装備セットを含める」チェックボックスで、選択した部位をすべて含む装備セットも対象に追加可能（AND条件）
- 価格帯・取引方法・サーバー（複数選択）でのフィルター
- **削れあり**: アイテム名の上の種別（カテゴリ名／⚔ 装備セット）バッジの横に「⚠ 削れあり」警告アイコンを表示。フィルターに「削れありを非表示」チェック（`exclude_worn`）を用意
- ソート：新着順 / 価格昇順 / 価格降順
- テーブル形式で一覧表示。出品コメントがある場合は、アイテム行の直下に全列ぶち抜きのコメント行（💬 付き・改行保持で折り返し）を表示する
- マスタ情報（カテゴリ・付加効果ラベル等）の取得が完了するまで、ページ中央にローディング表示（スピナー）

### 5. 取引希望・チャット
- 出品一覧の「取引」ボタン、または出品詳細の「取引希望を送る」からサーバー・希望時間帯・備考を入力して取引希望を送信（**要ログイン**）
- **チャットのやり取りはマイページで行う**（出品詳細にはチャット機能を置かない。出品者には「マイページで管理」への導線を表示）
- 出品者は全チャットを確認できる。取引希望者は自分のチャットのみ確認可能
- チャットステータス: 交渉中 / 取引成立 / 見送り
- チャットの吹き出しはメッセージ本文を `break-words` で折り返す（スペースを含まない長文・URL でもマイページのレイアウトが崩れない）
- **取引成立（deal）チャットのメッセージ表示領域の右下にTELLコマンドのコピーアイコンを固定表示**。クリックで `/tell 取引相手のキャラクター名 `（末尾の半角スペースを含む）をクリップボードへコピーする。相手キャラ名は owner 視点では取引希望者のキャラ名（`buyer_character_name`）、取引希望者視点では取引対象のサーバー連絡先キャラ（`servers[].character`、無ければ相手側メッセージのキャラ名）を使う
- 取引完了は出品者・取引希望者の双方が確認（`seller_completed` / `buyer_completed`、`POST /chats/:id/complete`）
- 「取引成立」にすると出品が `completed` になり取引履歴を記録。同じ出品の他チャット（open）は新規メッセージ送信不可（「他のユーザーの取引が成立しています」）
- 取引成立後に不成立となった場合は「取引不成立」（`POST /chats/:id/deal-failed`）で出品を `deal_failed` に変更。**チャットも `deal_failed` ステータスになり、交渉中には戻さずメッセージ送信・操作を不可（編集不可）にする**。成立時に記録した取引履歴は削除され、相場データに残らない。`relist: true` の場合は新しい出品を作成し、出品中一覧へ即時反映
- 再オープン機能あり
- **入力中に出品が取り下げ／取引成立した場合**: 取引希望送信時にバックエンドが 400 を返し、フロントはエラー表示のうえ出品一覧へ誘導する（一覧上のパネルの場合は一覧を再取得＋エラーバナー表示、出品詳細からの場合は `/listings` へリダイレクト）
- **出品詳細（`GET /api/listings/:id`）は公開対象（`active` / `completed`）のみ閲覧可**。取り下げ・期限切れ等は 404 を返し、直接URLでも閲覧できない（フロントは「見つかりませんでした」を表示）

#### 順番待ち（先着順キュー）
同一の取引対象（出品 or 買取）に複数の取引希望が来た場合、**先着順の待ち行列**として扱う（実装は `App\Models\TradeChat` の `isFirstInQueue()` / `isWaiting()` / `annotateOwnerQueue()` / `annotateBuyerQueue()`）。
- `status='open'` のチャットを `created_at`（同時刻は `id`）の昇順に並べ、**先頭（1番目）のみ**を登録者（owner）の対応対象とする
- **2番目以降は順番待ち**。owner からは**匿名化**され（相手のユーザー情報・メッセージ・IPを伏せる）、メッセージ送信・取引成立・見送りができない（先頭に対応してから）
- 先頭を見送る（`declined`）と次が繰り上がる。owner の見送り・成立は**先着順を強制**（順番待ちを飛ばして操作不可）
- **取引成立（deal）中は次に進まない**: 成立しても順番待ちはロックのまま。取引不成立になって初めて次へ進む。受け渡し完了（owner 側の `complete`）で残りの順番待ちは自動的に `declined`（見送り）になる
- 一覧・詳細に「N人待ち」（`waiting_count`）、各チャットに自分の順位（`queue_position` / `queue_total`）を付与
- マイページの出品チャット・買取チャットは取引対象（`listing_id` / `buy_request_id`）でグループ化し、2番目以降を匿名化して返す（`GET /api/mypage/selling-chats` ほか）

### 6. 価格データ解析
- 統計サマリー（最安値・最高値・平均・中央値・取引成立件数・出品中件数）— **有効な取引（`is_valid = true`）＋手動登録の他サイト相場を集計**
- 相場変動グラフ（最安値・平均・中央値・最高値）— 同上。Y軸は1万以上を「万」単位（不要な小数は省略）、1万未満は実数で表示
- 過去の取引一覧（価格・サーバー・日時）— **同一IP取引（無効分）も表示し「相場対象外」バッジで区別**。他サイト相場は「他サイト」バッジで区別
- 現在の出品価格一覧
- 取引履歴が無いアイテムでも 0 埋めの統計と現在出品を返し、画面が落ちないよう防御的に実装
- 表示は共通モーダル `frontend/src/components/PriceAnalyticsModal.tsx`（出品登録・一括出品の「相場情報」ボタンから利用）と出品詳細ページで共有

#### 他サイト相場の手動登録（admin）
他サイト等、サイト外で取引された相場情報を手動で登録できる。
- アイテム管理ページで、**確認済みアイテムの行に「相場登録」ボタン**を表示（未確認の行は「確認済みにする」ボタン）。クリックで価格・サーバー・取引日・メモの登録モーダルを開く（続けて登録可能）
- `POST /api/items/:id/market-prices`（**`role:admin`**。editor は不可）で `market_prices` テーブルに保存
- 登録した相場は価格データ解析（統計・グラフ・取引一覧）にそのまま反映される（`trade_history` の有効分とマージ）
- **`TREAT_ALL_TRADES_VALID=true`（環境変数）のときはテストのため、相場対象外（同一IP）扱いを行わず全件を有効として集計・表示する**（書き込み・表示の双方）。`APP_ENV` とは独立した設定で、既定は `false`

### 7. マイページ
- 出品中タブ：出品管理（期限更新・再出品・取り下げ）＋各出品のチャット一覧
- 取引希望タブ：自分が取引希望を出した一覧
- キャラクター管理（追加・変更・削除）
- ブラウザ通知の有効化
- 一覧＋チャットの2カラムグリッドは `lg:grid-cols-[minmax(0,1fr)_420px]`（`1fr` だと nowrap な長文プレビューの固有最小幅で左カラムが広がり、チャットパネルがページ外へはみ出す）

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
- **投稿への画像添付**（`board_posts.image_path`・public ディスク保存。jpeg/png/gif/webp・最大5MB）。投稿は本文か画像のいずれか必須
- **投稿の編集**（本人のみ・`PUT /api/board/posts/:id`。画像の差し替え・削除も可）
- **管理者限定スレッド**（`board_threads.admin_only`）: admin のみが作成・閲覧・投稿でき、一般ユーザーには一覧・詳細とも表示しない。admin は `PATCH /api/board/threads/:id/visibility` で公開範囲を変更可能
- **admin**: ステータス変更・公開範囲変更・スレッド削除・投稿削除が可能
- 投稿者の表示名は登録キャラクター名（メール秘匿のため）。キャラ未登録は「ユーザー#ID」、退会済みは「退会ユーザー」
- ヘッダーに「運営掲示板」リンクを常設

### 9-B. お知らせ（サイト上部バナー・admin管理）
サイト上部に表示する運営からのお知らせ。`announcements` テーブルで管理する。
- 公開API `GET /api/announcements`（**認証不要**）で `is_active=true` かつ未期限切れのものを `sort_order` 昇順で返す
- 表示色 `level`（`info`=青 / `warning`=黄 / `error`=赤）、任意のリンク（`link_url` / `link_label`）を持つ
- **表示期間**（`display_days`）: 設定すると `expires_at = created_at + display_days` を保存し、期限切れは公開一覧から除外。期限切れレコードは日次バッチ `announcements:purge-expired`（毎日6:00 JST・`PurgeExpiredAnnouncements` コマンド）で削除
- admin が `/admin/announcements` で作成・編集・削除・並び替え（`POST /admin/announcements/reorder`）

### 10. 管理機能（editor / admin）
- アイテム一覧・検索・確認済みフラグ管理（**「装備品」「テクニック」タブで切り替え**。各タブに未確認件数バッジ）
- **「装備セットを展開表示」チェックボックス（装備品タブのみ・デフォルトOFF）**: OFF はセット本体のみ表示して構成部位アイテム（`equipment_set_members` で紐付く piece）を隠し、ON は構成部位を表示してセット本体を隠す。セットに属さない通常アイテムは常に表示。すべて/未確認/確認済みの件数も表示中のアイテムに連動
- 装備セット本体の行は、追加効果列に**構成部位のアイコン（部位カテゴリ名チップ・ホバーで部位アイテム名）**を表示する。セット本体自身の `base_stats` は旧データのため表示しない（部位ごとの性能が正）
- アイテム編集（装備品: 追加効果・付加効果・特殊条件・染色 / スキル: 必要スキル値・必要マスタリ）
- **行操作はアイコンボタン**（相場登録・編集・コピー・削除。`title` / `aria-label` にラベルを設定）。相場登録・削除は admin のみ、編集・コピーは editor 以上（編集のみ、一般ユーザーも「自分が登録・未確認・staff未編集」のアイテムは可）
- **コピーして編集（editor / admin）**: 行のコピーアイコンで**名前変更ダイアログ**を開き、「文字置換（置換対象→置換後。**「+ 置換を追加」で行を増やして複数指定でき、上から順に適用**。2行目以降は×で削除可）・末尾に追加」を入力できる（すべて任意。コピー後のセット名・各部位アイテム名をプレビュー表示）。確定すると `/admin/items/new?copy=<id>` を開き（名前変更は navigation state の `copyRename` で受け渡し）、コピー元の入力内容（基本情報・追加/付加効果・装備セット部位構成・アセット情報など）を複製した新規作成フォーム（見出し「アイテムをコピーして追加」）を表示。名前変更はアイテム名（セット名）と装備セットの各部位アイテム名の両方に適用する（各置換は出現箇所すべて。`frontend/src/utils/copyRename.ts` の `applyCopyRename`）。装備セット部位・付加効果の既存IDと確認状態は引き継がず、保存時は新規アイテムとして登録する（専用APIは無く `POST /api/items` を使用）
- **staff排他ロック（`items.locked_by_staff`）**: editor / admin が編集・確認したアイテムは `locked_by_staff = true` になり、**登録者（一般ユーザー）が上書き編集できなくなる**（編集競合の防止）。一般ユーザーが編集できるのは「自分が登録・未確認・staff未編集」のアイテムのみ
- **アイテム統合（merge・admin）**: 誤字等で重複登録されたアイテムを統合先へ付け替え（`POST /api/items/:id/merge`）。出品・買取・取引履歴・相場・装備セット構成を移し、元アイテムを削除
- **付加効果の項目名候補マスタ（`bonus_value_labels`・editor/admin）**: 登録フォームの datalist・一覧の絞り込み候補に出す項目名を `/admin/bonus-value-labels` で管理（追加・並び替え・編集・削除）。アイテム登録時に未登録ラベルは自動追加
- 未確認アイテムの確認操作（行に「確認済みにする」ボタン）
- 確認済みアイテムは「相場登録」アイコンから他サイト相場を手動登録（前述「価格データ解析」）
- **アイテム削除（admin）**: 出品・取引履歴と紐づく場合は禁止せず、件数入りの**確認モーダル**を表示。承諾すると関連する出品・取引チャット・取引履歴ごと削除する（確認は `window.confirm` ではなく状態駆動のモーダルで実装。タブ非アクティブ時のダイアログ抑制を回避）
- **admin限定**: ユーザー管理（権限変更・利用停止・解除）

### 10-B. SNS宣伝（宣伝ポスト・admin限定）
X（旧Twitter）への日次宣伝用に、指定日（JST・デフォルト当日）の
**「本日出品のアイテム」「本日の新規買取」「本日の取引件数」** をまとめたツイート文面を自動生成する。
- 画面: `/admin/promo-tweets`（ヘッダー管理メニュー「宣伝ポスト」・admin限定）。日付選択・文面プレビュー・文字数表示付き
- **単日／期間（累計）の切り替え**: 登録数が少ない日は期間指定（from〜to）でまとめて宣伝できる。
  期間モードでは日付表示が「6/8〜6/12」になり、取引件数の見出しが【期間中の取引成立数】に切り替わる
- **文面フォーマット**: 出品・買取は【新規の取引】見出しの下に1つのリストとして「売)アイテム名 価格」「買)アイテム名 価格」の行で並べる
  （出品→買取の順）。両方0件のときは「新着の出品・買取はなし」。見出しがツイート末尾に孤立しないよう調整
- ハッシュタグは `#MasterofEpic #MoETrade`（`PromoTweetComposer::HASHTAGS`）
- **投稿はX APIを使わない**（無料枠が2026年2月に廃止されたため）。各文面の「Xでポスト」ボタンが
  Web Intent（`https://x.com/intent/post?text=...`）で投稿画面を開き、管理者が内容確認のうえ手動で投稿する（未認証アカウント・無料で運用可能）
- **文字数制限と自動分割**: 未認証アカウントの上限（重み280＝全角140字相当。CJK=2・半角英数=1・URL=23換算）に収まるよう、
  アイテムが多い場合は複数ツイートへ自動分割し**全アイテムを漏れなく掲載**する
  - 2通目以降は**1通目への返信として投稿する前提**（スレッド化）。サイトURLは1通目にのみ付け、ハッシュタグは全ツイートに付ける
  - 続きがあるツイートは本文末尾に「...続く」を付け、続きツイートの先頭は「（続き）」の行のみ（見出しの再掲はしない）
  - セクション見出しがツイート末尾に孤立しないよう調整
- 集計仕様: 出品・買取は対象日（JST）に作成されたもの（取り下げ済み `cancelled` は除外）。
  同一アイテム・同一価格は「×N」に集約（一括出品対策）。取引件数は `trade_history` の有効分（`is_valid = true`）のみ
- 文面にはアイテム名・価格のみ掲載し、**出品者のユーザー情報は含めない**
- 実装: 文面生成は純粋クラス `App\Support\PromoTweetComposer`（ユニットテスト対象）、
  集計は `PromoTweetController`（`GET /api/admin/promo-tweets`）

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

### レイアウト・ブランド表示（ヘッダー / フッター / 背景 / バナー）
- **ヘッダーロゴ**: 画像ロゴ `public/img/logo_header.png`（高さ40px・クリックでトップへ）。元画像 `public/img/logo.png`（透過PNG）からの縮小版で、差し替え時は縮小版を再生成する
- **ヘッダー「管理」ドロップダウン**（デスクトップナビ・lg以上）: 「管理」ボタンで開閉トグル。開いている間はメニュー外での `mousedown` で自動的に閉じる（メニュー内・ボタン上のクリックでは閉じない）
- **ファビコン**: `public/img/favicon.jpg`（`index.html` から参照）
- **OGP / Twitter Card**: `frontend/index.html` の `<head>` に静的メタタグを定義（SPAだがクローラーはJSを実行しないため、ビルド成果物の HTML に直接含める）。
  - `og:title` / `og:description` / `og:url` / `og:site_name` / `og:type=website` / `og:locale=ja_JP` と `twitter:card=summary_large_image` ＋ `meta name="description"`
  - サムネイル画像は `public/img/site_ogp.jpg`（**1227×637 JPEG・ほぼ2:1**、サイト画面のスクリーンショット）。`og:image` / `twitter:image` は **絶対URL**（`https://moe-trade.sakuraweb.com/img/site_ogp.jpg`）で指定する（相対URLだとX等のクローラーが解決できない）。画像を差し替えたら `og:image:width` / `og:image:height` も実寸に合わせて更新する
  - 回帰防止テスト: `backend/tests/Unit/FrontendOgpMetaTest.php`（`frontend/index.html` に必須タグ・絶対URLが含まれることを検証）
- **背景画像**: 全ページ共通で `public/img/castle.jpg` を表示。`body::before`（`position: fixed`）に「ダークオーバーレイ（surface色 72%）＋ cover配置」で敷く（`background-attachment: fixed` がiOSで効かないための擬似要素方式）。フォールバック背景色は `html` 側に置く
- **フッター**: `position: fixed` で画面下部に常時表示（著作権表記＋公式サイトリンク）。コンテンツ側はフッター高さぶんの下余白（`pb-24 / sm:pb-20 / min-[1150px]:pb-16`）で逃がし、右下のヘルプボタンも同じ刻みで上にずらす
- **フッターバナー**: 768px（md）以上で `public/img/banner/` の5種からランダムに1つをフッター右端に表示し、公式サイト（moepic.com）へ新規タブでリンク。著作権表記はバナーを除いた残り幅の中で中央寄せ
- **サイドバナー**: 全ページ共通で、本文の左右余白に `public/img/side_banner/` のバナーを縦中央固定表示し、公式サイトへリンク。左=`moe_h_01.gif`（幅120px）、右=`moe_h_02.gif`（幅160px）。本文幅はページごとに異なる（max-w-sm〜max-w-7xl）ため固定の画面幅閾値ではなく、`main` 内の本文コンテナ（`max-w-*` 要素）の左右余白を実測し「バナー幅＋35px」以上空いている側だけ表示（リサイズ・ルート遷移・`main` のサイズ変化で再判定）。余白が足りない間は狭い左バナーのみ→両方の順に段階表示（max-w-7xl のページでは従来どおり左1590px/右1670px相当）
- **出品一覧の絞り込みパネル**: どの画面幅でもヘッダークリックで開閉できる。lg（1024px）未満は上下方向に折りたたみ（初期状態は閉）、lg以上は横方向に折りたたみ（初期状態は開。畳むと280pxのサイドバーが44pxの縦書きバーになり一覧が広がる）
- **出品一覧テーブルの列数**: ビューポートではなく、テーブルを囲むコンテナの実幅（絞り込みサイドバーの開閉で変動）をCSSコンテナクエリで判定する。**コンテナ幅850px以下**で詳細列（追加効果/付加効果/特殊条件/取引 等）を隠して「アイテム・価格・操作」の3列に減らし、操作列も「相場情報」→「詳細 →」リンクに切り替える

### SEO（検索エンジン対応）
Google等でアイテム名を検索したとき、出品中・買取中のアイテムページがヒットするようにする。

- **サイトマップ**: `GET /sitemap.xml`（`SitemapController`・Laravel `routes/web.php`）が動的生成。
  一覧ページ（`/listings` `/skills` `/assets` `/buy-requests`）＋ **`status=active` の出品・買取の詳細URL**（`lastmod`=`updated_at`）を列挙する。
  取り下げ・期限切れ・成立済みは含めない（詳細APIが404を返すページをクローラーに渡さない）。
  URLのベースは `config('app.frontend_url')`（`FRONTEND_URL`）
- **robots.txt**: `frontend/public/robots.txt`（静的ファイル）。`Sitemap:` で本番絶対URLを宣言し、
  ログイン必須・管理系（`/admin` `/mypage` `/auth/` `/board`）のみ Disallow。出品・買取ページはクロール許可
- **ページごとの `<title>` / meta description**: `frontend/src/hooks/usePageMeta.ts`。
  GooglebotはJSレンダリング後のタイトルをインデックスに使うため、SPAのままクライアント側で設定する。
  - 出品詳細: 「`<アイテム名>` の出品 | MoE Trade」／買取詳細: 「`<アイテム名>` の買取 | MoE Trade」（データ取得後に確定）
  - 出品一覧（装備品/スキル/アセット別）・買取一覧にも固有タイトルを設定。アンマウント時は既定タイトルに戻す
- **ルーティング**: `/sitemap.xml` は本番 `.htaccess`（`deploy/public.htaccess`）・開発 nginx（`docker/nginx/default.conf`）とも Laravel に振り分ける（SPAフォールバックさせない）
- 回帰防止テスト: `backend/tests/Feature/SitemapTest.php` / `backend/tests/Unit/RobotsTxtTest.php` / `frontend/src/hooks/usePageMeta.test.tsx`
- ※ OGP（SNSカード）は上記「レイアウト・ブランド表示」の静的メタタグ方式のまま（SNSクローラーはJSを実行しないため）

### コード分割（バンドルの遅延読み込み）
- recharts を含む価格解析チャートは `components/PriceAnalyticsAsync.tsx`（`React.lazy` ラッパー）経由で読み込む。
  チャートを表示する側は `PriceAnalytics` を直接 import せず、必ずこのラッパーを使う（直接 import すると分割が無効になる）
- 管理画面6ページ（`/admin/*`）は `App.tsx` で `React.lazy` によるルート単位の遅延読み込み。
  `<Routes>` 全体を `<Suspense fallback={<Spinner center />}>` で包み、チャンク取得中はスピナーを表示する
- 効果: 初回バンドル 904KB（gzip 253KB）→ 458KB（gzip 132KB）。recharts は「相場情報」等で初めてチャートを開いたときに取得される

### 出品一覧のタブとルーティング
- `/listings`（装備品）・`/skills`（テクニック）・`/assets`（アセット）は同一の `ListingsPage` コンポーネントを `mode` プロップ（`'equipment' | 'skill' | 'asset'`）で切り替える
- ルートごとに React の `key`（`"equipment"` / `"skill"` / `"asset"`）を付与し、タブ切り替え時に確実に再マウントさせる（検索パラメータやフィルター状態が古いまま残らないようにするため）
- 種別は検索パラメータ `item_type`（`equipment` / `technique` / `asset`）でバックエンドに渡す。旧 `is_skill` パラメータも後方互換で受け付ける（`is_skill=1`→テクニック、`is_skill=0`→装備品）
- 種別判定はアイテムの「最上位カテゴリ名」で行う：`テクニック`→テクニック、`アセット`→アセット、それ以外→装備品。フロントは `frontend/src/utils/itemType.ts` の `itemTypeOf()` に集約

### 操作案内ツアー（初回ガイド）
- 主要ページ（出品一覧 / 新規出品 / 一括出品 / 出品詳細 / マイページ / 新規登録）で、対象要素をスポットライトしながら順に説明する吹き出しツアーを表示する
- 実装: 案内文・対象・順番は `frontend/src/tours/content.ts` に集約（`data-tour` 属性で対象指定）。表示制御は `tours/TourContext.tsx`、描画は `components/TourOverlay.tsx`
- 初回自動表示: ページ初訪問時に自動開始し、既読は `localStorage`（`moe_tour_seen:<pageId>:v<version>`）で管理。内容更新時は `version` を上げると全員に再表示される。マイページから既読リセット可
- **表示されていない要素のステップは自動スキップ**:
  - 対象セレクタの要素が DOM に存在しない場合は描画待ち（900ms）の後にスキップ
  - DOM に存在しても CSS で非表示の場合（スマホ幅・コンテナクエリで隠れる列、`display:none` / `visibility:hidden` / ゼロサイズ）は即スキップ
  - 「戻る」操作で非表示ステップに入った場合は前方向へスキップし、先頭まで達したら前進に切り替える（行き止まり防止）
  - ステップカウンター（`n / N`）は表示できるステップだけで数え直す（スキップ対象は番号・総数に含めず、番号が飛ばない）。最後に表示できるステップで「完了」ボタンになる

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
├── /buy-requests             # 買取（買いたい）一覧・検索
│   └── /buy-requests/:id     # 買取詳細（価格解析・売却申し出）
├── /buy-requests/new         # 買取登録フォーム
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
│   ├── /admin/users          # ユーザー管理（admin限定）
│   ├── /admin/announcements  # お知らせ管理（admin限定）
│   ├── /admin/promo-tweets   # 宣伝ポスト（X向け文面生成・admin限定）
│   └── /admin/bonus-value-labels # 付加効果の項目名候補マスタ管理（editor/admin）
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
- 詳細（出品/買取共通の `EquipmentSetBreakdown`）のセット内訳も、性能（追加効果・付加効果・特殊条件・ミスリル）が
  すべて同一の部位を1カードにまとめ、部位チップ＋名前を並べて効果は1回だけ表示する（`groupPiecesByPerformance`）。
- セット本体アイテム自体に登録された追加効果・付加効果・特殊条件は**旧データのため詳細では表示しない**
  （部位ごとの性能のみを正とする。出品/買取詳細とも `!item.is_equipment_set` でセクションごと非表示）。
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
以下の定義順がセレクトボックス等の選択肢の表示順（`BASE_STAT_LABELS` のキー順。後述の入力欄3列構成の1列目→2列目→3列目と同順）。

| パラメータ名 | キー |
|---|---|
| 最大HP | `max_hp` |
| 最大ST | `max_st` |
| 最大MP | `max_mp` |
| 移動速度 | `move_speed` |
| 最大重量 | `max_weight` |
| 攻撃ディレイ | `atk_delay` |
| 魔法ディレイ | `mag_delay` |
| 攻撃力 | `atk` |
| 防御力 | `def` |
| 命中 | `hit` |
| 回避 | `eva` |
| 魔力 | `mag` |
| 耐火属性 | `res_fire` |
| 耐水属性 | `res_water` |
| 耐地属性 | `res_earth` |
| 耐風属性 | `res_wind` |
| 耐無属性 | `res_none` |

→ `items.base_stats` カラムにJSONで保持。よく検索される項目はGenerated Column + Indexで高速化。

**数値の表示**: 追加効果・付加効果の数値は、負数（`-` 付き）以外には `+` を付けて表示する
（`formatSignedValue`。例: `5` → `+5`、`-3` → `-3`）。ただし倍率（`value_unit === 'x'`）は増減ではないため
`+` を付けない（例: `1.5倍`）。出品/買取の一覧・詳細・セット内訳・アイテム管理の
表示箇所すべてに適用する（登録・編集フォームの入力欄は対象外）。

登録・編集フォーム（新規アイテム登録 / アイテム編集 / 装備セット部位エディタ）の追加効果入力欄は、
ゲーム内のステータス表示に合わせた3列構成で表示する（`STAT_INPUT_COLUMNS`。各列を上から順に表示）:

| 列1 | 列2 | 列3 |
|---|---|---|
| 最大HP | 攻撃力 | 耐火属性 |
| 最大ST | 防御力 | 耐水属性 |
| 最大MP | 命中 | 耐地属性 |
| 移動速度 | 回避 | 耐風属性 |
| 最大重量 | 魔力 | 耐無属性 |
| 攻撃ディレイ | | |
| 魔法ディレイ | | |

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

### 必要マスタリ（スキル種別）
テクニックの中には、特定の**マスタリ**（構成スキルを全て40取得すると発動する効果）を発動条件とするものがある。
- `items.mastery_requirements` に**マスタリコードの配列**で保持（例: `["WAR", "ALC"]`）
- マスタリ定義（コード→表示名・構成スキル）はバックエンド `App\Support\Mastery::ALL`、フロントは `frontend/src/utils/constants.ts` に持ち、構成スキル名は `SKILL_GROUPS` と完全一致させる
- テクニックタブの絞り込みは2モード（`skill_match` パラメータ）:
  - `normal`（既定）: 指定スキルを必要スキルに含む。`skill_include_mastery=true` で「そのスキルを構成に含むマスタリを必要とするテクニック」も対象に含める（範囲が40を許容する場合）
  - `composition`（構成検索）: アイテムの必要スキル＋必要マスタリの構成スキルが、すべて選択スキルに含まれる（部分集合）テクニックを表示

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
| is_default | BOOLEAN | 出品・買取登録時に取引可能サーバーを既定チェックするためのデフォルトキャラ（1ユーザー最大1件 true・アプリ側で排他制御） |
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
| mastery_requirements | JSON | テクニックの必要マスタリコード配列（例: ["WAR","ALC"]）。NULL = 無し |
| placement | VARCHAR(20) | アセット: 設置個所（床/壁/天井）。NULL = 非アセット |
| asset_width | SMALLINT | アセット: サイズ（横マス数）。NULL = 非アセット |
| asset_height | SMALLINT | アセット: サイズ（縦マス数）。NULL = 非アセット |
| storage_count | INT | アセット: ストレージ数。NULL = 非アセット |
| special_function | VARCHAR(30) | アセット: 特殊機能（販売員/銀行/タイプカプセル/栽培/生産施設/カタログ）。NULL = 非アセット |
| verified_status | ENUM('unverified','verified') | 確認状態（デフォルト: unverified） |
| submitted_by | BIGINT FK(users) | 登録者（ユーザーが登録した場合に記録） |
| verified_by | BIGINT FK(users) | 確認者（admin/editor） |
| verified_at | TIMESTAMP | 確認日時 |
| locked_by_staff | BOOLEAN | editor/admin が編集・確認すると true。登録者（一般ユーザー）の上書き編集を禁止（排他制御。デフォルト false） |
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
| listing_id | BIGINT FK nullable | 出品チャットのとき設定（買取チャットでは NULL） |
| buy_request_id | BIGINT FK nullable | 買取チャットのとき設定（出品チャットでは NULL）。`listing_id` と相互排他 |
| buyer_id | BIGINT FK(users) | 取引希望を送ってきた相手側（出品=買い手 / 買取=売り手） |
| server | ENUM('Emerald','Diamond','Pearl') | 取引希望サーバー |
| request_ip | VARCHAR(45) | 取引希望を送信したときのIP（相場の同一人物判定に使用） |
| status | ENUM('open','deal','declined','deal_failed') | 交渉中 / 取引成立 / 見送り / 取引不成立（不成立は編集不可） |
| seller_completed | BOOLEAN | 登録者(owner)側の取引完了確認（デフォルト false） |
| buyer_completed | BOOLEAN | 相手側の取引完了確認（デフォルト false） |
| created_at / updated_at | TIMESTAMP | |

- 出品(listing)・買取(buy_request)の双方に紐づく（どちらか一方が必ずセット）。`owner` = 取引対象の登録者、`buyer_id` = 取引希望を送ってきた相手側
- 「取引成立」で取引対象が `completed` になり、同じ取引対象の他チャット（open）はメッセージ送信不可になる
- 取引成立時に `trade_history` へ記録。双方の完了確認は `seller_completed`（owner）/ `buyer_completed`（相手側）で管理
- 希望時間帯・備考は取引希望時の最初のメッセージとして送信（カラムなし）
- 先着順の順番待ち（前述「順番待ち（先着順キュー）」）は status・created_at から動的に算出（専用カラムは持たない）

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
| listing_id | BIGINT FK nullable | 出品由来のとき設定（買取由来では NULL） |
| buy_request_id | BIGINT FK nullable | 買取由来のとき設定（出品由来では NULL） |
| item_id | BIGINT FK | |
| seller_id | BIGINT FK(users) | 売り手のユーザーID |
| buyer_id | BIGINT FK(users) nullable | 買い手のユーザーID（IPではなく user_id で当事者を紐づける） |
| seller_ip | VARCHAR(45) | 売り手側のIP |
| buyer_ip | VARCHAR(45) | 買い手側のIP |
| price | INT | 取引価格（交渉可で成立価格が指定された場合はその値） |
| currency | VARCHAR(10) | |
| server | ENUM('Emerald','Diamond','Pearl') | 取引サーバー |
| is_valid | BOOLEAN | 相場データとして有効か（デフォルトtrue）。同一IP取引は false（`TREAT_ALL_TRADES_VALID=true` のときは常に有効扱い） |
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
| admin_only | BOOLEAN | 管理者限定スレッド（true は admin のみ閲覧・投稿可。デフォルト false） |
| created_at / updated_at | TIMESTAMP | updated_at を最終アクティブ日時として一覧ソートに使用 |

### board_posts（運営掲示板投稿）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| thread_id | BIGINT FK(board_threads) | cascade削除 |
| user_id | BIGINT FK(users) | 投稿者（cascade削除） |
| message | TEXT | 本文（最大5000文字） |
| image_path | VARCHAR(255) | 添付画像のパス（public ディスク相対パス。NULL = 画像なし） |
| created_at / updated_at | TIMESTAMP | |

### buy_requests（買取・買いたい登録）
`listings` とほぼ対称。登録者(`user_id`)は買い手を表す。`is_worn`（削れあり）は持たない。

| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK(users) | 買取登録者（買い手・cascade削除） |
| item_id | BIGINT FK(items) | |
| price | INT | 買取希望価格（AC） |
| currency | VARCHAR(10) | 固定値: AC |
| quantity | INT | 数量（デフォルト 1） |
| trade_type | ENUM('fixed','negotiable') | 取引方法（即決 / 交渉可） |
| comment | TEXT | コメント |
| status | ENUM('active','expired','cancelled','completed','deal_failed') | 状態 |
| expires_at | TIMESTAMP | 期限（作成から**1ヶ月**後） |
| created_at / updated_at | TIMESTAMP | |

### buy_request_servers（買取の取引可能サーバー）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| buy_request_id | BIGINT FK(buy_requests) | cascade削除 |
| server | ENUM('Emerald','Diamond','Pearl') | |
| character_id | BIGINT FK(user_characters) | 連絡先キャラ（`ON DELETE SET NULL`） |

- UNIQUE制約: `(buy_request_id, server)`。連絡先キャラ名は `listing_servers` と同様に登録者の現在のキャラから動的解決

### announcements（お知らせ・サイト上部バナー）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| message | TEXT | 本文 |
| level | VARCHAR(20) | 表示色（info=青 / warning=黄 / error=赤・デフォルト warning） |
| link_url | VARCHAR(500) | 任意リンクURL |
| link_label | VARCHAR(100) | 任意リンク表示名 |
| is_active | BOOLEAN | 表示中フラグ（デフォルト true） |
| display_days | INT UNSIGNED | 表示日数（NULL = 無期限） |
| expires_at | TIMESTAMP | 表示終了日時（created_at + display_days。NULL = 無期限。index 付き） |
| sort_order | INT | パネル表示順 |
| created_at / updated_at | TIMESTAMP | |

### bonus_value_labels（付加効果の項目名候補マスタ）
| カラム | 型 | 説明 |
|---|---|---|
| id | BIGINT PK | |
| label | VARCHAR(100) UNIQUE | 項目名（例: 物理ダメージ） |
| sort_order | INT UNSIGNED | 表示順 |
| created_at / updated_at | TIMESTAMP | |

- アイテム登録フォームの datalist・一覧の絞り込み候補に使用。アイテム登録時に未登録ラベルは自動追加（`BonusValueLabel::syncFromBonusEffects()`）

---

## APIエンドポイント（Laravel）

### SEO（`/api` プレフィックスなし・`routes/web.php`）
- `GET /sitemap.xml` — 検索エンジン向けサイトマップ（認証不要）。一覧ページ＋ `active` な出品・買取の詳細URLを動的生成（詳細は「共通UX仕様 > SEO」参照）

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
- `GET  /api/items` — 一覧・検索（ページネーション。`per_page` は 1〜200 で指定可・既定 50。フロントの `itemsApi.list` は `last_page` まで全ページを辿って結合するため、呼び出し側には常に全件が渡る）
- `GET  /api/items/:id` — 詳細
- `POST /api/items` — 登録（全ログインユーザー。unverified で作成。`skill_requirements` および アセット項目 `placement` / `asset_width` / `asset_height` / `storage_count` / `special_function` 対応）
- `POST /api/items/match` — アイテム名（`names[]`）をまとめて登録済みアイテムと照合（完全一致＋末尾「...」「…」は前方一致）。一括出品で使用
- `PUT  /api/items/:id` — 編集（editor/admin、または本人は unverified 期間のみ）
- `POST /api/items/:id/verify` — 確認済みにする（editor/admin）
- `POST /api/items/:id/market-prices` — 他サイト相場の手動登録（**admin限定**。`price` / `server` / `traded_at` / `note`）
- `POST /api/items/:id/merge` — 重複登録アイテムの統合（admin。`target_id` へ出品・買取・取引履歴・相場・装備セット構成を付け替えて元アイテムを削除）
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
- `POST /api/chats/:id/deal` — 取引成立（取引対象を completed に変更し取引履歴を記録。交渉可は `final_price` で成立価格を指定可）
- `POST /api/chats/:id/complete` — 取引完了確認（登録者(owner)／相手側それぞれが実行）
- `POST /api/chats/:id/deal-failed` — 取引不成立（取引対象を `deal_failed` に変更し、成立時の取引履歴を削除。`relist: true` で同内容の再出品/再買取を作成。順番待ちが残る場合は次へ進む）
- `POST /api/chats/:id/decline` — 見送り
- `POST /api/chats/:id/reopen` — 再オープン

### 買取（買いたい）
- `GET    /api/buy-requests` — 一覧・検索（アイテム名のみ。`item_name` 部分一致 / `item_names[]` 複数・末尾省略は前方一致）
- `GET    /api/buy-requests/:id` — 詳細（公開対象 `active` / `completed` のみ。それ以外は 404）
- `POST   /api/buy-requests` — 登録（要ログイン・メール認証済み。期限1ヶ月）
- `PUT    /api/buy-requests/:id` — 編集（本人/admin・`BuyRequestPolicy`）
- `DELETE /api/buy-requests/:id` — 取り下げ（本人/admin）
- `POST   /api/buy-requests/:id/renew` — 期限を1ヶ月延長
- `GET    /api/buy-requests/:id/chats` — 届いたチャット一覧（登録者のみ）
- `POST   /api/buy-requests/:id/chats` — 売却を申し出る（相手側＝売り手がチャット作成）

### マイページ
- `GET /api/mypage/listings` — 自分の出品一覧
- `GET /api/mypage/chats` — 自分が取引希望者の（出品由来）チャット一覧
- `GET /api/mypage/selling-chats` — 自分の出品に対するチャット一覧（`listing_id` でグループ化・順番待ち付与）
- `GET /api/mypage/buy-requests` — 自分の買取一覧
- `GET /api/mypage/buy-request-chats` — 自分の買取に届いたチャット一覧（`buy_request_id` でグループ化）
- `GET /api/mypage/selling-offers` — 自分が売り手として申し出た（買取由来）チャット一覧
- `GET /api/mypage/item-counts` — 自分のアクティブ出品・買取の件数（item_id ごと。登録時の重複案内に使用）

### 運営掲示板（要ログイン）
- `GET   /api/board/threads` — スレッド一覧（最終アクティブ順・30件ページネーション）
- `POST  /api/board/threads` — スレッド作成（`title` / `message`）
- `GET   /api/board/threads/:id` — スレッド詳細（投稿一覧含む）
- `POST  /api/board/threads/:id/posts` — 投稿追加（本文か画像が必須）
- `PUT   /api/board/posts/:id` — 投稿の編集（本人のみ。画像差し替え・削除可）
- `PATCH /api/board/threads/:id/status` — ステータス変更（admin）
- `PATCH /api/board/threads/:id/visibility` — 公開範囲変更（admin。`admin_only`）
- `DELETE /api/board/threads/:id` — スレッド削除（admin）
- `DELETE /api/board/posts/:id` — 投稿削除（admin）

### お知らせ
- `GET  /api/announcements` — 表示中のお知らせ一覧（**認証不要**）
- `GET  /api/admin/announcements` — 全件（admin）
- `POST /api/admin/announcements` — 作成（admin）
- `PUT  /api/admin/announcements/:id` — 編集（admin）
- `DELETE /api/admin/announcements/:id` — 削除（admin）
- `POST /api/admin/announcements/reorder` — 並び替え（admin）

### 付加効果の項目名候補マスタ（editor / admin）
- `GET    /api/admin/bonus-value-labels` — 一覧
- `POST   /api/admin/bonus-value-labels` — 追加
- `POST   /api/admin/bonus-value-labels/reorder` — 並び替え
- `PUT    /api/admin/bonus-value-labels/:id` — 編集
- `DELETE /api/admin/bonus-value-labels/:id` — 削除
- （公開）`GET /api/bonus-value-labels` — 候補一覧（フォーム・絞り込み用）

### SNS宣伝（admin限定）
- `GET /api/admin/promo-tweets` — 宣伝ツイート文面の生成。単日は `date`（`Y-m-d`・JST・省略時は当日）、
  期間累計は `from`＋`to`（ペア必須・`from <= to`）で指定。対象期間の新規出品・新規買取・取引成立件数（有効分のみ）を集計し、
  文字数制限内に分割済みの `tweets[]`（`text` / `length` / `limit`）と件数サマリー・`mode`（`day` / `range`）を返す

### ユーザー管理（admin限定）
ルートは `role:admin` ミドルウェア。
- `GET /api/admin/users` — ユーザー一覧（`characters` を含めて全件返却）
- `PUT /api/admin/users/:id/role` — 権限変更
- `POST /api/admin/users/:id/suspend` — 利用停止
- `POST /api/admin/users/:id/unsuspend` — 停止解除
- `POST /api/admin/users/:id/verify` — メール認証を手動で完了にする（メール送信失敗時の救済）

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
- `trade_history` に当事者を `seller_id` / `buyer_id`（user_id）で記録し、`seller_ip` / `buyer_ip` も併せて保持
- 取引希望を送信したときのIP（`trade_chats.request_ip`）と、取引成立を操作したときのIP（リクエストIP）が一致する場合、`is_valid = false` として相場（統計・グラフ）に反映しない
- 無効分も価格解析画面の取引一覧には表示され、「相場対象外」バッジで区別される
- **`TREAT_ALL_TRADES_VALID=true`（環境変数）のときは相場対象外にしない**: 取引成立時の `is_valid` を常に true で記録し、価格解析の集計・表示でも全件を有効として扱う（既存データも対象）。`APP_ENV` とは独立した設定で、既定は `false`（テストは既定値で実行されるためIP除外が有効）
- 他サイト相場（`market_prices`）は admin が登録した正規データとして常に有効扱い。価格解析では「他サイト」バッジで区別

### ④ 認証エンドポイントのレート制限
ブルートフォース・大量アカウント作成を抑止するため、認証系ルートにIP単位のスロットルを掛ける（アプリ全体には throttle を掛けていない）。
- `POST /api/auth/register`・`/api/auth/login`: `throttle:10,1`（10回/分）
- `POST /api/auth/forgot-password`・`/api/auth/reset-password`: `throttle:5,1`（5回/分）
- 加えて `forgot-password` は Laravel パスワードブローカーの再送スロットル（60秒）でも保護

### ⑤ SQLインジェクション対策（一覧検索）
出品/アイテム一覧の絞り込み・ソートでは、`base_stats` / `skill_requirements` のキーを JSON パスへ文字列補間する（プレースホルダにできない）。
- `base_stats` のキーはホワイトリスト（`App\Support\Stats::KEYS`）で検証し、未知のキーは無視する
- スキル名は `str_replace` で `"` / `\` を除去したうえでバインド渡し、数値はすべて `(float)` / `(int)` にキャストする
- これにより、リクエスト由来のキー・値からのインジェクションを防ぐ

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

ホスト公開ポートは環境変数で上書きできる（既定値は上表のとおり）。`NGINX_PORT` / `VITE_PORT` / `DB_PORT` / `PMA_PORT` / `MAILPIT_UI_PORT` / `MAILPIT_SMTP_PORT`。コンテナ内部ポートは固定で、サービス間通信（`php:9000` / `frontend:5173` / `db:3306`）はサービス名解決のためホストポートの変更に影響されない。main の作業ディレクトリではルートに `.env` を置かず既定値のまま使う。

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

### 平行開発（git worktree + 複数スタック同時起動）

複数の機能を同時に開発し、それぞれをブラウザで動作確認したい場合は、機能ごとに
git worktree（別フォルダ・別ブランチ）と独立した Docker スタックを立てる。

- `COMPOSE_PROJECT_NAME` でスタックを区別する。名前付きボリューム（`db_data` / `vendor_data` /
  `node_modules_data`）はこの名前で分離されるため、**worktree ごとに DB も完全に独立**する。
- 上記のポート環境変数をずらして、ホストポートの衝突を避ける。
- `backend/.env` は gitignore 対象で worktree には自動コピーされないため、別途生成する。
  別ポートでアクセスするので `APP_URL` / `FRONTEND_URL` / `SANCTUM_STATEFUL_DOMAINS` を
  その worktree の nginx ポートに合わせる（合わせないとログインの cookie 認証が成立しない）。

これらは `scripts/new-worktree.ps1` が自動化している。

```powershell
# 例: feat-chat ブランチを slot 1 で作成（nginx=8101 / vite=5174 / db=3307 ...）
pwsh scripts/new-worktree.ps1 -Branch feat-chat -Slot 1

cd ..\moe_trade-feat-chat
docker compose up -d
docker compose exec php php artisan migrate   # 初回のみ（DB は独立）
# → http://localhost:8101 で確認
```

スタックごとの設定値は worktree 直下の `.env`（compose 用、`.env.example` が雛形）に記録される。
片付けは `docker compose -p <project> down -v` でボリュームごと破棄し、`git worktree remove <path>`。

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
| `tests/Feature/ItemApiTest.php` | アイテムCRUD・unverified編集権限・verify(editor)・削除(admin)・スキル必要値・装備セット・統合 |
| `tests/Feature/ListingApiTest.php` | 出品CRUD・メール認証/停止チェック・種別/価格フィルター・renew・期限切れバッチ・**SQLi回帰（不正キー無視）** |
| `tests/Feature/ChatApiTest.php` | チャット作成・重複防止・成立/不成立/完了確認・相場IPチェック・未読数 |
| `tests/Feature/BuyRequestChatApiTest.php` | 買取の売却申し出・自己取引禁止・成立履歴・相場IPチェック |
| `tests/Feature/TradeQueueTest.php` | 順番待ち（先着順）・匿名化・成立/不成立/完了の繰り上がり・待ち人数 |
| `tests/Feature/NotificationApiTest.php` | 通知サマリー（未読チャット・掲示板新着・対象者判定） |
| `tests/Feature/BoardApiTest.php` | 掲示板スレッド/投稿・表示名・admin操作権限 |
| `tests/Feature/AdminUserApiTest.php` | ユーザー管理API・権限チェック |

> 既知の未カバー領域（今後追加推奨）: `GET /api/listings/:id` の公開制限(404)、アイテム削除の確認モーダル(409)/`force`連鎖削除、`items/:id/merge`、アセット種別の絞り込み、パスワード再設定の期限切れ・スロットル(429)。

実行方法:
```bash
# ローカル（Docker）
docker compose exec php php artisan test

# または
docker compose exec php vendor/bin/phpunit
```

### フロントエンド（Vitest + Testing Library）
- テストランナーは **Vitest**（`frontend/vitest.config.ts`・jsdom 環境・CSS 読み込みなし）。
  コンポーネントは @testing-library/react / user-event / jest-dom で検証する
- 共通セットアップは `frontend/src/test/setup.ts`（jest-dom マッチャ有効化＋各テスト後の DOM / localStorage クリーンアップ）
- テストファイルは対象の隣に `src/**/*.test.ts(x)` で配置（`tsc`（`npm run build`）の型チェック対象にも含まれる）
- 一括出品の貼り付け解析 `parsePaste` はテストのため `BulkListingPage.tsx` から export している

| テストファイル | 対象 |
|---|---|
| `src/utils/itemType.test.ts` | 種別判定（最上位カテゴリ名→ equipment / technique / asset）・親フォールバック |
| `src/utils/equipmentSet.test.ts` | 装備セット部位のグルーピング（追加効果・付加効果・性能全体、順序非依存・ミスリル差分） |
| `src/utils/constants.test.ts` | マスタ定数の design.md 整合（マスタリ構成スキルが SKILL_GROUPS と完全一致・特殊条件15種・追加効果キー17種＋セレクト表示順・追加効果入力欄の3列構成 `STAT_INPUT_COLUMNS`・アセット選択肢）・追加効果/付加効果数値の符号付き表示 `formatSignedValue`（負数以外は + 付き） |
| `src/pages/bulkListingParse.test.ts` | 一括出品の貼り付け解析（転送セル基準の相対位置・レンタル列有無・転送×／「空き」除外・カンマ個数・省略表記） |
| `src/pages/RegisterPage.test.tsx` | 利用規約同意フロー（モーダル自動表示・同意までボタン無効・同意しない→トップ遷移・パスワード不一致・登録成功/失敗） |
| `src/pages/ListingsPage.test.tsx` | 出品一覧のタブ・絞り込み（装備品/テクニック/アセットの `item_type` と列見出し切替、アイテム名・種別＋装備セットを含める・追加効果＋数値範囲・サーバー・取引方法・価格帯・削れあり・取引完了・ソート、必要スキル＋`skill_match`/マスタリ込み、アセットの設置個所/特殊機能/ストレージ、未ログイン時の「+ 出品する」「取引」非表示） |
| `src/components/TermsModal.test.tsx` | 規約モーダル（第1〜6条表示・同意/非同意コールバック） |
| `src/components/PriceAnalytics.test.tsx` | 価格解析（0埋め時の「—」表示・「相場対象外」「他サイト」バッジ・売り/買い相場タブ切替） |
| `src/api/client.test.ts` | 認証トークンの保存・取得・削除（localStorage） |
| `src/api/items.test.ts` | `itemsApi.list` の全ページ結合（複数ページ走査・1ページ完結・0件。1ページ目のみ取得で51件目以降が消える不具合の回帰防止） |
| `src/pages/admin/AdminItemsPage.test.tsx` | アイテム管理の「装備セットを展開表示」（OFF=セット本体のみ/ON=構成部位のみ・通常アイテムは常に表示・件数タブ連動・装備品タブ限定表示）・セット行の追加効果列の部位アイコン表示（旧base_stats非表示）・行操作アイコンの権限別表示（相場登録/削除=admin・編集/コピー=editor以上・一般ユーザーは自分の未確認のみ編集可・未ログインは非表示）・コピーの名前変更ダイアログ（セット名/各部位名のプレビュー・置換行の追加/削除と複数置換の順次適用・`?copy=<id>`＋`copyRename` state での遷移） |
| `src/pages/admin/AdminItemEditPage.test.tsx` | コピーして編集（`?copy=<id>` でコピー元を複製したフォーム表示・名前変更のアイテム名/各部位名への適用・確認状態は引き継がない・保存は create で新規登録・一般ユーザーは利用不可で一覧へ戻す） |
| `src/utils/copyRename.test.ts` | コピー時の名前変更 `applyCopyRename`（全出現箇所の置換・複数置換の順次適用・末尾追加・空欄/未指定時は変更なし） |

実行方法:
```bash
cd frontend && npm test        # 一括実行（vitest run）
cd frontend && npm run test:watch  # ウォッチ実行
```

### テスト整備時に修正した実装
- `ListingPolicy` を新設（`ListingController@update` の `authorize()` がポリシー未定義で常に403になっていた）
- `POST /api/items/:id/verify` に `role:editor`、`DELETE /api/items/:id` に `role:admin` ミドルウェアを追加（一般ユーザーでも実行できてしまっていた）

### セキュリティレビューでの修正
- **SQLインジェクション対策**: 一覧検索の `base_stats` キー（`base_stat_keys` / `base_stat_ranges` / `stat_*:` ソート / アイテム検索 `stats`）を `App\Support\Stats` のホワイトリストで検証し、未知キーを無視するよう修正（従来はリクエスト由来のキーを JSON パスへ直接補間していた）
- **レート制限**: 認証系ルート（register/login/forgot-password/reset-password）に `throttle` を追加
- **相場登録権限**: `POST /api/items/:id/market-prices` を `role:admin` に統一（design 旧版は editor を許可と誤記）

### CI（GitHub Actions）
`.github/workflows/ci.yml` — main への push / PR で自動実行。
- **backend-tests**: PHP 8.3 + composer install → PHPUnit（SQLiteインメモリ）
- **frontend-build**: Node 22 + npm ci → `tsc && vite build`（型チェック＋ビルド確認）→ `npm test`（Vitest 単体テスト）

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
- [x] バックエンドAPIテスト（PHPUnit・Feature/Unit・SQLiteインメモリ）
- [x] GitHub Actions CI（バックエンドテスト＋フロント型チェック・ビルド）
- [x] セキュリティ修正（SQLi対策・認証レート制限・相場登録のadmin限定）
- [x] フロントエンド単体テスト（Vitest + Testing Library・jsdom。種別判定／装備セット集約／マスタ定数整合／一括出品解析／利用規約同意フロー／価格解析表示／出品一覧のタブ・絞り込み）

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
- [x] **買取（買いたい）機能**: 出品と対称の登録・チャット・価格解析（売り相場/買い相場の分割）・期限1ヶ月（`buy_requests` / `buy_request_servers`・`/buy-requests`）
- [x] **取引希望の順番待ち（先着順キュー）**: 2番目以降の匿名化・先着強制・成立/不成立/完了での繰り上がり
- [x] **テクニックの必要マスタリ**（`items.mastery_requirements`）と構成検索（`skill_match=composition`・`skill_include_mastery`）
- [x] **お知らせバナー**（`announcements`・表示期間・日次削除バッチ・admin管理）
- [x] **掲示板の画像添付・投稿編集・管理者限定スレッド**（`board_posts.image_path` / `board_threads.admin_only`）
- [x] **staff排他ロック**（`items.locked_by_staff`）・**アイテム統合**（`items/:id/merge`）・**付加効果ラベルマスタ**（`bonus_value_labels`）
- [x] **デフォルトキャラ**（`user_characters.is_default`）

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
