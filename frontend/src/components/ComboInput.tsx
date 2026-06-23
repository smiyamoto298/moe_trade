import { useState, useRef, useEffect } from 'react'

interface Props {
  id: string
  value: string
  onChange: (val: string) => void
  options: string[]
  placeholder?: string
  className?: string
}

/**
 * 候補付きテキスト入力。
 *
 * 以前はネイティブ <datalist> を使っていたが、候補名が日本語のため
 * IME 変換中に候補を選ぶと「選択した候補＋変換中の未確定文字」が連結される
 * ブラウザ既知の不具合があった。選択を自前ドロップダウンの onClick で明示的に
 * 確定することで、IME の状態に依存せず確実に置換する。
 */
export default function ComboInput({ id, value, onChange, options, placeholder, className }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const composingRef = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 入力値で候補を絞り込む（空なら全件）。大小文字は無視。
  const q = value.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const select = (opt: string) => {
    onChange(opt)
    setOpen(false)
    setActive(-1)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        onKeyDown={(e) => {
          if (composingRef.current) return // IME 変換確定の Enter 等はそのまま IME に渡す
          if (e.key === 'ArrowDown') {
            e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, filtered.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault(); setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            if (open && active >= 0 && active < filtered.length) { e.preventDefault(); select(filtered[active]) }
          } else if (e.key === 'Escape') {
            setOpen(false); setActive(-1)
          }
        }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
      />
      {open && filtered.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded border border-surface-border bg-surface shadow-lg"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={i === active}
              // mousedown で input の blur より前に確定する（onClick だと blur で閉じてしまう）
              onMouseDown={(e) => { e.preventDefault(); select(opt) }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-2 py-1 text-sm text-white ${i === active ? 'bg-primary-500/30' : 'hover:bg-primary-500/20'}`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
