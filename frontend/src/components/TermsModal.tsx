import TermsContent from './TermsContent'

interface Props {
  /** 「同意する」を押したとき */
  onAgree: () => void
  /** 「同意しない」を押したとき（前の画面へ戻すなど） */
  onDecline: () => void
}

/**
 * 新規登録時に表示する利用規約・プライバシーポリシーの同意モーダル。
 */
export default function TermsModal({ onAgree, onDecline }: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-title"
    >
      <div className="w-full max-w-lg bg-surface-card border border-surface-border rounded-lg shadow-2xl flex flex-col max-h-[85vh]">
        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-surface-border">
          <h2 id="terms-title" className="text-lg font-bold text-white">
            利用規約
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            ご登録の前に、以下の利用規約と
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-500 hover:underline mx-0.5"
            >
              プライバシーポリシー
            </a>
            を最後までお読みください。
          </p>
        </div>

        {/* 本文（スクロール領域） */}
        <div className="px-6 py-4 overflow-y-auto">
          <TermsContent />
          <p className="text-xs text-gray-500 pt-4">
            利用規約およびプライバシーポリシーに同意いただける場合は「同意する」を押してください。
          </p>
        </div>

        {/* フッター（ボタン） */}
        <div className="px-6 py-4 border-t border-surface-border">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onDecline}
              className="flex-1 border border-surface-border text-gray-300 hover:bg-surface-border py-2 rounded-md text-sm font-medium transition-colors"
            >
              同意しない
            </button>
            <button
              type="button"
              onClick={onAgree}
              className="flex-1 bg-primary-500 hover:bg-primary-600 text-white py-2 rounded-md text-sm font-medium transition-colors"
            >
              同意する
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
