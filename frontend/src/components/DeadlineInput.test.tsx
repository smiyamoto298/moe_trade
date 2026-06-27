import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DeadlineInput from './DeadlineInput'

// オークション期限日の入力は「日付ピッカー＋15分刻みの時刻プルダウン」で、
// 時刻は15分単位のみ選べる（自由入力で1分単位にならない）ことを固定する。

describe('DeadlineInput', () => {
  it('時刻プルダウンは15分刻み（00:00〜23:45）の96択のみ', () => {
    render(<DeadlineInput value="" onChange={() => {}} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    // 先頭のプレースホルダ「時刻」を除いた選択肢
    const values = [...select.options].map((o) => o.value).filter((v) => v !== '')
    expect(values).toHaveLength(96)
    expect(values[0]).toBe('00:00')
    expect(values[1]).toBe('00:15')
    expect(values.at(-1)).toBe('23:45')
    // 1分単位の値（例 14:37）は選択肢に存在しない
    expect(values).not.toContain('14:37')
    // すべて分は 00/15/30/45 のいずれか
    expect(values.every((v) => ['00', '15', '30', '45'].includes(v.slice(3)))).toBe(true)
  })

  it('日付と時刻が揃うと "YYYY-MM-DDTHH:mm" を返す', () => {
    const onChange = vi.fn()
    const { container } = render(<DeadlineInput value="" onChange={onChange} />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement

    // 日付を選ぶ（まだ時刻が無いので空文字）
    fireEvent.change(dateInput, { target: { value: '2026-06-30' } })
    expect(onChange).toHaveBeenLastCalledWith('')
    // 時刻を選ぶ → 結合値が返る
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '14:45' } })
    expect(onChange).toHaveBeenLastCalledWith('2026-06-30T14:45')
  })

  it('今日を選ぶと過去の時刻は選べない（現在より後の15分マーク以降のみ）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 26, 14, 12, 0)) // 2026-06-26 14:12（ローカル）
    try {
      const { container } = render(<DeadlineInput value="" onChange={() => {}} />)
      const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2026-06-26' } }) // 今日
      const values = [...(screen.getByRole('combobox') as HTMLSelectElement).options]
        .map((o) => o.value).filter((v) => v !== '')
      expect(values[0]).toBe('14:15')          // 14:12 の次の15分
      expect(values).not.toContain('14:00')    // 過去は除外
      expect(values).not.toContain('00:00')
    } finally {
      vi.useRealTimers()
    }
  })

  it('既存値を日付・時刻に分解して表示する', () => {
    const { container } = render(<DeadlineInput value="2026-06-30T09:15" onChange={() => {}} />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput.value).toBe('2026-06-30')
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('09:15')
  })
})
