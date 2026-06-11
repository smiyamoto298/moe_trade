import { useState } from 'react'
import { listingsApi } from '../api/listings'
import { buyRequestsApi } from '../api/buyRequests'
import { useAuth } from '../contexts/AuthContext'
import { SERVERS } from '../types'
import type { Listing, BuyRequest, Server } from '../types'
import { SERVER_COLORS, TRADE_TYPE_LABEL } from '../utils/constants'

interface Props {
  kind: 'listing' | 'buy_request'
  record: Listing | BuyRequest
  onClose: () => void
  onSaved: (updated: Listing | BuyRequest) => void
}

// 出品・買取の一部項目（即決/交渉可・対象サーバー・コメント・削れ[出品のみ]）を編集するモーダル。
export default function EditTradeModal({ kind, record, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [tradeType, setTradeType] = useState<string>(record.trade_type)
  const [comment, setComment] = useState<string>(record.comment ?? '')
  const [isWorn, setIsWorn] = useState<boolean>(kind === 'listing' ? !!(record as Listing).is_worn : false)
  const [servers, setServers] = useState<Server[]>(record.servers.map((s) => s.server))
  // 登録時点で選択済みのサーバー。これらは外せない（追加のみ許可）。
  const [lockedServers] = useState(() => new Set(record.servers.map((s) => s.server)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleServer = (s: Server) => {
    if (lockedServers.has(s)) return // 既存のサーバーは外せない
    setServers((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  }

  const save = async () => {
    if (servers.length === 0) {
      setError('取引可能サーバーを1つ以上選択してください。')
      return
    }
    setSaving(true)
    setError('')
    try {
      const serverPayload = servers.map((s) => {
        const char = user?.characters?.find((c) => c.server === s)
        return { server: s, character_id: char?.id ?? null }
      })
      const base = { trade_type: tradeType, comment, servers: serverPayload }

      const res =
        kind === 'listing'
          ? await listingsApi.update(record.id, { ...base, is_worn: isWorn })
          : await buyRequestsApi.update(record.id, base)
      onSaved(res.data)
      onClose()
    } catch {
      setError('保存に失敗しました。時間をおいて再度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full my-8 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white">{kind === 'listing' ? '出品' : '買取'}の編集</h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{record.item?.name}</p>
        </div>

        {/* 取引方法 */}
        <div>
          <p className="text-sm text-gray-300 mb-1.5">取引方法</p>
          <div className="flex gap-2">
            {(['fixed', 'negotiable'] as const).map((t) => (
              <label
                key={t}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border cursor-pointer text-sm transition-colors ${
                  tradeType === t
                    ? 'border-primary-500 bg-primary-900/20 text-gray-200'
                    : 'border-surface-border text-gray-400 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="edit-trade-type"
                  checked={tradeType === t}
                  onChange={() => setTradeType(t)}
                  className="accent-primary-500"
                />
                {TRADE_TYPE_LABEL[t]}
              </label>
            ))}
          </div>
        </div>

        {/* 対象サーバー */}
        <div>
          <p className="text-sm text-gray-300 mb-1.5">取引可能サーバー</p>
          <div className="space-y-1.5">
            {SERVERS.map((s) => {
              const char = user?.characters?.find((c) => c.server === s)
              const locked = lockedServers.has(s)
              const checked = servers.includes(s)
              // ロック中（既存選択）は外せない。未登録キャラのサーバーは新規追加できない。
              const disabled = locked || !char
              return (
                <label
                  key={s}
                  className={`flex items-center gap-3 px-3 py-2 rounded border text-sm transition-colors ${
                    checked
                      ? `${SERVER_COLORS[s]} ${locked ? '' : 'cursor-pointer'}`
                      : !char
                        ? 'border-surface-border opacity-50 cursor-not-allowed'
                        : 'border-surface-border text-gray-300 hover:border-gray-500 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={checked}
                    onChange={() => toggleServer(s)}
                    className="accent-primary-500"
                  />
                  <span className="font-medium w-16 shrink-0">{s}</span>
                  <span className="text-xs flex-1">{char ? char.character_name : 'キャラ未登録'}</span>
                  {locked && <span className="text-[10px] text-gray-400 shrink-0">固定</span>}
                </label>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">既存のサーバーは外せません。追加のみ可能です（登録済みキャラのあるサーバーのみ）。</p>
        </div>

        {/* 削れ（出品のみ） */}
        {kind === 'listing' && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isWorn}
              onChange={(e) => setIsWorn(e.target.checked)}
              className="accent-primary-500"
            />
            <span className="text-sm text-gray-300">削れあり（耐久度に削れがある中古品）</span>
          </label>
        )}

        {/* コメント */}
        <div>
          <p className="text-sm text-gray-300 mb-1.5">コメント</p>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            placeholder="任意"
            className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none"
          />
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">{error}</div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-white px-4 py-2 rounded transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || servers.length === 0}
            className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-5 py-2 rounded-md transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
