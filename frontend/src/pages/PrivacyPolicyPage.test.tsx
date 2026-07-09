import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PrivacyPolicyPage from './PrivacyPolicyPage'

// design.md「プライバシーポリシー（個人情報保護法対応）」:
// 公開ページ（/privacy）で、個人情報保護法の公表事項
// （取得情報・利用目的・安全管理措置・第三者提供・開示等請求の窓口）を表示する。

describe('PrivacyPolicyPage', () => {
  it('個人情報保護法の公表事項（全10章）を表示する', () => {
    render(<PrivacyPolicyPage />)
    expect(
      screen.getByRole('heading', { name: 'プライバシーポリシー' })
    ).toBeInTheDocument()
    for (const heading of [
      '1. 基本方針',
      '2. 取得する情報と取得方法',
      '3. 利用目的',
      '4. 安全管理措置',
      '5. 第三者提供',
      '6. 委託',
      '7. Cookie・ローカルストレージ等について',
      '8. 開示・訂正・利用停止・削除等の請求（退会を含む）',
      '9. お問い合わせ窓口',
      '10. 本ポリシーの改定',
    ]) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
  })

  it('メールアドレスの平文非保存（安全管理措置の要点）を明記する', () => {
    render(<PrivacyPolicyPage />)
    expect(
      screen.getByText(/HMAC-SHA256による不可逆のブラインドインデックス方式/)
    ).toBeInTheDocument()
  })
})
