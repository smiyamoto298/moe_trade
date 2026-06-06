import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { listingsApi } from '../api/listings'
import { itemsApi } from '../api/items'
import { useAuth } from '../contexts/AuthContext'
import NewItemForm from '../components/NewItemForm'
import type { Item } from '../types'
import { SERVERS } from '../types'
import { TRADE_TYPE_LABEL } from '../utils/constants'

export default function NewListingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { run: runSubmit, loading: submitting } = useAsync()
  const { run: runSearch, loading: searching } = useAsync()
  const [itemSearch, setItemSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Item[]>([])
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showNewItemForm, setShowNewItemForm] = useState(false)

  const [form, setForm] = useState({
    price: '',
    currency: 'AC', // ゲーム内通貨（固定）
    quantity: '1',
    trade_type: 'fixed',
    comment: '',
    servers: [] as string[],
  })

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
    runSubmit(async () => {
      const serverPayload = form.servers.map((s) => {
        const char = user.characters?.find((c) => c.server === s)
        return { server: s, character_id: char?.id ?? null }
      })
      await listingsApi.create({
        item_id: selectedItem.id,
        price: Number(form.price),
        currency: form.currency,
        quantity: Number(form.quantity),
        trade_type: form.trade_type,
        comment: form.comment,
        servers: serverPayload,
      })
      navigate('/mypage')
    })
  }

  const canSubmit =
    selectedItem &&
    form.price &&
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
        <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
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
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-gray-400 hover:text-white text-sm"
              >
                変更
              </button>
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
                      <p className="text-sm text-white">{item.name}</p>
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

        {/* 価格・取引方法 */}
        <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">価格・取引方法</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">価格</label>
              <input
                type="number"
                required
                min={0}
                value={form.price}
                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">通貨</label>
              <div className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-gray-300">
                AC
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">数量</label>
              <input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              />
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
          disabled={!canSubmit || submitting}
          className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors"
        >
          {submitting ? '送信中...' : '出品する'}
        </button>
      </form>
    </div>
  )
}
