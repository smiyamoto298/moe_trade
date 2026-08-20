import type { ListDisplayMode } from '../utils/listDisplayStore'

// 出品一覧・買取一覧の表示モード切替（詳細 / シンプル）。
// 選択は端末ローカルに保存するため、保存自体は呼び出し側の onChange で行う。
export default function ListDisplayToggle({
  mode,
  onChange,
}: {
  mode: ListDisplayMode
  onChange: (mode: ListDisplayMode) => void
}) {
  const base = 'px-2.5 py-1 transition-colors whitespace-nowrap'
  const on = 'bg-primary-500 text-white'
  const off = 'text-gray-400 hover:text-white'
  return (
    <div
      data-tour="list-display-mode"
      role="group"
      aria-label="表示モード"
      className="flex border border-surface-border rounded-md overflow-hidden text-xs"
    >
      <button
        type="button"
        aria-pressed={mode === 'detailed'}
        onClick={() => onChange('detailed')}
        className={`${base} ${mode === 'detailed' ? on : off}`}
      >
        詳細
      </button>
      <button
        type="button"
        aria-pressed={mode === 'compact'}
        onClick={() => onChange('compact')}
        title="アイテム名・取引可能サーバー・価格・操作だけを表示します"
        className={`${base} ${mode === 'compact' ? on : off}`}
      >
        シンプル
      </button>
    </div>
  )
}
