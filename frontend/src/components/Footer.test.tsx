import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Footer from './Footer'

// design.md「公式ガイドライン対応」: MoE ファンサイトガイドラインの必須要件を守る。
//  - 権利表記（指定文言）をフッターの目立つ箇所に常時表示すること
//  - 公式サイトへのリンクは必ずトップページ https://moepic.com/ に向けること

const renderFooter = () =>
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>
  )

describe('Footer', () => {
  it('ガイドライン指定の権利表記を表示する', () => {
    renderFooter()
    expect(
      screen.getByText(
        '(C)MOE K.K. (C)Konami Digital Entertainment 株式会社MOE及び株式会社コナミデジタルエンタテインメントの著作権を侵害する行為は禁止されています。'
      )
    ).toBeInTheDocument()
  })

  it('公式サイトへのリンクはトップページ（https://moepic.com/）に向ける', () => {
    renderFooter()
    const officialLinks = screen
      .getAllByRole('link')
      .filter((a) => a.textContent?.includes('Master of Epic 公式サイト') || a.querySelector('img'))
    expect(officialLinks.length).toBeGreaterThan(0)
    for (const link of officialLinks) {
      expect(link).toHaveAttribute('href', 'https://moepic.com/')
    }
  })
})
