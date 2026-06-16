import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { buyRequestsApi } from '../api/buyRequests'
import { useAuth } from '../contexts/AuthContext'
import { usePageMeta, SITE_BRAND } from '../hooks/usePageMeta'
import BuyRequestCard from '../components/BuyRequestCard'
import type { BuyRequest, Paginated } from '../types'

/**
 * 貼り付けテキストからアイテム名だけを抽出する。
 *
 * 公式サイトの所持アイテム一覧（タブ区切り）にも、1行1アイテム名の単純な
 * リストにも対応する。タブ区切り行は「転送(○/×)」列の2つ左をアイテム名とみなす
 * （一括出品の解析と同じ考え方）。それ以外の行はトリムした文字列をそのまま名前とする。
 */
function parseNames(text: string): string[] {
  const names: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (line.includes('\t')) {
      const cells = line.split('\t').map((c) => c.trim())
      // ヘッダー行は除外
      if (cells.some((c) => c === 'アイテム名' || c === 'No▼' || c === 'カテゴリ')) continue
      const tIdx = cells.findIndex((c) => ['○', '◯', '×', '✕', 'x'].includes(c))
      const name = tIdx >= 2 ? cells[tIdx - 2] : cells.find((c) => c && !/^\d+$/.test(c)) ?? ''
      if (name && name !== '空き') names.push(name)
    } else {
      if (trimmed === 'アイテム名' || trimmed === '空き') continue
      names.push(trimmed)
    }
  }
  // 重複除去
  return Array.from(new Set(names))
}

export default function BuyRequestsPage() {
  usePageMeta(
    '買取一覧',
    `${SITE_BRAND}のアイテム買取（買いたい）一覧。買取中のアイテムを検索して取引チャットで売却できます。`
  )
  const { user } = useAuth()

  const [itemName, setItemName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  // 実際に適用中の絞り込み条件
  const [appliedName, setAppliedName] = useState('')
  const [appliedNames, setAppliedNames] = useState<string[]>([])
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<Paginated<BuyRequest> | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchList = useCallback(() => {
    setLoading(true)
    buyRequestsApi
      .list({
        item_name: appliedName || undefined,
        item_names: appliedNames.length > 0 ? appliedNames : undefined,
        sort,
        page,
      })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false))
  }, [appliedName, appliedNames, sort, page])

  useEffect(() => { fetchList() }, [fetchList])

  const applyFilters = () => {
    setAppliedName(itemName.trim())
    setAppliedNames(showPaste ? parseNames(pasteText) : [])
    setPage(1)
  }

  const clearFilters = () => {
    setItemName('')
    setPasteText('')
    setShowPaste(false)
    setAppliedName('')
    setAppliedNames([])
    setPage(1)
  }

  const hasFilter = appliedName !== '' || appliedNames.length > 0

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-xl font-bold text-white">買取一覧</h1>
        {user && (
          <Link
            to="/buy-requests/new"
            className="text-sm bg-primary-500 hover:bg-primary-600 text-white px-4 py-1.5 rounded-md transition-colors shrink-0"
          >
            買取する
          </Link>
        )}
      </div>
      <p className="text-sm text-gray-400 mb-5">
        「買いたい」アイテムの募集一覧です。装備品・テクニック・アセットをまとめてアイテム名で検索できます。
      </p>

      {/* 絞り込み（アイテム名のみ） */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="アイテム名で検索（部分一致）"
            className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
          <button
            type="button"
            onClick={applyFilters}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm px-5 rounded transition-colors shrink-0"
          >
            検索
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
        >
          {showPaste ? '▲ アイテム一覧の貼り付けを閉じる' : '▼ 複数のアイテム名で絞り込む（一覧を貼り付け）'}
        </button>

        {showPaste && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">
              アイテム名を改行区切りで貼り付けるか、公式サイトの所持アイテム一覧（タブ区切り）をそのまま貼り付けてください。
            </p>
            <textarea
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`レンタル\tNo▼\tアイテム名\tカテゴリ\t転送\t個数
1\tアイネの抱っこぬいぐるみ\t中級者レア\t○\t1
3\tアクアマリン\t中級者アンコモン\t○\t321`}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 font-mono"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={applyFilters}
                className="bg-primary-500 hover:bg-primary-600 text-white text-sm px-5 py-2 rounded transition-colors"
              >
                読込
              </button>
              {pasteText.trim() && (
                <span className="text-xs text-gray-400">{parseNames(pasteText).length} 件のアイテム名を抽出</span>
              )}
            </div>
          </div>
        )}

        {hasFilter && (
          <div className="flex items-center justify-between border-t border-surface-border pt-3">
            <p className="text-xs text-gray-400">
              絞り込み中:
              {appliedName && <span className="text-gray-200 ml-1">「{appliedName}」</span>}
              {appliedNames.length > 0 && <span className="text-gray-200 ml-1">アイテム名 {appliedNames.length} 件</span>}
            </p>
            <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-white transition-colors">
              クリア
            </button>
          </div>
        )}
      </div>

      {/* ソート + 件数 */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">
          {data ? `${data.total} 件` : ''}
        </p>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1) }}
          className="bg-surface-card border border-surface-border rounded px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-primary-500"
        >
          <option value="newest">新着順</option>
          <option value="name_asc">あいうえお順</option>
          <option value="price_desc">買取価格が高い順</option>
          <option value="price_asc">買取価格が安い順</option>
        </select>
      </div>

      {/* 一覧 */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">読み込み中...</div>
      ) : !data || data.data.length === 0 ? (
        <div className="text-center py-16 bg-surface-card border border-surface-border rounded-lg">
          <p className="text-gray-500 text-sm">該当する買取はありません。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.data.map((b) => (
            <BuyRequestCard key={b.id} buyRequest={b} />
          ))}
        </div>
      )}

      {/* ページネーション */}
      {data && data.last_page > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-sm px-3 py-1.5 rounded border border-surface-border text-gray-300 disabled:opacity-40 hover:bg-surface-border transition-colors"
          >
            前へ
          </button>
          <span className="text-sm text-gray-400">{data.current_page} / {data.last_page}</span>
          <button
            onClick={() => setPage((p) => Math.min(data.last_page, p + 1))}
            disabled={page >= data.last_page}
            className="text-sm px-3 py-1.5 rounded border border-surface-border text-gray-300 disabled:opacity-40 hover:bg-surface-border transition-colors"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  )
}
