// 操作案内ツアーの型定義
// 案内文の中身は content.ts を編集してください。

export type TourStep = {
  /**
   * ハイライト対象の CSS セレクタ。
   * 各ページの要素に付けた data-tour 属性を指定します（例: '[data-tour="listings-modes"]'）。
   * 省略 / 空文字の場合は、画面中央にカード表示します（導入ステップなどに便利）。
   */
  target?: string
  /** 吹き出しの見出し */
  title: string
  /** 説明文（1〜2文を推奨） */
  body: string
  /** 吹き出しを対象の上下どちらに出すか。省略時は自動。 */
  placement?: 'top' | 'bottom' | 'auto'
  /** 吹き出しの幅(px)。省略時は 320。広い説明を入れたいステップで指定します。 */
  width?: number
  /**
   * 吹き出し内に表示する画像のURL/パス。省略可。
   * public フォルダに置いた画像は '/guide/sample.png' のように指定します。
   * 外部URL（'https://...'）も指定できます。
   */
  image?: string
  /** 画像の代替テキスト（読み上げ・読み込み失敗時に表示）。省略可。 */
  imageAlt?: string
}

export type PageTour = {
  /** 既読管理に使うページID（content.ts のキーと一致させる） */
  pageId: string
  /**
   * 案内内容の版番号。内容を更新して「もう一度全員に見せたい」ときは数字を上げると、
   * 初回自動表示がリセットされます。
   */
  version: number
  steps: TourStep[]
}
