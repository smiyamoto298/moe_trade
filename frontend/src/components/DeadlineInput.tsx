/**
 * オークション期限日の入力。
 *
 * 自由入力の datetime-local だと1分単位で入力でき（解決バッチは15分ごと）分かりにくいため、
 * 「日付ピッカー」＋「15分刻みの時刻プルダウン」に分けて、15分単位だけを選べるようにする。
 * value / onChange は datetime-local 互換の "YYYY-MM-DDTHH:mm" 文字列で扱う
 * （日付・時刻の片方だけ入力中は空文字を返す）。
 */
import { useEffect, useState } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  /** 選択可能な最小日付（"YYYY-MM-DD"）。未指定なら今日。 */
  minDate?: string
}

// 00:00〜23:45 の15分刻みの時刻候補
const TIME_OPTIONS: string[] = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4)
  const m = (i % 4) * 15
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

const todayStr = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const splitDate = (v: string) => v.split('T')[0] ?? ''
const splitTime = (v: string) => (v.split('T')[1] ?? '').slice(0, 5)

// 今日を選んだ場合に選べる最小の時刻（現在より後の次の15分マーク "HH:mm"）。過去時刻を選べないようにする。
const nextQuarterToday = (): string => {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() - (d.getMinutes() % 15) + 15) // 現在の15分ブロックの「次」へ進める
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function DeadlineInput({ value, onChange, minDate }: Props) {
  // 日付・時刻を片方ずつ選べるよう内部状態で保持する（片方だけ入力中も保持し、両方揃ったら親へ通知）。
  const [date, setDate] = useState(() => splitDate(value))
  const [time, setTime] = useState(() => splitTime(value))

  // 外部から value が変わったとき（フォームのリセット等）は内部状態を同期する。
  useEffect(() => {
    setDate(splitDate(value))
    setTime(splitTime(value))
  }, [value])

  const update = (d: string, t: string) => {
    setDate(d)
    setTime(t)
    // 日付・時刻の両方が揃ったときだけ完全な値を返す（未入力は空文字）
    onChange(d && t ? `${d}T${t}` : '')
  }

  // 今日を選んでいるときは過去の時刻を選べないようにする（最小は次の15分マーク）。
  const minToday = date === todayStr() ? nextQuarterToday() : ''
  const timeOptions = minToday ? TIME_OPTIONS.filter((t) => t >= minToday) : TIME_OPTIONS

  return (
    <div className="flex gap-2">
      <input
        type="date"
        value={date}
        min={minDate ?? todayStr()}
        onChange={(e) => update(e.target.value, time)}
        className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
      />
      <select
        value={time}
        onChange={(e) => update(date, e.target.value)}
        className="w-28 bg-surface border border-surface-border rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
      >
        <option value="">時刻</option>
        {timeOptions.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  )
}
