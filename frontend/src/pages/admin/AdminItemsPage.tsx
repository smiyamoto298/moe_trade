import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { itemsApi } from '../../api/items'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/Spinner'
import type { Item, ItemCategory } from '../../types'
import { SPECIAL_CONDITIONS, BASE_STAT_LABELS } from '../../utils/constants'

type Filter = 'all' | 'unverified' | 'verified'
type Mode = 'equipment' | 'skill'

export default function AdminItemsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<ItemCategory[]>([])
  const [mode, setMode] = useState<Mode>('equipment')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [mastersLoading, setMastersLoading] = useState(true)

  const isAdmin = user?.role === 'admin'
  const isSkillMode = mode === 'skill'
  const [actioningId, setActioningId] = useState<number | null>(null)

  // 「スキル」親カテゴリ配下のカテゴリIDセット
  const skillCategoryIds = (() => {
    const skillParent = categories.find((c) => c.parent_id === null && c.name === 'スキル')
    if (!skillParent) return new Set<number>()
    const ids = new Set<number>([skillParent.id])
    ;(skillParent.children ?? []).forEach((c) => ids.add(c.id))
    return ids
  })()

  const fetchItems = () => {
    setLoading(true)
    itemsApi.list({ name: search || undefined })
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setMastersLoading(true)
    itemsApi.categories()
      .then((r) => setCategories(r.data))
      .finally(() => setMastersLoading(false))
  }, [])

  useEffect(() => { fetchItems() }, [search])

  const handleVerify = async (id: number) => {
    if (actioningId) return
    setActioningId(id)
    try {
      await itemsApi.verify(id)
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, verified_status: 'verified' } : i))
    } finally {
      setActioningId(null)
    }
  }

  const handleDelete = async (item: Item) => {
    if (actioningId) return
    if (!confirm(`「${item.name}」を削除しますか？`)) return
    setActioningId(item.id)
    try {
      await itemsApi.delete(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } finally {
      setActioningId(null)
    }
  }

  // スキル/装備品モードで絞り込み
  const modeItems = items.filter((i) =>
    isSkillMode ? skillCategoryIds.has(i.category.id) : !skillCategoryIds.has(i.category.id)
  )

  const filtered = modeItems.filter((i) => {
    if (filter === 'unverified') return i.verified_status === 'unverified'
    if (filter === 'verified') return i.verified_status === 'verified'
    return true
  })

  const unverifiedCount = modeItems.filter((i) => i.verified_status === 'unverified').length

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">アイテム管理</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {user?.role === 'admin' ? '管理者' : '編集者'}権限
            </p>
          </div>
          <div className="flex border border-surface-border rounded-lg overflow-hidden text-sm">
            <button
              onClick={() => { setMode('equipment'); setFilter('all') }}
              className={`px-4 py-1.5 transition-colors ${!isSkillMode ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              装備品
            </button>
            <button
              onClick={() => { setMode('skill'); setFilter('all') }}
              className={`px-4 py-1.5 transition-colors ${isSkillMode ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              スキル
            </button>
          </div>
        </div>
        <Link
          to="/admin/items/new"
          className="bg-primary-500 hover:bg-primary-600 text-white text-sm px-4 py-2 rounded-md transition-colors"
        >
          + アイテムを追加
        </Link>
      </div>

      {mastersLoading ? (
        <Spinner center />
      ) : (
      <>
      {/* フィルター・検索 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md overflow-hidden border border-surface-border">
          {(['all', 'unverified', 'verified'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                filter === f ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {f === 'all' ? `すべて (${modeItems.length})` : f === 'unverified' ? `未確認 (${unverifiedCount})` : `確認済み (${modeItems.length - unverifiedCount})`}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="アイテム名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-56"
        />
      </div>

      {/* テーブル */}
      <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">アイテム名</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">種別</th>
              {isSkillMode ? (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider" colSpan={3}>必要スキル</th>
              ) : (
                <>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">追加効果</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">付加効果</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">特殊条件</th>
                </>
              )}
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">状態</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-500">読み込み中...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-500">アイテムが見つかりません</td></tr>
            ) : (
              filtered.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-surface-border/30 transition-colors ${item.verified_status === 'unverified' ? 'bg-yellow-900/5' : ''}`}
                >
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{item.name}</p>
                    {item.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{item.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{item.category.name}</td>
                  {isSkillMode ? (
                    <td className="px-4 py-3" colSpan={3}>
                      <div className="flex flex-wrap gap-1">
                        {!item.skill_requirements || Object.keys(item.skill_requirements).length === 0 ? (
                          <span className="text-xs text-gray-600">—</span>
                        ) : Object.entries(item.skill_requirements).map(([skill, v]) => (
                          <span key={skill} className="text-xs bg-surface border border-surface-border text-gray-300 px-1.5 py-0.5 rounded">
                            {skill}: <span className="text-white font-medium">{v}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  ) : (
                  <>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(item.base_stats).map(([k, v]) => (
                        <span key={k} className="text-xs bg-surface text-gray-300 px-1.5 py-0.5 rounded">
                          {BASE_STAT_LABELS[k] ?? k}: {v}
                        </span>
                      ))}
                      {item.mithril && (
                        <span className="text-xs bg-slate-700/40 border border-slate-400/40 text-slate-200 px-1.5 py-0.5 rounded">
                          ミスリル
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {item.bonus_effects.length === 0 ? (
                        <span className="text-xs text-gray-600">—</span>
                      ) : item.bonus_effects.map((e) => (
                        <div key={e.id} className="text-xs bg-surface border border-primary-500/20 rounded px-2 py-1">
                          <p className="text-primary-500 font-medium">{e.effect_name}</p>
                          {e.values?.map((v, i) => (
                            <p key={i} className="text-gray-400 whitespace-nowrap">
                              {v.label && <span>{v.label}：</span>}
                              <span className="text-gray-200">{v.value}{v.value_unit === '%' ? '%' : v.value_unit === 'x' ? '倍' : v.value_unit === 'per_min' ? '/min' : ''}</span>
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.special_conditions.map((c) => (
                        <span key={c} title={SPECIAL_CONDITIONS[c]} className="text-xs bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded border border-red-700/30">
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  </>
                  )}
                  <td className="px-4 py-3">
                    {item.verified_status === 'verified' ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">✓ 確認済み</span>
                    ) : (
                      <span className="text-xs text-yellow-400 flex items-center gap-1">⚠ 未確認</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {item.verified_status === 'unverified' && (
                        <button
                          onClick={() => handleVerify(item.id)}
                          disabled={actioningId === item.id}
                          className="text-xs bg-emerald-900/40 hover:bg-emerald-900/70 disabled:opacity-50 border border-emerald-700/50 text-emerald-300 px-2 py-1 rounded transition-colors"
                        >
                          {actioningId === item.id ? '処理中...' : '確認済みにする'}
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/admin/items/${item.id}/edit`)}
                        className="text-xs bg-surface hover:bg-surface-border border border-surface-border text-gray-300 px-2 py-1 rounded transition-colors"
                      >
                        編集
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(item)}
                          disabled={actioningId === item.id}
                          className="text-xs bg-red-900/30 hover:bg-red-900/60 disabled:opacity-50 border border-red-700/30 text-red-400 px-2 py-1 rounded transition-colors"
                        >
                          {actioningId === item.id ? '処理中...' : '削除'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  )
}
