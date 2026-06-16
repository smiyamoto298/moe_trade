import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import HashtagList from './HashtagList'
import type { ItemHashtag } from '../types'

const tags: ItemHashtag[] = [
  { id: 1, tag: '公式', is_fixed: true },
  { id: 2, tag: 'おすすめ', is_fixed: false },
]

describe('HashtagList', () => {
  it('固定タグは📌付きで、通常タグはそのまま # 表示する', () => {
    render(<HashtagList hashtags={tags} />)
    expect(screen.getByText(/公式/)).toHaveTextContent('📌#公式')
    expect(screen.getByText('#おすすめ')).toBeInTheDocument()
  })

  it('タグが無ければ何も描画しない', () => {
    const { container } = render(<HashtagList hashtags={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
