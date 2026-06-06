import { useState } from 'react'
import { chatApi } from '../api/chat'
import { charactersApi } from '../api/characters'
import { useAuth } from '../contexts/AuthContext'
import type { Listing, Server } from '../types'
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
  listing: Listing
  onComplete: () => void
  onCancel: () => void
}

export default function TradeRequestPanel({ listing, onComplete, onCancel }: Props) {
  const { user, refresh } = useAuth()
  const [server, setServer] = useState<Server | ''>('')
  const [timeSlot, setTimeSlot] = useState('いつでも')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [newCharName, setNewCharName] = useState('')

  // 選択サーバーに自分のキャラクターが登録済みか
  const myChar = server ? user?.characters?.find((c) => c.server === server) : null
  const needsChar = server && !myChar

  const handleServerChange = (s: Server) => {
    setServer(s)
    setNewCharName('')
  }

  const handleSubmit = async () => {
    if (!server) return
    if (needsChar && !newCharName.trim()) return
    setLoading(true)
    try {
      // キャラクター未登録なら先に登録
      if (needsChar && newCharName.trim()) {
        await charactersApi.upsert(server, newCharName.trim())
        await refresh()
      }
      const res = await chatApi.getOrCreate(listing.id, server)
      const lines = [
        `【取引希望】`,
        `サーバー: ${server}`,
        `希望時間帯: ${timeSlot}`,
        ...(note ? [`備考: ${note}`] : []),
      ]
      await chatApi.sendMessage(res.data.id, lines.join('\n'))
      onComplete()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-primary-500/30 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">取引を希望する</p>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-white">✕</button>
      </div>

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

      {/* 希望時間帯 */}
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

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-white px-4 py-2 rounded transition-colors">
          キャンセル
        </button>
        <button
          onClick={handleSubmit}
          disabled={!server || loading || Boolean(needsChar && !newCharName.trim())}
          className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-5 py-2 rounded-md transition-colors"
        >
          {loading ? '送信中...' : '取引を希望する'}
        </button>
      </div>
    </div>
  )
}
