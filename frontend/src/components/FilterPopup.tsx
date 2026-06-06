import { useEffect, useRef, useState } from 'react'

export interface FilterOption {
  value: string
  label: string
  group?: string
}

interface Props {
  title: string
  options: FilterOption[]
  selected: string[]
  onChange: (values: string[]) => void
  searchable?: boolean
}

export default function FilterPopup({ title, options, selected, onChange, searchable = false }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // 外側クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (value: string) => {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
    )
  }

  const filtered = query
    ? options.filter((o) => o.label.includes(query) || o.value.includes(query))
    : options

  // グループ分け
  const groups = filtered.reduce<Record<string, FilterOption[]>>((acc, o) => {
    const g = o.group ?? ''
    ;(acc[g] = acc[g] ?? []).push(o)
    return acc
  }, {})

  return (
    <div ref={ref} className="relative">
      {/* トリガーボタン */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded border text-sm transition-colors ${
          selected.length > 0
            ? 'border-primary-500 bg-primary-500/10 text-white'
            : 'border-surface-border bg-surface text-gray-300 hover:border-gray-500'
        }`}
      >
        <span className="font-medium">{title}</span>
        <span className="flex items-center gap-1.5">
          {selected.length > 0 && (
            <span className="bg-primary-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {selected.length}
            </span>
          )}
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {/* 選択済みタグ */}
      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.map((val) => {
            const opt = options.find((o) => o.value === val)
            if (!opt) return null
            return (
              <span
                key={val}
                className="inline-flex items-center gap-1 bg-primary-500/20 border border-primary-500/40 text-primary-500 text-xs px-2 py-0.5 rounded-full"
              >
                {opt.label}
                <button type="button" onClick={() => toggle(val)} className="hover:text-white">
                  ×
                </button>
              </span>
            )
          })}
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            クリア
          </button>
        </div>
      )}

      {/* ポップアップ */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-surface-card border border-surface-border rounded-lg shadow-xl overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-surface-border">
              <input
                autoFocus
                type="text"
                placeholder="絞り込み..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                {group && (
                  <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {group}
                  </p>
                )}
                {items.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-border cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(opt.value)}
                      onChange={() => toggle(opt.value)}
                      className="accent-primary-500 w-4 h-4 shrink-0"
                    />
                    <span className="text-sm text-gray-200">{opt.label}</span>
                  </label>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-500 text-center">該当なし</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
