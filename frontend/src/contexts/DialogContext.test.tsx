import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DialogProvider, useDialog } from './DialogContext'

// design.md「本番データのローカル取込」: 確認ダイアログの code オプションで
// SSHトンネル起動コマンド等をコピー可能な等幅ブロックとして表示する。

const CMD = 'ssh -N -L 13306:db.example:3306 user@example'

function Caller({ onResult }: { onResult: (v: boolean) => void }) {
  const { confirm } = useDialog()
  return (
    <button
      onClick={async () =>
        onResult(
          await confirm('取り込みます。', {
            title: '本番データ取込',
            code: CMD,
            confirmLabel: '取り込む',
          })
        )
      }
    >
      open
    </button>
  )
}

const renderAndOpen = (onResult: (v: boolean) => void = () => {}) => {
  render(
    <DialogProvider>
      <Caller onResult={onResult} />
    </DialogProvider>
  )
  fireEvent.click(screen.getByText('open'))
}

describe('DialogContext code オプション', () => {
  it('code に渡したコマンドを等幅ブロックで表示する', () => {
    renderAndOpen()
    expect(screen.getByText(CMD)).toBeInTheDocument()
    expect(screen.getByText(CMD).tagName).toBe('PRE')
  })

  it('コピーでクリップボードへ書き込み「コピー済み」表示に変わる', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    try {
      renderAndOpen()
      fireEvent.click(screen.getByText('コピー'))
      await waitFor(() => expect(screen.getByText('コピー済み')).toBeInTheDocument())
      expect(writeText).toHaveBeenCalledWith(CMD)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('確認ボタンで true、キャンセルで false を返す（code 指定時も通常動作）', async () => {
    const onResult = vi.fn()
    renderAndOpen(onResult)
    fireEvent.click(screen.getByText('取り込む'))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true))

    fireEvent.click(screen.getByText('open'))
    fireEvent.click(screen.getByText('キャンセル'))
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(false))
  })
})
