import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { listingsApi } from '../api/listings'
import { itemsApi } from '../api/items'
import client from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import NewItemForm from '../components/NewItemForm'
import PriceAnalyticsModal from '../components/PriceAnalyticsModal'
import type { Item, MyItemCounts, ItemCategory } from '../types'
import { SERVERS } from '../types'
import { TRADE_TYPE_LABEL } from '../utils/constants'
import { itemTypeOf, topCategoryName, OTHER_CATEGORY } from '../utils/itemType'

export default function NewListingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // 所有アイテム管理などから「このアイテムを出品」で遷移してきた場合の初期選択（削れ・染色も引き継ぐ）
  const presetState = (location.state as { presetItem?: Item; presetWorn?: boolean; presetDyed?: boolean } | null)
  const presetItem = presetState?.presetItem ?? null

  const { run: runSubmit, loading: submitting } = useAsync()
  const { run: runSearch, loading: searching } = useAsync()
  const [itemSearch, setItemSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Item[]>([])
  const [selectedItem, setSelectedItem] = useState<Item | null>(presetItem)
  const [showNewItemForm, setShowNewItemForm] = useState(false)
  const [priceError, setPriceError] = useState('')
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [itemCounts, setItemCounts] = useState<MyItemCounts | null>(null)
  const [categories, setCategories] = useState<ItemCategory[]>([])

  useEffect(() => {
    if (!user) return
    client.get<MyItemCounts>('/mypage/item-counts').then((r) => setItemCounts(r.data)).catch(() => {})
  }, [user])

  useEffect(() => {
    itemsApi.categories().then((r) => setCategories(r.data)).catch(() => {})
  }, [])

  // テクニックは耐久度の概念がないため「削れあり」は不要
  const isTechnique = !!selectedItem && categories.length > 0 && itemTypeOf(selectedItem.category, categories) === 'technique'
  // 「その他」種別（未開封ペット・レシピ）は耐久度・染色の概念がないため削れ・染色は不要
  const isOther = !!selectedItem && categories.length > 0 && topCategoryName(selectedItem.category, categories) === OTHER_CATEGORY
  // 削れ・染色の入力を出さない種別
  const hideWornDyed = isTechnique || isOther

  const [form, setForm] = useState({
    price: '',
    currency: 'AC', // ゲーム内通貨（固定）
    trade_type: 'fixed',
    comment: '',
    is_worn: presetState?.presetWorn ?? false,
    is_dyed: presetState?.presetDyed ?? false,
    servers: [] as string[],
  })

  // デフォルトキャラのサーバーを取引可能サーバーに初期チェックする（複数可・初回のみ）
  const defaultServerApplied = useRef(false)
  useEffect(() => {
    if (defaultServerApplied.current || !user) return
    const defServers = (user.characters ?? []).filter((c) => c.is_default).map((c) => c.server)
    if (defServers.length > 0) {
      setForm((p) => (p.servers.length === 0 ? { ...p, servers: defServers } : p))
    }
    defaultServerApplied.current = true
  }, [user])

  const handleItemSearch = () => runSearch(async () => {
    if (!itemSearch.trim()) return
    setShowNewItemForm(false)
    const res = await itemsApi.list({ name: itemSearch })
    setSearchResults(res.data)
    if (res.data.length === 0) setShowNewItemForm(true)
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem || !user) return
    // 価格は1以上
    if (!(Number(form.price) >= 1)) {
      setPriceError('価格は1以上で入力してください。')
      return
    }
    setPriceError('')
    runSubmit(async () => {
      const serverPayload = form.servers.map((s) => {
        const char = user.characters?.find((c) => c.server === s)
        return { server: s, character_id: char?.id ?? null }
      })
      await listingsApi.create({
        item_id: selectedItem.id,
        price: Number(form.price),
        currency: form.currency,
        quantity: 1,
        trade_type: form.trade_type,
        comment: form.comment,
        is_worn: hideWornDyed ? false : form.is_worn,
        is_dyed: hideWornDyed ? false : form.is_dyed,
        servers: serverPayload,
      })
      navigate('/mypage')
    })
  }

  const listingCount = selectedItem ? (itemCounts?.listings[selectedItem.id] ?? 0) : 0
  const buyCount = selectedItem ? (itemCounts?.buy_requests[selectedItem.id] ?? 0) : 0

  const canSubmit =
    selectedItem &&
    form.servers.length > 0 &&
    user?.email_verified_at

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-6">出品する</h1>

      {!user?.email_verified_at && (
        <div className="mb-4 bg-red-900/40 border border-red-600/50 rounded-md px-4 py-3 text-sm text-red-300">
          出品するにはメール認証が必要です。登録メールを確認してください。
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* アイテム選択 */}
        <div data-tour="new-item" className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">アイテム</h2>

          {selectedItem ? (
            <div className="flex items-center justify-between bg-surface rounded px-3 py-2">
              <div>
                <p className="text-xs text-gray-400">{selectedItem.category.name}</p>
                <p className="text-white font-medium">{selectedItem.name}</p>
                {selectedItem.verified_status === 'unverified' && (
                  <p className="text-xs text-yellow-400 mt-0.5">⚠ 未確認アイテム</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAnalytics(true)}
                  className="text-xs bg-sky-900/40 hover:bg-sky-900/70 border border-sky-700/50 text-sky-300 px-2.5 py-1 rounded transition-colors"
                >
                  相場情報
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  変更
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="アイテム名で検索"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleItemSearch())}
                  className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={handleItemSearch}
                  disabled={searching}
                  className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-sm px-4 rounded transition-colors"
                >
                  {searching ? '...' : '検索'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="border border-surface-border rounded divide-y divide-surface-border">
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setSelectedItem(item); setSearchResults([]) }}
                      className="w-full text-left px-3 py-2 hover:bg-surface-border transition-colors"
                    >
                      <p className="text-xs text-gray-400">{item.category.name}</p>
                      <p className="text-sm text-white flex items-center gap-1.5">
                        {item.name}
                        {item.verified_status === 'unverified' && (
                          <span
                            title="未確認アイテム（管理者による確認が完了していません）"
                            className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-700/40 rounded px-1.5 py-0.5 shrink-0"
                          >
                            ⚠ 未確認
                          </span>
                        )}
                      </p>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowNewItemForm(true)}
                    className="w-full text-left px-3 py-2 hover:bg-yellow-900/20 transition-colors flex items-center gap-2"
                  >
                    <span className="text-yellow-400 text-sm">+</span>
                    <span className="text-sm text-yellow-300">「{itemSearch}」を新規登録する</span>
                  </button>
                </div>
              )}

              {showNewItemForm && (
                <div className="border border-yellow-700/50 bg-yellow-900/20 rounded-lg p-4">
                  <NewItemForm
                    initialName={itemSearch}
                    onRegistered={(item) => {
                      setSelectedItem(item)
                      setShowNewItemForm(false)
                      setSearchResults([])
                    }}
                    onCancel={() => setShowNewItemForm(false)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {selectedItem && (listingCount > 0 || buyCount > 0) && (
          <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg px-4 py-3 text-sm text-amber-200 flex items-center gap-2">
            <span className="text-lg leading-none">⚠</span>
            <span>
              このアイテムはすでに
              {listingCount > 0 && <span className="font-bold text-amber-100"> 出品 {listingCount}件</span>}
              {listingCount > 0 && buyCount > 0 && <span> ・</span>}
              {buyCount > 0 && <span className="font-bold text-amber-100"> 買取 {buyCount}件</span>}
              {' '}登録済みです。
            </span>
          </div>
        )}

        {/* 価格・取引方法 */}
        <div data-tour="new-price" className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">価格・取引方法</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">価格</label>
              <input
                type="number"
                required
                min={1}
                value={form.price}
                onChange={(e) => {
                  setForm((p) => ({ ...p, price: e.target.value }))
                  if (priceError) setPriceError('')
                }}
                className={`w-full bg-surface border rounded px-3 py-2 text-sm text-white focus:outline-none ${
                  priceError ? 'border-red-500 focus:border-red-500' : 'border-surface-border focus:border-primary-500'
                }`}
              />
              {priceError && <p className="mt-1 text-xs text-red-400">{priceError}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">通貨</label>
              <div className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-300">
                AC
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">取引方法</label>
            <select
              value={form.trade_type}
              onChange={(e) => setForm((p) => ({ ...p, trade_type: e.target.value }))}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
            >
              {(Object.keys(TRADE_TYPE_LABEL) as Array<keyof typeof TRADE_TYPE_LABEL>).map((k) => (
                <option key={k} value={k}>{TRADE_TYPE_LABEL[k]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">コメント（任意）</label>
            <textarea
              rows={3}
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>

          {!hideWornDyed && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_worn}
                  onChange={(e) => setForm((p) => ({ ...p, is_worn: e.target.checked }))}
                  className="accent-amber-500"
                />
                <span className="text-sm text-gray-300">削れあり</span>
                <span className="text-xs text-gray-500">（耐久度に削れがある中古品）</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_dyed}
                  onChange={(e) => setForm((p) => ({ ...p, is_dyed: e.target.checked }))}
                  className="accent-fuchsia-500"
                />
                <span className="text-sm text-gray-300">染色済み</span>
                <span className="text-xs text-gray-500">（染色液で色を変更済み）</span>
              </label>
            </div>
          )}
        </div>

        {/* サーバー選択 */}
        <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">取引可能サーバー</h2>
          <p className="text-xs text-gray-400">登録済みのキャラクターがあるサーバーのみ選択できます</p>

          <div className="space-y-2">
            {SERVERS.map((s) => {
              const char = user?.characters.find((c) => c.server === s)
              return (
                <label
                  key={s}
                  className={`flex items-center gap-3 p-3 rounded border transition-colors cursor-pointer ${
                    !char
                      ? 'border-surface-border opacity-40 cursor-not-allowed'
                      : form.servers.includes(s)
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-surface-border hover:border-surface-border/80'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!char}
                    checked={form.servers.includes(s)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        servers: e.target.checked
                          ? [...p.servers, s]
                          : p.servers.filter((x) => x !== s),
                      }))
                    }
                    className="accent-primary-500"
                  />
                  <span className="flex-1 text-sm text-white">{s}</span>
                  <span className="text-sm text-gray-400">
                    {char ? char.character_name : 'キャラ未登録'}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="bg-surface-card border border-surface-border rounded-lg px-4 py-3 text-xs text-gray-400 space-y-1">
          <p>・出品は <span className="text-gray-200 font-medium">7日間</span> で期限切れになります。</p>
          <p>・期限はマイページの出品一覧からいつでも更新（延長）できます。</p>
        </div>

        <button
          type="submit"
          data-tour="new-submit"
          disabled={!canSubmit || submitting}
          className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors"
        >
          {submitting ? '送信中...' : '出品する'}
        </button>
      </form>

      {showAnalytics && selectedItem && (
        <PriceAnalyticsModal
          itemId={selectedItem.id}
          itemName={selectedItem.name}
          onClose={() => setShowAnalytics(false)}
        />
      )}
    </div>
  )
}
