import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import CustomStatsEditor from './CustomStatsEditor'
import { mergeBaseStats, type CustomStatRow } from '../utils/customStats'

// design.md「その他（自由入力の追加効果）」: 値は行ごとに「数値 / テキスト」を選べる。
// テキストは文字列のまま base_stats に保存され、数値へ戻したとき数値にできない値は残さない。

function Harness({ initial = [] as CustomStatRow[] }) {
  const [rows, setRows] = useState<CustomStatRow[]>(initial)
  return (
    <div>
      <CustomStatsEditor idPrefix="t" rows={rows} onChange={setRows} labelOptions={['釣り']} />
      <output data-testid="merged">{JSON.stringify(mergeBaseStats({}, rows))}</output>
    </div>
  )
}

describe('CustomStatsEditor', () => {
  it('既定は数値入力で、テキストを選ぶとテキスト入力に切り替わる', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '+ その他の項目を追加' }))
    expect(screen.getByLabelText('その他の項目 1 の値')).toHaveAttribute('type', 'number')

    await user.selectOptions(screen.getByLabelText('その他の項目 1 の値の種別'), 'text')
    expect(screen.getByLabelText('その他の項目 1 の値')).toHaveAttribute('type', 'text')
    expect(screen.getByPlaceholderText('テキスト')).toBeInTheDocument()
  })

  it('テキストの値は文字列のまま base_stats へマージされる', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ label: '発動条件', value: '', kind: 'text' }]} />)

    await user.type(screen.getByLabelText('その他の項目 1 の値'), '水中のみ')

    expect(screen.getByTestId('merged')).toHaveTextContent('{"発動条件":"水中のみ"}')
  })

  it('数値の値は数値として base_stats へマージされる', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ label: '釣り', value: '', kind: 'number' }]} />)

    await user.type(screen.getByLabelText('その他の項目 1 の値'), '5')

    expect(screen.getByTestId('merged')).toHaveTextContent('{"釣り":5}')
  })

  it('テキスト→数値へ戻すとき数値にできない値はクリアする', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ label: '発動条件', value: '水中のみ', kind: 'text' }]} />)

    await user.selectOptions(screen.getByLabelText('その他の項目 1 の値の種別'), 'number')

    expect(screen.getByLabelText('その他の項目 1 の値')).toHaveValue(null)
    expect(screen.getByTestId('merged')).toHaveTextContent('{}')
  })

  it('テキスト→数値で数値にできる値はそのまま残す', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ label: '釣り', value: '12', kind: 'text' }]} />)

    await user.selectOptions(screen.getByLabelText('その他の項目 1 の値の種別'), 'number')

    expect(screen.getByTestId('merged')).toHaveTextContent('{"釣り":12}')
  })
})
