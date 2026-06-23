import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import ComboInput from './ComboInput'

// バグ修正の意図:
// 付加効果の項目名候補をネイティブ datalist で出していたため、IME 変換中に候補を選ぶと
// 「選択した候補＋変換中の未確定文字」が連結された。自前ドロップダウンの onClick で
// 明示的に確定し、選択値だけに置換されることを担保する。

function Harness({ options, initial = '' }: { options: string[]; initial?: string }) {
  const [v, setV] = useState(initial)
  return (
    <div>
      <ComboInput id="t" value={v} onChange={setV} options={options} placeholder="項目名" />
      <output data-testid="val">{v}</output>
    </div>
  )
}

describe('ComboInput', () => {
  it('候補を選ぶと入力中テキストではなく選択値だけに置換される', async () => {
    const user = userEvent.setup()
    render(<Harness options={['物理ダメージ', '魔法ダメージ', '命中']} />)

    await user.type(screen.getByPlaceholderText('項目名'), '物理')
    // 絞り込まれた候補が出る
    const option = await screen.findByRole('option', { name: '物理ダメージ' })
    await user.click(option)

    expect(screen.getByTestId('val')).toHaveTextContent('物理ダメージ')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('入力でインクリメンタルに候補が絞り込まれる', async () => {
    const user = userEvent.setup()
    render(<Harness options={['物理ダメージ', '魔法ダメージ', '命中']} />)

    const input = screen.getByPlaceholderText('項目名')
    await user.type(input, 'ダメージ')

    expect(screen.getByRole('option', { name: '物理ダメージ' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '魔法ダメージ' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '命中' })).not.toBeInTheDocument()
  })

  it('自由入力（候補に無い値）もそのまま反映される', async () => {
    const user = userEvent.setup()
    render(<Harness options={['命中']} />)

    await user.type(screen.getByPlaceholderText('項目名'), '独自効果')
    expect(screen.getByTestId('val')).toHaveTextContent('独自効果')
  })
})
