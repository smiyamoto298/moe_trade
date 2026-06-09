import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { listingsApi } from '../api/listings'
import { itemsApi } from '../api/items'
import { useAuth } from '../contexts/AuthContext'
import NewItemForm from '../components/NewItemForm'
import PriceAnalyticsModal from '../components/PriceAnalyticsModal'
import CandidateSelectModal from '../components/CandidateSelectModal'
import type { Item } from '../types'
import { SERVERS } from '../types'
import { TRADE_TYPE_LABEL } from '../utils/constants'

// API（axios）エラーから検証メッセージを取り出す。
// Laravel の 422 は { message, errors: { field: [msg] } } 形式で返る。
function extractApiError(e: unknown): string {
  const res = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response
  const data = res?.data
  if (data?.errors) {
    const first = Object.values(data.errors)[0]?.[0]
    if (first) return first
  }
  return data?.message ?? '不明なエラーが発生しました。'
}

// 末尾が「...」または「…」で省略されたアイテム名かどうか
const TRUNC_RE = /\s*(\.\.\.|…)\s*$/
const isTruncatedName = (name: string) => TRUNC_RE.test(name)
const truncatedBase = (name: string) => name.replace(TRUNC_RE, '').trim()

interface Row {
  key: string
  no: string
  name: string
  category: string
  count: number
  item: Item | null
  price: string
  listQty: string
}

const SAMPLE = `レンタル\tNo▼\tアイテム名\tカテゴリ\t転送\t個数
1\tアイネの抱っこぬいぐるみ\t中級者レア\t○\t1
3\tアクアマリン\t中級者アンコモン\t○\t321`

/**
 * 公式サイトの所持アイテム一覧（タブ区切り）を解析する。
 * 列順は [レンタル] No アイテム名 カテゴリ 転送 個数 だが、
 * レンタル列の有無に対応するため「転送(○/×)」セルを基準に相対位置で取得する。
 */
function parsePaste(text: string): { rows: Row[]; excluded: number; skipped: number } {
  const lines = text.split(/\r?\n/)
  const rows: Row[] = []
  let excluded = 0
  let skipped = 0

  lines.forEach((line, i) => {
    if (!line.trim()) return
    const cells = line.split('\t').map((c) => c.trim())

    // ヘッダー行
    if (cells.some((c) => c === 'アイテム名' || c === 'No▼' || c === 'カテゴリ')) return

    // 転送列（○ / ×）を探す
    const tIdx = cells.findIndex((c) => c === '○' || c === '◯' || c === '×' || c === '✕' || c === 'x')
    if (tIdx < 2) {
      skipped++
      return
    }

    const tenso = cells[tIdx]
    const name = (cells[tIdx - 2] ?? '').trim()
    const category = (cells[tIdx - 1] ?? '').trim()
    const countRaw = (cells[tIdx + 1] ?? '').trim()
    const no = (cells[tIdx - 3] ?? cells[0] ?? '').trim()

    // 名前が無い／空きスロットはスキップ
    if (!name || name === '空き') {
      if (tenso === '×' || tenso === '✕' || tenso === 'x') excluded++
      else skipped++
      return
    }

    // 転送×は除外
    if (tenso === '×' || tenso === '✕' || tenso === 'x') {
      excluded++
      return
    }

    const count = Number(countRaw.replace(/,/g, '')) || 0
    rows.push({
      key: `${i}-${name}`,
      no,
      name,
      category,
      count,
      item: null,
      price: '',
      listQty: '0',
    })
  })

  return { rows, excluded, skipped }
}

export default function BulkListingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { run: runLoad, loading: loadingRows } = useAsync()
  const { run: runSubmit, loading: submitting } = useAsync()

  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [excluded, setExcluded] = useState(0)
  const [parsed, setParsed] = useState(false)

  // 共通設定
  const [tradeType, setTradeType] = useState('fixed')
  const [servers, setServers] = useState<string[]>([])

  // 新規登録モーダル
  const [modalRowKey, setModalRowKey] = useState<string | null>(null)
  // 候補選択モーダル（末尾「...」の前方一致検索）
  const [candidateRowKey, setCandidateRowKey] = useState<string | null>(null)
  // 相場情報モーダル
  const [analyticsItem, setAnalyticsItem] = useState<Item | null>(null)

  const [errors, setErrors] = useState<string[]>([])
  const [result, setResult] = useState<string | null>(null)

  const modalRow = rows.find((r) => r.key === modalRowKey) ?? null
  const candidateRow = rows.find((r) => r.key === candidateRowKey) ?? null

  const handleLoad = () => runLoad(async () => {
    setErrors([])
    setResult(null)
    const { rows: parsedRows, excluded: ex } = parsePaste(raw)
    setExcluded(ex)
    setParsed(true)
    if (parsedRows.length === 0) {
      setRows([])
      return
    }
    // 登録済みアイテムと照合（末尾「...」の省略名は自動設定せず、候補/新規登録で手動選択させる）
    const names = Array.from(new Set(parsedRows.filter((r) => !isTruncatedName(r.name)).map((r) => r.name)))
    const res = names.length > 0 ? await itemsApi.matchNames(names) : { data: {} as Record<string, Item> }
    const map = res.data
    setRows(parsedRows.map((r) => ({ ...r, item: isTruncatedName(r.name) ? null : (map[r.name] ?? null) })))
  })

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  // 新規登録完了 → 同名の行すべてに反映
  const handleRegistered = (item: Item) => {
    setRows((prev) =>
      prev.map((r) => (r.name === item.name || r.key === modalRowKey ? { ...r, item } : r))
    )
    setModalRowKey(null)
  }

  // 候補から既存アイテムを選択 → 同名（省略名）の行すべてに反映
  const handleCandidateSelected = (item: Item) => {
    const selectedName = candidateRow?.name
    setRows((prev) =>
      prev.map((r) => (r.key === candidateRowKey || r.name === selectedName ? { ...r, item } : r))
    )
    setCandidateRowKey(null)
  }

  const matchedRows = rows.filter((r) => r.item)
  const totalListings = useMemo(
    () =>
      matchedRows.reduce((sum, r) => {
        const q = Number(r.listQty) || 0
        return sum + (q > 0 ? q : 0)
      }, 0),
    [matchedRows]
  )

  const handleSubmit = () => {
    if (!user) return
    const errs: string[] = []

    if (!user.email_verified_at) errs.push('出品するにはメール認証が必要です。')
    if (servers.length === 0) errs.push('取引可能サーバーを1つ以上選択してください。')

    const targets = rows.filter((r) => r.item && (Number(r.listQty) || 0) > 0)
    if (targets.length === 0) errs.push('出品数を1以上に設定した行がありません。')

    for (const r of targets) {
      const qty = Number(r.listQty) || 0
      const price = Number(r.price)
      if (qty > r.count) errs.push(`「${r.name}」: 出品数(${qty})が所持個数(${r.count})を超えています。`)
      if (!Number.isInteger(price) || price < 1)
        errs.push(`「${r.name}」: 価格は1以上の整数で入力してください。`)
    }

    if (errs.length > 0) {
      setErrors(errs)
      setResult(null)
      return
    }
    setErrors([])

    runSubmit(async () => {
      const serverPayload = servers.map((s) => {
        const char = user.characters?.find((c) => c.server === s)
        return { server: s, character_id: char?.id ?? null }
      })

      let created = 0
      const failed: string[] = []
      let lastError = ''
      for (const r of targets) {
        const qty = Number(r.listQty) || 0
        const price = Number(r.price)
        // 出品数分、個数1の出品を別々に作成
        for (let n = 0; n < qty; n++) {
          try {
            await listingsApi.create({
              item_id: r.item!.id,
              price,
              currency: 'AC',
              quantity: 1,
              trade_type: tradeType,
              comment: '',
              servers: serverPayload,
            })
            created++
          } catch (e) {
            failed.push(`${r.name} (${n + 1}/${qty})`)
            lastError = extractApiError(e)
          }
        }
      }

      if (failed.length > 0) {
        setErrors([
          `一部の出品に失敗しました: ${failed.join(', ')}`,
          ...(lastError ? [`サーバーからのエラー: ${lastError}`] : []),
        ])
        setResult(created > 0 ? `${created}件の出品を登録しました。` : null)
        return
      }
      setResult(`${created}件の出品を登録しました。マイページへ移動します…`)
      setTimeout(() => navigate('/mypage'), 1200)
    })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-2">一括出品</h1>
      <p className="text-sm text-gray-400 mb-6">
        公式サイトの所持アイテム一覧をコピーして貼り付け、「読込」を押してください。転送が×のアイテムは除外されます。
      </p>

      {!user?.email_verified_at && (
        <div className="mb-4 bg-red-900/40 border border-red-600/50 rounded-md px-4 py-3 text-sm text-red-300">
          出品するにはメール認証が必要です。登録メールを確認してください。
        </div>
      )}

      {/* 貼り付けエリア */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3 mb-6">
        <h2 className="text-sm font-semibold text-gray-300">アイテム一覧を貼り付け</h2>
        <textarea
          rows={6}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={SAMPLE}
          className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 font-mono"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleLoad}
            disabled={loadingRows || !raw.trim()}
            className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-sm px-5 py-2 rounded transition-colors"
          >
            {loadingRows ? '読込中...' : '読込'}
          </button>
          {parsed && (
            <span className="text-xs text-gray-400">
              読込 {rows.length} 件 / 除外（転送×・空き） {excluded} 件
            </span>
          )}
        </div>
      </div>

      {parsed && rows.length === 0 && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-6 text-center text-sm text-gray-400">
          出品可能なアイテムが見つかりませんでした。貼り付け内容をご確認ください。
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* 共通設定 */}
          <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-300">共通設定（全出品に適用）</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">取引方法</label>
                <select
                  value={tradeType}
                  onChange={(e) => setTradeType(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                >
                  {(Object.keys(TRADE_TYPE_LABEL) as Array<keyof typeof TRADE_TYPE_LABEL>).map((k) => (
                    <option key={k} value={k}>{TRADE_TYPE_LABEL[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">通貨</label>
                <div className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-300">AC</div>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-2">取引可能サーバー（登録済みキャラクターがあるサーバーのみ選択可）</p>
              <div className="flex flex-wrap gap-2">
                {SERVERS.map((s) => {
                  const char = user?.characters.find((c) => c.server === s)
                  return (
                    <label
                      key={s}
                      className={`flex items-center gap-2 px-3 py-2 rounded border text-sm transition-colors cursor-pointer ${
                        !char
                          ? 'border-surface-border opacity-40 cursor-not-allowed'
                          : servers.includes(s)
                          ? 'border-primary-500 bg-primary-500/10 text-white'
                          : 'border-surface-border text-gray-300 hover:border-surface-border/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!char}
                        checked={servers.includes(s)}
                        onChange={(e) =>
                          setServers((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))
                        }
                        className="accent-primary-500"
                      />
                      {s}
                      {char && <span className="text-xs text-gray-500">({char.character_name})</span>}
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 登録用テーブル */}
          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="bg-surface text-gray-400 text-xs">
                    <th className="px-3 py-2 text-left font-medium">No</th>
                    <th className="px-3 py-2 text-left font-medium">アイテム名</th>
                    <th className="px-3 py-2 text-left font-medium">カテゴリ</th>
                    <th className="px-3 py-2 text-right font-medium">個数</th>
                    <th className="px-3 py-2 text-left font-medium">登録アイテム</th>
                    <th className="px-3 py-2 text-right font-medium">価格(AC)</th>
                    <th className="px-3 py-2 text-right font-medium">出品数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {rows.map((r) => {
                    const linked = !!r.item
                    return (
                      <tr key={r.key} className={linked ? '' : 'bg-yellow-900/5'}>
                        <td className="px-3 py-2 text-gray-500">{r.no}</td>
                        <td className="px-3 py-2 text-white">{r.name}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs">{r.category}</td>
                        <td className="px-3 py-2 text-right text-gray-300">{r.count}</td>
                        <td className="px-3 py-2">
                          {linked ? (
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-primary-300">{r.item!.name}</span>
                              {r.item!.verified_status === 'unverified' && (
                                <span
                                  title="未確認アイテム"
                                  className="text-[10px] text-yellow-400 bg-yellow-900/30 border border-yellow-700/40 rounded px-1 py-0.5 shrink-0"
                                >
                                  ⚠ 未確認
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setAnalyticsItem(r.item)}
                                className="text-[10px] bg-sky-900/40 hover:bg-sky-900/70 border border-sky-700/50 text-sky-300 px-1.5 py-0.5 rounded shrink-0 transition-colors"
                              >
                                相場情報
                              </button>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {isTruncatedName(r.name) && (
                                <button
                                  type="button"
                                  onClick={() => setCandidateRowKey(r.key)}
                                  className="text-xs bg-sky-600/80 hover:bg-sky-600 text-white px-2.5 py-1 rounded transition-colors"
                                >
                                  候補
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setModalRowKey(r.key)}
                                className="text-xs bg-yellow-600/80 hover:bg-yellow-600 text-white px-2.5 py-1 rounded transition-colors"
                              >
                                + 新規登録
                              </button>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            disabled={!linked}
                            value={r.price}
                            onChange={(e) => setRow(r.key, { price: e.target.value.replace(/[^\d]/g, '') })}
                            placeholder="—"
                            className="w-24 bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white text-right placeholder-gray-600 focus:outline-none focus:border-primary-500 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={r.count}
                            disabled={!linked}
                            value={r.listQty}
                            onChange={(e) => setRow(r.key, { listQty: e.target.value })}
                            className="w-20 bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-primary-500 disabled:opacity-40"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="mb-4 bg-red-900/40 border border-red-600/50 rounded px-4 py-3 text-sm text-red-300 space-y-1">
              {errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
          {result && (
            <div className="mb-4 bg-emerald-900/40 border border-emerald-600/50 rounded px-4 py-3 text-sm text-emerald-300">
              {result}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 sticky bottom-0 bg-surface-card/95 backdrop-blur border border-surface-border rounded-lg p-4">
            <p className="text-sm text-gray-300">
              出品予定: <span className="text-white font-semibold">{totalListings}</span> 件
              <span className="text-xs text-gray-500 ml-2">（出品数の合計。個数1の出品を件数分作成します）</span>
            </p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || totalListings === 0}
              className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-sm px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              {submitting ? '出品中...' : '一括出品する'}
            </button>
          </div>
        </>
      )}

      {/* 新規アイテム登録モーダル */}
      {modalRow && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="bg-surface-card border border-yellow-700/50 rounded-lg p-5 max-w-2xl w-full my-8">
            <NewItemForm
              initialName={isTruncatedName(modalRow.name) ? '' : modalRow.name}
              onRegistered={handleRegistered}
              onCancel={() => setModalRowKey(null)}
            />
          </div>
        </div>
      )}

      {/* 候補選択モーダル（末尾「...」の前方一致検索） */}
      {candidateRow && (
        <CandidateSelectModal
          baseName={truncatedBase(candidateRow.name)}
          originalName={candidateRow.name}
          onSelect={handleCandidateSelected}
          onCancel={() => setCandidateRowKey(null)}
        />
      )}

      {/* 相場情報モーダル */}
      {analyticsItem && (
        <PriceAnalyticsModal
          itemId={analyticsItem.id}
          itemName={analyticsItem.name}
          onClose={() => setAnalyticsItem(null)}
        />
      )}
    </div>
  )
}
