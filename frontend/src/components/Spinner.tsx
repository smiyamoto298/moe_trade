interface Props {
  /** スピナー下に表示するテキスト（null で非表示） */
  label?: string | null
  /** ページ中央に大きめに表示する（縦 60vh の中央寄せ） */
  center?: boolean
  /** サイズ（px）。center 指定時は無視され大きめ固定 */
  size?: number
}

export default function Spinner({ label = '読み込み中...', center = false, size = 24 }: Props) {
  if (center) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-surface-border border-t-primary-500 rounded-full animate-spin" />
        {label && <p className="text-sm text-gray-400">{label}</p>}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <div
        className="border-4 border-surface-border border-t-primary-500 rounded-full animate-spin"
        style={{ width: size, height: size }}
      />
      {label && <p className="text-xs text-gray-400">{label}</p>}
    </div>
  )
}
