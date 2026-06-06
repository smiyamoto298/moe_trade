interface Props {
  /** 「同意する」を押したとき */
  onAgree: () => void
  /** 「同意しない」を押したとき（前の画面へ戻すなど） */
  onDecline: () => void
}

/**
 * 新規登録時に表示する利用規約の同意モーダル。
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
            ご登録の前に、以下の利用規約を最後までお読みください。
          </p>
        </div>

        {/* 本文（スクロール領域） */}
        <div className="px-6 py-4 overflow-y-auto text-sm text-gray-300 space-y-4 leading-relaxed">
          <section className="space-y-1">
            <h3 className="font-semibold text-white">第1条（適用）</h3>
            <p>
              本規約は、本サービス（Master of Epic 内のゲームアイテム取引を仲介するWebサイト。以下「本サービス」）の
              利用に関する一切の関係に適用されます。利用者は、本規約に同意のうえ本サービスを利用するものとします。
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="font-semibold text-white">第2条（アカウント登録）</h3>
            <p>
              利用者は、正確かつ最新の情報を登録するものとします。登録メールアドレスおよびパスワードの管理は
              利用者自身の責任で行い、第三者への譲渡・貸与・共有はできません。利用者が登録できるアカウントは
              1人につき1つのみとし、複数アカウントの作成は禁止します。違反が確認された場合、運営者は
              該当する全アカウントの利用を停止することができます。
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="font-semibold text-white">第3条（取引について）</h3>
            <p>
              本サービスはゲーム内アイテムの取引情報を掲載・仲介する場を提供するものであり、取引の成立・履行・
              品質を保証するものではありません。実際の取引はゲーム内のルールに従い、利用者間の責任で行ってください。
              現金（リアルマネートレード）を伴う取引は固く禁止します。
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="font-semibold text-white">第4条（禁止事項）</h3>
            <p>
              利用者は、以下の行為を行ってはなりません。法令または公序良俗に違反する行為、第三者の権利を侵害する行為、
              虚偽の情報を登録・掲載する行為、不正アクセスやサービス運営を妨害する行為、その他運営者が不適切と判断する行為。
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="font-semibold text-white">第5条（免責事項）</h3>
            <p>
              運営者は、本サービスの利用または利用不能によって利用者に生じた損害について、一切の責任を負いません。
              利用者間または利用者と第三者との間で生じたトラブルは、当事者間で解決するものとします。
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="font-semibold text-white">第6条（規約の変更）</h3>
            <p>
              運営者は、必要と判断した場合、利用者へ通知することなく本規約を変更できるものとします。
              変更後に本サービスを利用した場合、変更後の規約に同意したものとみなします。
            </p>
          </section>

          <p className="text-xs text-gray-500 pt-2">
            以上の内容に同意いただける場合は「同意する」を押してください。
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
