// 公式サイトの所持アイテム一覧（タブ区切り）の貼り付けを解析する共通トークナイザ。
// 一括出品（BulkListingPage）と所持アイテム管理（OwnedItemsPage）で共有する。
//
// 列順は [レンタル] No アイテム名 カテゴリ 転送 個数 だが、レンタル列の有無に対応するため
// 「転送(○/×)」セルを基準に相対位置で各値を取得する。
//
// このトークナイザは「転送○/×」両方の行を rows に含める（転送状態は tenso に保持）。
// 出品できるのは転送○のみのため、一括出品側で × を除外する。所持品管理は所有の記録なので
// 転送×（トレード不可）も保持する。

/** 末尾が「...」または「…」で省略されたアイテム名か（照合は前方一致になる）。 */
const TRUNC_RE = /\s*(\.\.\.|…)\s*$/
export const isTruncatedName = (name: string): boolean => TRUNC_RE.test(name)
export const truncatedBase = (name: string): string => name.replace(TRUNC_RE, '').trim()

/** 転送不可（トレード不可）を表すセル文字列。 */
export const TRANSFER_NG = ['×', '✕', 'x']

/** 転送セルが「不可（×）」かどうか。 */
export function isTransferNg(tenso: string): boolean {
  return TRANSFER_NG.includes(tenso)
}

const TRANSFER_CELLS = ['○', '◯', '×', '✕', 'x']

export interface ItemBoxRow {
  no: string
  name: string
  category: string
  count: number
  /** 転送セルの値（'○' / '×' など）。 */
  tenso: string
}

export interface ItemBoxParseResult {
  /** 名前のある行（転送○/×の両方）。 */
  rows: ItemBoxRow[]
  /** 「空き」スロットのうち転送×のもの（一括出品では除外件数に数える）。 */
  emptyExcluded: number
  /** 「空き」スロットのうち転送×以外のもの（スキップ件数）。 */
  emptySkipped: number
  /** 転送セルが見つからずスキップした行数。 */
  noCellSkipped: number
}

/**
 * 貼り付けテキストを行ごとに解析する。
 * - ヘッダー行（'アイテム名' / 'No▼' / 'カテゴリ' を含む）と空行は読み飛ばす
 * - 転送セルが見つからない行はスキップ（noCellSkipped）
 * - 「空き」スロット・名前なしは rows に含めず、転送状態で emptyExcluded / emptySkipped に集計
 */
export function parseItemBox(text: string): ItemBoxParseResult {
  const lines = text.split(/\r?\n/)
  const rows: ItemBoxRow[] = []
  let emptyExcluded = 0
  let emptySkipped = 0
  let noCellSkipped = 0

  for (const line of lines) {
    if (!line.trim()) continue
    const cells = line.split('\t').map((c) => c.trim())

    // ヘッダー行
    if (cells.some((c) => c === 'アイテム名' || c === 'No▼' || c === 'カテゴリ')) continue

    // 転送列（○ / ×）を探す
    const tIdx = cells.findIndex((c) => TRANSFER_CELLS.includes(c))
    if (tIdx < 2) {
      noCellSkipped++
      continue
    }

    const tenso = cells[tIdx]
    const name = (cells[tIdx - 2] ?? '').trim()
    const category = (cells[tIdx - 1] ?? '').trim()
    const countRaw = (cells[tIdx + 1] ?? '').trim()
    const no = (cells[tIdx - 3] ?? cells[0] ?? '').trim()

    // 名前が無い／空きスロット
    if (!name || name === '空き') {
      if (isTransferNg(tenso)) emptyExcluded++
      else emptySkipped++
      continue
    }

    const count = Number(countRaw.replace(/,/g, '')) || 0
    rows.push({ no, name, category, count, tenso })
  }

  return { rows, emptyExcluded, emptySkipped, noCellSkipped }
}
