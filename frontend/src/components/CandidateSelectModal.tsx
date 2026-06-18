import { useEffect, useState } from 'react'
import { itemsApi } from '../api/items'
import Spinner from './Spinner'
import { compareJa } from '../utils/collator'
import type { Item } from '../types'

interface Props {
  /** 「...」を除去した前方一致の検索キー */
  baseName: string
  /** 元の（省略された）アイテム名。見出し表示用 */
  originalName: string
  onSelect: (item: Item) => void
  /** 候補が見つからないときに新規登録へ進む（現在の検索キーワードを渡す） */
  onRegisterNew?: (keyword: string) => void
  onCancel: () => void
}

/**
 * 末尾が「...」で省略されたアイテム名から、前方一致で既存アイテムを
 * 検索して選択させるモーダル。
 */
export default function CandidateSelectModal({ baseName, originalName, onSelect, onRegisterNew, onCancel }: Props) {
  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<Item[]>([])
  const [keyword, setKeyword] = useState(baseName)

  useEffect(() => {
    let active = true
    setLoading(true)
    itemsApi
      .list({ name: keyword })
      .then((r) => {
        if (!active) return
        // 前方一致のみに絞り込む（API は部分一致のため）
        const filtered = r.data
          .filter((i) => i.name.startsWith(keyword))
          .sort((a, b) => compareJa(a.name, b.name))
        setCandidates(filtered)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [keyword])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-surface-card border border-sky-700/50 rounded-lg p-5 max-w-xl w-full my-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-sky-300">候補から既存アイテムを選択</p>
          <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-white">
            キャンセル
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-3">
          省略名「<span className="text-gray-200">{originalName}</span>」の前方一致で検索しています。
        </p>

        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="前方一致キーワード"
          className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500 mb-3"
        />

        {loading ? (
          <Spinner label="検索中..." />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            前方一致する既存アイテムが見つかりませんでした。
          </p>
        ) : (
          <ul className="divide-y divide-surface-border max-h-80 overflow-y-auto border border-surface-border rounded">
            {candidates.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="w-full text-left px-3 py-2 hover:bg-sky-900/20 transition-colors flex items-center gap-2"
                >
                  <span className="text-sm text-white flex-1">{item.name}</span>
                  <span className="text-[10px] text-gray-500">{item.category.name}</span>
                  {item.verified_status === 'unverified' && (
                    <span className="text-[10px] text-yellow-400 bg-yellow-900/30 border border-yellow-700/40 rounded px-1 py-0.5">
                      ⚠ 確認中
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 候補の有無に関わらず、新規登録へ進めるボタンを常に表示する */}
        {onRegisterNew && (
          <div className="mt-4 pt-3 border-t border-surface-border flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-gray-500">該当する既存アイテムが候補に無い場合</span>
            <button
              type="button"
              onClick={() => onRegisterNew(keyword)}
              className="text-xs bg-yellow-600/80 hover:bg-yellow-600 text-white px-3 py-1.5 rounded transition-colors"
            >
              + このアイテムを新規登録する
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
