import TermsContent from '../components/TermsContent'

/**
 * 利用規約の常設ページ（/terms）。誰でも閲覧できる公開ページ。
 * 本文は登録時の同意モーダルと共通（TermsContent）。
 */
export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">利用規約</h1>
      <div className="bg-surface-card border border-surface-border rounded-lg p-6">
        <TermsContent />
      </div>
    </div>
  )
}
