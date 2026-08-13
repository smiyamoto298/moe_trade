// 数値入力欄 (input[type="number"]) のホイール操作による値の増減をサイト全体で無効化する。
//
// ブラウザ標準では、フォーカス中の数値入力欄の上でホイールすると値が増減してしまい、
// ページをスクロールしたいだけのユーザーが意図せず入力値を変えてしまう事故が起きる。
// document へのグローバルリスナー1本で対応し、各コンポーネント側の変更は不要にする。
//
// 方式: フォーカス中の数値入力欄の上で wheel が発生したら blur する。
// ブラウザの値増減（デフォルトアクション）はイベントディスパッチ後に「フォーカス中か」で
// 判定されるため、リスナー内で blur すれば値は変わらない。preventDefault と違い
// passive リスナーのままでよく、ページのスクロール自体も妨げない。
export function installNumberInputWheelBlocker(doc: Document = document): void {
  doc.addEventListener(
    'wheel',
    (event) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement &&
        target.type === 'number' &&
        target === doc.activeElement
      ) {
        target.blur()
      }
    },
    { capture: true, passive: true },
  )
}
