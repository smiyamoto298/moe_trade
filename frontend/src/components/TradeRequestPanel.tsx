import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatApi } from '../api/chat'
import { buyRequestsApi } from '../api/buyRequests'
import { charactersApi } from '../api/characters'
import { useAuth } from '../contexts/AuthContext'
import type { ListingServer, Server, TradeType } from '../types'
import { SERVER_COLORS } from '../utils/constants'

const TIME_SLOTS = [
  'いつでも',
  '平日 午前（9〜12時）',
  '平日 午後（12〜18時）',
  '平日 夜（18〜24時）',
  '週末 午前（9〜12時）',
  '週末 午後（12〜18時）',
  '週末 夜（18〜24時）',
]

interface Props {
  source: {
    id: number
    servers: ListingServer[]
    waiting_count?: number
    trade_type?: TradeType
    price?: number
    currency?: string
    buyout_price?: number | null
    current_price?: number | null
    best_bid?: number | null
  }
  kind?: 'listing' | 'buy_request'
  onComplete: () => void
  onCancel: () => void
  /** 送信時に対象が取り下げ／取引成立済みで取引不可だった場合の処理。未指定なら一覧へリダイレクト。 */
  onUnavailable?: () => void
}

export default function TradeRequestPanel({ source: listing, kind = 'listing', onComplete, onCancel, onUnavailable }: Props) {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [server, setServer] = useState<Server | ''>('')
  const [timeSlot, setTimeSlot] = useState('いつでも')
  const [note, setNote] = useState('')
  const [bid, setBid] = useState('')
  const [loading, setLoading] = useState(false)
  const [newCharName, setNewCharName] = useState('')
  const [error, setError] = useState('')

  // ---- オークション ----
  const isAuction = listing.trade_type === 'auction'
  const higherIsBetter = kind !== 'buy_request' // 出品=高いほど有利 / 買取=安いほど有利
  // 入力中に他ユーザーがより有利な額で入札した場合、サーバーから返る最新値で現在価格を上書きする
  // （初期値は props。outbid エラー時に setLiveBest/Current で更新して即座に再入札できるようにする）。
  const [liveBest, setLiveBest] = useState<number | null>(listing.best_bid ?? null)
  const [liveCurrent, setLiveCurrent] = useState<number | null>(listing.current_price ?? null)

  // 選択サーバーに自分のキャラクターが登録済みか
  const myChar = server ? user?.characters?.find((c) => c.server === server) : null
  const needsChar = server && !myChar

  const current = liveCurrent ?? listing.price ?? 0
  const hasBid = liveBest != null
  // 次に必要な最小/最大入札額（最良入札より有利。入札が無ければ開始価格=price）
  const requiredBid = higherIsBetter
    ? (hasBid ? (liveBest as number) + 1 : (listing.price ?? 1))
    : (hasBid ? (liveBest as number) - 1 : (listing.price ?? 1))
  const bidValid = !isAuction || (
    bid !== '' && (higherIsBetter
      ? Number(bid) >= (listing.price ?? 1) && (!hasBid || Number(bid) > (liveBest as number))
      : Number(bid) <= (listing.price ?? 1) && Number(bid) >= 1 && (!hasBid || Number(bid) < (liveBest as number)))
  )

  const handleServerChange = (s: Server) => {
    setServer(s)
    setNewCharName('')
  }

  const handleSubmit = async () => {
    if (!server) return
    if (needsChar && !newCharName.trim()) return
    if (isAuction && !bidValid) return
    setError('')
    setLoading(true)
    try {
      // キャラクター未登録なら先に登録
      if (needsChar && newCharName.trim()) {
        await charactersApi.upsert(server, newCharName.trim())
        await refresh()
      }
      const bidPrice = isAuction ? Number(bid) : undefined
      const res = kind === 'buy_request'
        ? await buyRequestsApi.createChat(listing.id, server, bidPrice)
        : await chatApi.getOrCreate(listing.id, server, bidPrice)
      // オークションは入札のみ（メッセージは送らない。備考があれば添える）
      if (!isAuction) {
        const lines = [
          `【取引希望】`,
          `サーバー: ${server}`,
          `希望時間帯: ${timeSlot}`,
          ...(note ? [`備考: ${note}`] : []),
        ]
        await chatApi.sendMessage(res.data.id, lines.join('\n'))
      } else if (note) {
        await chatApi.sendMessage(res.data.id, `【備考】${note}`)
      }
      onComplete()
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number; data?: { message?: string; best_bid?: number | null; current_price?: number | null } } })?.response
      // 入力中に他ユーザーがより有利な額で入札していた場合（サーバーが現在価格付きで 400 を返す）
      // → 現在価格を最新に更新し、その額を添えて再入札を促す（一覧へは飛ばさず再入力できるようにする）。
      if (isAuction && res?.status === 400 && res.data && res.data.current_price != null) {
        setLiveBest(res.data.best_bid ?? null)
        setLiveCurrent(res.data.current_price)
        const cur = (res.data.current_price ?? 0).toLocaleString()
        setError(
          `${higherIsBetter ? '他のユーザーがより高い額で入札しました。' : '他のユーザーがより安い額で入札しました。'}` +
          `現在の入札額は ${cur} ${listing.currency ?? 'AC'} です。入札額を入力し直してください。`
        )
        return
      }
      // 入力中に出品が取り下げ／取引成立した場合 → エラー表示して一覧へリダイレクト
      const unavailable =
        res?.status === 404 ||
        (res?.status === 400 && (res.data?.message ?? '').includes('取引できません'))
      if (unavailable) {
        if (onUnavailable) {
          onUnavailable()
        } else {
          navigate(kind === 'buy_request' ? '/buy-requests' : '/listings', {
            state: {
              tradeError: kind === 'buy_request'
                ? 'この買取は取り下げ、または取引成立済みのため取引できませんでした。'
                : 'この出品は取り下げ、または取引成立済みのため取引できませんでした。',
            },
          })
        }
        return
      }
      setError(res?.data?.message ?? '取引希望の送信に失敗しました。時間をおいて再度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-primary-500/30 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{isAuction ? 'オークションに入札する' : '取引を希望する'}</p>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-white">✕</button>
      </div>

      {/* オークション: 現在価格と入札の案内 */}
      {isAuction && (
        <div className="text-sm bg-amber-900/20 border border-amber-700/40 rounded-lg py-2 px-3 space-y-1">
          <p className="text-amber-200">
            現在価格: <span className="font-bold text-amber-100">{current.toLocaleString()} {listing.currency ?? 'AC'}</span>
            {listing.buyout_price != null && <span className="ml-2 text-gray-300">即決: {listing.buyout_price.toLocaleString()}</span>}
          </p>
          <p className="text-xs text-amber-300/90">
            {higherIsBetter
              ? `${requiredBid.toLocaleString()} 以上で入札できます`
              : `${requiredBid.toLocaleString()} 以下で入札できます`}
            ・入札後は取り下げできません
          </p>
        </div>
      )}

      {/* 先着順の順番待ち（オークションは対象外） */}
      {!isAuction && (listing.waiting_count ?? 0) > 0 && (
        <p className="text-center text-sm text-orange-300 bg-orange-900/20 border border-orange-700/40 rounded-lg py-2 px-3">
          ⏳ この取引は現在 {listing.waiting_count}人待ちです（先着順で対応されます）
        </p>
      )}

      {/* サーバー選択 */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">取引するサーバー <span className="text-red-400">*</span></label>
        <div className="space-y-1.5">
          {listing.servers.map((s) => (
            <label
              key={s.server}
              className={`flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-colors ${
                server === s.server
                  ? `${SERVER_COLORS[s.server]} border-current/50`
                  : 'border-surface-border hover:border-gray-500 text-gray-300'
              }`}
            >
              <input
                type="radio"
                name="server"
                value={s.server}
                checked={server === s.server}
                onChange={() => handleServerChange(s.server)}
                className="accent-primary-500"
              />
              <span className="font-medium">{s.server}</span>
              {s.character?.character_name && (
                <span className="text-sm opacity-75 ml-auto">連絡先: {s.character.character_name}</span>
              )}
            </label>
          ))}

          {/* キャラクター未登録の場合に入力欄を表示 */}
          {needsChar && (
            <div className="mt-2 p-3 bg-yellow-900/20 border border-yellow-600/40 rounded-lg space-y-2">
              <p className="text-xs text-yellow-300">
                ⚠ {server} サーバーのキャラクター名が未登録です。取引相手への連絡先として登録してください。
              </p>
              <input
                type="text"
                placeholder="キャラクター名を入力"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
                maxLength={100}
                className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* オークション: 入札額 */}
      {isAuction && (
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">入札額 <span className="text-red-400">*</span></label>
          <input
            type="number"
            min={1}
            value={bid}
            onChange={(e) => setBid(e.target.value)}
            placeholder={`${requiredBid.toLocaleString()} ${higherIsBetter ? '以上' : '以下'}`}
            className="w-full bg-surface-card border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
          />
          {bid !== '' && !bidValid && (
            <p className="mt-1 text-xs text-red-400">
              {higherIsBetter
                ? `最低取引価格以上かつ現在価格（${current.toLocaleString()}）より高い額を入力してください。`
                : `最高取引価格以下かつ現在価格（${current.toLocaleString()}）より安い額を入力してください。`}
            </p>
          )}
          {listing.buyout_price != null && (
            <p className="mt-1 text-xs text-gray-500">
              即決価格（{listing.buyout_price.toLocaleString()}）{higherIsBetter ? '以上' : '以下'}で入札すると即時成立します。
            </p>
          )}
        </div>
      )}

      {/* 希望時間帯（オークションは入札のみのため非表示） */}
      {!isAuction && (
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">希望時間帯</label>
        <div className="grid grid-cols-2 gap-1.5">
          {TIME_SLOTS.map((t) => (
            <label
              key={t}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                timeSlot === t
                  ? 'border-primary-500/60 bg-primary-500/10 text-white'
                  : 'border-surface-border text-gray-400 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="timeslot"
                value={t}
                checked={timeSlot === t}
                onChange={() => setTimeSlot(t)}
                className="accent-primary-500"
              />
              {t}
            </label>
          ))}
        </div>
      </div>
      )}

      {/* 備考 */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">備考（任意）</label>
        <input
          type="text"
          placeholder="例: 急ぎません、ゆっくりどうぞ"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full bg-surface-card border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
        />
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-white px-4 py-2 rounded transition-colors">
          キャンセル
        </button>
        <button
          onClick={handleSubmit}
          disabled={!server || loading || Boolean(needsChar && !newCharName.trim()) || (isAuction && !bidValid)}
          className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-5 py-2 rounded-md transition-colors"
        >
          {loading ? '送信中...' : isAuction ? '入札する' : '取引を希望する'}
        </button>
      </div>
    </div>
  )
}
