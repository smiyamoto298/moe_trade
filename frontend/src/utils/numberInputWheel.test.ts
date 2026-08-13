import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { installNumberInputWheelBlocker } from './numberInputWheel'

// サイト全体の数値入力欄で、ホイール操作による値の増減を無効化するグローバルリスナーのテスト。
// jsdom は wheel による数値増減（ブラウザのデフォルトアクション）自体は再現しないため、
// 「値が変わらない」ことの代わりに、その実現手段である「フォーカス中の数値入力欄が blur される」ことを検証する。
describe('installNumberInputWheelBlocker', () => {
  beforeAll(() => {
    installNumberInputWheelBlocker(document)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  function renderInput(type: string): HTMLInputElement {
    const input = document.createElement('input')
    input.type = type
    document.body.appendChild(input)
    return input
  }

  function wheelOn(element: Element) {
    element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }))
  }

  it('フォーカス中の数値入力欄の上でホイールすると blur され、値の増減が起きない', () => {
    const input = renderInput('number')
    input.focus()
    expect(document.activeElement).toBe(input)

    wheelOn(input)

    expect(document.activeElement).not.toBe(input)
  })

  it('フォーカスしていない数値入力欄の上でのホイールでは、他要素のフォーカスを奪わない', () => {
    const number = renderInput('number')
    const text = renderInput('text')
    text.focus()

    wheelOn(number)

    expect(document.activeElement).toBe(text)
  })

  it('数値以外の入力欄はフォーカス中にホイールしても blur されない', () => {
    const text = renderInput('text')
    text.focus()

    wheelOn(text)

    expect(document.activeElement).toBe(text)
  })
})
