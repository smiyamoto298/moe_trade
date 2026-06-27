import { useState, useEffect, useRef } from 'react'
import { useAsync } from '../hooks/useAsync'
import { useGoBackOr } from '../hooks/useGoBackOr'
import { buyRequestsApi } from '../api/buyRequests'
import { itemsApi } from '../api/items'
import client from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import NewItemForm from '../components/NewItemForm'
import PriceAnalyticsModal from '../components/PriceAnalyticsModal'
import type { Item, MyItemCounts } from '../types'
import { SERVERS } from '../types'
import { TRADE_TYPE_LABEL, defaultAuctionDeadline } from '../utils/constants'
import DeadlineInput from '../components/DeadlineInput'

export default function NewBuyRequestPage() {
  const { user } = useAuth()
  // 買取登録後は元居た画面に戻る（戻り先が無ければマイページ）
  const goBack = useGoBackOr('/mypage')

  const { run: runSubmit, loading: submitting } = useAsync()
  const { run: runSearch, loading: searching } = useAsync()
  const [itemSearch, setItemSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Item[]>([])
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showNewItemForm, setShowNewItemForm] = useState(false)
  const [priceError, setPriceError] = useState('')
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [itemCounts, setItemCounts] = useState<MyItemCounts | null>(null)

  useEffect(() => {
    if (!user) return
    client.get<MyItemCounts>('/mypage/item-counts').then((r) => setItemCounts(r.data)).catch(() => {})
  }, [user])

  const [form, setForm] = useState({
    price: '',
    currency: 'AC',
    trade_type: 'fixed',
    comment: '',
    buyout_price: '',   // 即決価格（オークションのみ）
    expires_at: '',     // 期限日（オークションのみ）
    servers: [] as string[],
  })
  const isAuction = form.trade_type === 'auction'

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
    if (!(Number(form.price) >= 1)) {
      setPriceError(isAuction ? '最高取引価格は1以上で入力してください。' : '買取希望価格は1以上で入力してください。')
      return
    }
    if (isAuction) {
      if (!form.expires_at) {
        setPriceError('オークションの期限日を入力してください。')
        return
      }
      if (new Date(form.expires_at).getTime() <= Date.now()) {
        setPriceError('期限日は現在時刻より後に設定してください。')
        return
      }
      if (form.buyout_price && Number(form.buyout_price) >= Number(form.price)) {
        setPriceError('即決価格は最高取引価格より低く設定してください。')
        return
      }
    }
    setPriceError('')
    runSubmit(async () => {
      const serverPayload = form.servers.map((s) => {
        const char = user.characters?.find((c) => c.server === s)
        return { server: s, character_id: char?.id ?? null }
      })
      await buyRequestsApi.create({
        item_id: selectedItem.id,
        price: Number(form.price),
        currency: form.currency,
        quantity: 1,
        trade_type: form.trade_type,
        comment: form.comment,
        ...(isAuction ? {
          buyout_price: form.buyout_price ? Number(form.buyout_price) : null,
          expires_at: new Date(form.expires_at).toISOString(),
        } : {}),
        servers: serverPayload,
      })
      goBack()
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
      <h1 className="text-xl font-bold text-white mb-6">買取する</h1>

      {!user?.email_verified_at && (
        <div className="mb-4 bg-red-900/40 border border-red-600/50 rounded-md px-4 py-3 text-sm text-red-300">
          買取するにはメール認証が必要です。登録メールを確認してください。
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        // Enter キーでの誤送信を防ぐ（textarea の改行入力は許可）。送信は「買取する」ボタンのみ。
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
          }
        }}
        className="space-y-6"
      >
        {/* アイテム選択 */}
        <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">買いたいアイテム</h2>

          {selectedItem ? (
            <div className="flex items-center justify-between bg-surface rounded px-3 py-2">
              <div>
                <p className="text-xs text-gray-400">{selectedItem.category.name}</p>
                <p className="text-white font-medium">{selectedItem.name}</p>
                {selectedItem.verified_status === 'unverified' && (
                  <p className="text-xs text-yellow-400 mt-0.5">⚠ 確認中アイテム</p>
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
                            title="確認中アイテム（管理者が確認中です）"
                            className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-700/40 rounded px-1.5 py-0.5 shrink-0"
                          >
                            ⚠ 確認中
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
        <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">買取希望価格・取引方法</h2>

          <div>
            <label className="block text-xs text-gray-400 mb-1">取引方法</label>
            <select
              value={form.trade_type}
              onChange={(e) => {
                const tt = e.target.value
                setForm((p) => ({
                  ...p,
                  trade_type: tt,
                  expires_at: tt === 'auction' && !p.expires_at ? defaultAuctionDeadline() : p.expires_at,
                }))
              }}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
            >
              {(Object.keys(TRADE_TYPE_LABEL) as Array<keyof typeof TRADE_TYPE_LABEL>).map((k) => (
                <option key={k} value={k}>{TRADE_TYPE_LABEL[k]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">{isAuction ? '最高取引価格' : '買取希望価格'}</label>
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
              {isAuction && <p className="mt-1 text-xs text-gray-500">この額以下の入札のみ受け付けます（開始価格）</p>}
              {priceError && <p className="mt-1 text-xs text-red-400">{priceError}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">通貨</label>
              <div className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-300">
                AC
              </div>
            </div>
          </div>

          {/* オークション設定 */}
          {isAuction && (
            <div className="space-y-3 border border-amber-700/40 bg-amber-900/15 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">即決価格（任意）</label>
                  <input
                    type="number"
                    min={1}
                    value={form.buyout_price}
                    onChange={(e) => { setForm((p) => ({ ...p, buyout_price: e.target.value })); if (priceError) setPriceError('') }}
                    placeholder="この額以下で即時成立"
                    className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">期限日</label>
                  <DeadlineInput
                    value={form.expires_at}
                    onChange={(v) => { setForm((p) => ({ ...p, expires_at: v })); if (priceError) setPriceError('') }}
                  />
                  <p className="mt-1 text-xs text-gray-500">時刻は15分単位で選べます</p>
                </div>
              </div>
              <div className="text-xs text-amber-200 space-y-1">
                <p className="font-semibold text-amber-100">⚠ オークションの注意</p>
                <p>・期限日に最も安い入札が<span className="font-bold">自動的に取引成立</span>します（即決価格に達した時点でも即時成立）。</p>
                <p>・入札が<span className="font-bold">1件でも入ると、途中で取り下げ・変更はできません</span>。</p>
                <p>・期限切れ後の再登録はできません（入札が無ければ自動的に取り下げ）。</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">コメント（任意）</label>
            <textarea
              rows={3}
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>
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
          {isAuction ? (
            <>
              <p>・オークションは設定した <span className="text-gray-200 font-medium">期限日</span> に自動的に取引成立します。</p>
              <p>・通常の期限切れ（自動取り下げ）は適用されません。</p>
            </>
          ) : (
            <>
              <p>・買取は <span className="text-gray-200 font-medium">1か月</span> で期限切れになります。</p>
              <p>・期限はマイページの買取一覧からいつでも更新（延長）できます。</p>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors"
        >
          {submitting ? '送信中...' : '買取する'}
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
