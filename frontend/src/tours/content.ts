// ============================================================
//  操作案内ツアーの「中身」だけをまとめたファイルです。
//  ★ 案内文・順番・対象要素は、基本ここだけ編集すれば変えられます。
//
//  - title : 吹き出しの見出し
//  - body  : 説明文（1〜2文くらいが読みやすいです）
//  - target: ハイライトする要素（各ページの data-tour="〇〇" を指定）
//            target を省略すると画面中央にカード表示します（導入用）。
//  - 内容を更新して全員に再表示したいときは、そのページの version を +1 してください。
// ============================================================

import type { PageTour } from './types'

// ---- ページごとのツアー定義 ------------------------------------------------
// キー（'listings' など）が pageId です。下の ROUTE_TO_PAGE_ID と対応します。

export const TOURS: Record<string, PageTour> = {
  // 出品一覧（/listings・/skills・/assets）
  listings: {
    pageId: 'listings',
    version: 1,
    steps: [
      {
        // 導入（中央表示）
        title: '出品一覧へようこそ',
        body: '基本的な使い方をご案内します。',
      },
      {
        target: '[data-tour="listings-modes"]',
        title: 'アイテムの種類を切り替え',
        body: '装備品・テクニック・アセットをここで切り替えられます。',
        placement: 'bottom',
      },
      {
        target: '[data-tour="listings-filter"]',
        title: '絞り込み検索',
        body: '追加効果：アイテム説明に記載されているステータス効果\n付加効果：バフの効果（バフ名ではなく効果内容）',
        placement: 'bottom',
        width: 400,
      },
      {
        target: '[data-tour="listings-actions"]',
        title: '自分も出品できます',
        body: '出品する : 1件ずつ\n一括出品 : マイページをコピペしてまとめて出品',
        placement: 'bottom',
        width: 350,
      },
      {
        target: '[data-tour="listings-itemname"]',
        title: 'アイテム名',
        body: '装備セット：カーソルをあてるとセット内容を確認できます。\n未確認 : アイテムの情報が不正確な場合があります。',
        placement: 'bottom',
        width: 450,
      },
      {
        target: '[data-tour="listings-tradetype"]',
        title: '取引方法',
        body: '即決 : 表示価格でそのまま取引\n交渉可 : 価格を相談しながら取引',
        placement: 'bottom',
        width: 340,
      },
      {
        target: '[data-tour="listings-trade"]',
        title: '取引を申し込む',
        body: '気になる出品の「取引」ボタンから取引を申し込めます。やり取りはマイページのチャットで行います。',
        placement: 'top',
      },
      {
        target: '[data-tour="listings-detail"]',
        title: '相場情報',
        body: '過去に成立した取引の価格情報を確認できます。',
        placement: 'top',
      },
    ],
  },

  // 一括出品（/listings/bulk）
  'listing-bulk': {
    pageId: 'listing-bulk',
    version: 1,
    steps: [
      {
        target: '[data-tour="bulk-paste"]',
        title: '一括出品',
        body: '公式マイページのアイテムボックスをコピーして、ここに貼り付け「読込」を押します。転送が×のアイテムは自動で除外されます。',
        placement: 'bottom',
        width: 400,
        image: '/tours/mypage_item.png',
        imageAlt: '公式マイページのアイテムボックス',
      },
      {
        target: '[data-tour="bulk-paste"]',
        title: '出品対象を選択',
        body: '登録済みのアイテムは自動で選択されます。\n新規登録ボタンが表示されている場合未登録のアイテムです。\n「...」で省略されているアイテムは、候補から検索して見つからなければ登録が必要になります。\n出品数を指定したアイテムのみ出品登録されます。',
        placement: 'bottom',
        width: 400,
        image: '/tours/bulk_list.png',
        imageAlt: '公式マイページのアイテムボックス',
      },
    ],
  },

  // 新規出品（/listings/new）
  'listing-new': {
    pageId: 'listing-new',
    version: 1,
    steps: [
      {
        target: '[data-tour="new-item"]',
        title: 'まずアイテムを選択',
        body: 'アイテム名で検索して、登録済みのアイテムを選択できます。\n未登録の場合は新規アイテムで登録してください。\n清書は管理者がしますが、個人で運営しているのでできるだけご協力をおねがいします！',
        placement: 'bottom',
        image: '/tours/new-listing-item.png',
        imageAlt: 'アイテム選択画面',
      },
      {
        target: '[data-tour="new-price"]',
        title: '価格・取引方法を入力',
        body: '希望価格や取引方法を入力します。家ageとの住み分けのため、Goldでの取引は不可とさせていただいています。',
        placement: 'top',
      },
      {
        target: '[data-tour="new-submit"]',
        title: '出品を確定',
        body: '出品後、数日経つと自動で出品取り下げになります。\n必要に応じてマイページから出品期間を更新してください。',
        placement: 'top',
      },
    ],
  },

  // 出品詳細（/listings/:id）
  'listing-detail': {
    pageId: 'listing-detail',
    version: 1,
    steps: [
      {
        target: '[data-tour="detail-info"]',
        title: 'アイテムの詳細',
        body: 'ステータスや価格、取引可能なサーバー・連絡先を確認できます。',
        placement: 'bottom',
      },
      {
        target: '[data-tour="detail-trade"]',
        title: '取引を申し込む',
        body: 'この出品者と取引したいときはここから申し込みます。やり取りはマイページのチャットで行います。',
        placement: 'top',
      },
    ],
  },

  // マイページ（/mypage）
  mypage: {
    pageId: 'mypage',
    version: 1,
    steps: [
      {
        target: '[data-tour="mypage-tab-listings"]',
        title: '出品中',
        body: '出品中・買取中では自分の登録した取引の管理ができます。\n一定期間で自動で取り下げになるので、必要に応じて延長してください。',
        placement: 'bottom',
        image: '/tours/mypage_sell_chat.png',
        imageAlt: '出品中タブ',
      },
      {
        target: '[data-tour="mypage-tab-listings"]',
        title: '取引チャット',
        body: '取引の希望が届くと、メッセージが送信できます。',
        placement: 'bottom',
        image: '/tours/trade_chat.png',
        imageAlt: '出品中タブ',
      },
      {
        target: '[data-tour="mypage-tab-listings"]',
        title: '取引成立',
        body: '取引が確定したら取引成立ボタンを押してください。\nもし取引成立後音信不通になったりした場合、再出品が可能です。',
        placement: 'bottom',
        image: '/tours/trade_chat_reject.png',
        imageAlt: '出品中タブ',
      },
      {
        target: '[data-tour="mypage-tab-buying"]',
        title: '取引希望',
        body: '自分が他の人の出品・買取に申し込んだ取引の進行状況を確認できます。',
        placement: 'bottom',
      },
    ],
  },
}

// ---- URL から pageId への対応表 --------------------------------------------
// 上の TOURS のキーと一致させてください。先に書いたものが優先されます。

export const ROUTE_TO_PAGE_ID: { test: (path: string) => boolean; pageId: string }[] = [
  { test: (p) => p === '/listings/new', pageId: 'listing-new' },
  { test: (p) => p === '/listings/bulk', pageId: 'listing-bulk' },
  { test: (p) => /^\/listings\/\d+$/.test(p), pageId: 'listing-detail' },
  { test: (p) => p === '/listings' || p === '/skills' || p === '/assets', pageId: 'listings' },
  { test: (p) => p === '/mypage', pageId: 'mypage' },
]

/** 現在のパスに対応する pageId を返す（無ければ null） */
export function pageIdForPath(path: string): string | null {
  const hit = ROUTE_TO_PAGE_ID.find((r) => r.test(path))
  return hit ? hit.pageId : null
}
