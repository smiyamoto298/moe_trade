import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TermsModal from './TermsModal'

// design.md「利用規約同意フロー」: 規約全文（第1〜6条）をモーダルで表示し、
// 「同意する」「同意しない」のコールバックを呼び分ける。

describe('TermsModal', () => {
  it('利用規約の全条文（第1〜6条）をダイアログとして表示する', () => {
    render(<TermsModal onAgree={() => {}} onDecline={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('利用規約')).toBeInTheDocument()
    for (const heading of [
      '第1条（適用）',
      '第2条（アカウント登録）',
      '第3条（取引について）',
      '第4条（禁止事項）',
      '第5条（免責事項）',
      '第6条（規約の変更）',
    ]) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
  })

  it('「同意する」で onAgree が呼ばれる', async () => {
    const onAgree = vi.fn()
    const onDecline = vi.fn()
    render(<TermsModal onAgree={onAgree} onDecline={onDecline} />)
    await userEvent.click(screen.getByRole('button', { name: '同意する' }))
    expect(onAgree).toHaveBeenCalledTimes(1)
    expect(onDecline).not.toHaveBeenCalled()
  })

  it('「同意しない」で onDecline が呼ばれる', async () => {
    const onAgree = vi.fn()
    const onDecline = vi.fn()
    render(<TermsModal onAgree={onAgree} onDecline={onDecline} />)
    await userEvent.click(screen.getByRole('button', { name: '同意しない' }))
    expect(onDecline).toHaveBeenCalledTimes(1)
    expect(onAgree).not.toHaveBeenCalled()
  })
})
