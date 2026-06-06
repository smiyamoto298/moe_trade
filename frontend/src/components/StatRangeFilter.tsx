import type { StatRange } from '../types'

interface RangeItem {
  key: string
  label: string
}

interface Props {
  title: string
  items: RangeItem[]
  ranges: Record<string, StatRange>
  onChange: (key: string, range: StatRange) => void
}

export default function StatRangeFilter({ title, items, ranges, onChange }: Props) {
  if (items.length === 0) return null

  const set = (key: string, side: 'min' | 'max', raw: string) => {
    const val = raw === '' ? undefined : Number(raw)
    onChange(key, { ...ranges[key], [side]: val })
  }

  return (
    <div className="bg-surface-card border border-primary-500/30 rounded-lg px-5 py-4">
      <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-3">
        {title} — 数値絞り込み
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {items.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <p className="text-xs text-gray-400">{label}</p>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="最小"
                value={ranges[key]?.min ?? ''}
                onChange={(e) => set(key, 'min', e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
              />
              <span className="text-gray-600 shrink-0 text-xs">〜</span>
              <input
                type="number"
                placeholder="最大"
                value={ranges[key]?.max ?? ''}
                onChange={(e) => set(key, 'max', e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
