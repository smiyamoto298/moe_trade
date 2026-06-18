// useGoBackOr — 登録完了後に「元居た画面」へ戻る遷移のテスト。
// アプリ内履歴があれば1つ戻り、戻り先が無ければ fallback へ遷移することを確認する。
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useGoBackOr } from './useGoBackOr'

// 現在のパスを表示しつつ、ボタン押下で goBack を実行する画面。
function FormPage() {
  const goBack = useGoBackOr('/mypage')
  return (
    <div>
      <span data-testid="path">/form</span>
      <button onClick={() => goBack()}>back</button>
    </div>
  )
}

function PageWithPath({ label }: { label: string }) {
  const loc = useLocation()
  return <span data-testid="path">{label}:{loc.pathname}</span>
}

function App({ initialEntries }: { initialEntries: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/source"
          element={
            <div>
              <PageWithPath label="source" />
              <Link to="/form">go form</Link>
            </div>
          }
        />
        <Route path="/form" element={<FormPage />} />
        <Route path="/mypage" element={<PageWithPath label="mypage" />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('useGoBackOr', () => {
  it('アプリ内で遷移してきた場合は元居た画面に戻る', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    // /source から /form へ遷移 → goBack で /source に戻る
    render(<App initialEntries={['/source']} />)
    await user.click(screen.getByText('go form'))
    expect(screen.getByTestId('path')).toHaveTextContent('/form')
    await user.click(screen.getByText('back'))
    expect(screen.getByTestId('path')).toHaveTextContent('source:/source')
  })

  it('直リンク等で戻り先が無い場合は fallback へ遷移する', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    // /form を直接開く（履歴なし） → goBack で /mypage へ
    render(<App initialEntries={['/form']} />)
    await user.click(screen.getByText('back'))
    expect(screen.getByTestId('path')).toHaveTextContent('mypage:/mypage')
  })
})
