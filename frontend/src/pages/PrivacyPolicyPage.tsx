/**
 * プライバシーポリシー（個人情報保護法対応の公表事項）。
 * 誰でも閲覧できる公開ページ（/privacy）。取得情報・利用目的・安全管理措置・
 * 第三者提供・開示等請求の窓口を公表する。
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">プライバシーポリシー</h1>
      <p className="text-xs text-gray-500 mb-6">制定日: 2026年7月9日</p>

      <div className="bg-surface-card border border-surface-border rounded-lg p-6 text-sm text-gray-300 space-y-6 leading-relaxed">
        <section className="space-y-1">
          <h2 className="font-semibold text-white">1. 基本方針</h2>
          <p>
            本サービス（Master of Epic 内のゲームアイテム取引を仲介するWebサイト。以下「本サービス」）の運営者
            （以下「運営者」）は、個人情報の保護に関する法律（個人情報保護法）その他の関係法令・ガイドラインを遵守し、
            利用者の個人情報を適切に取り扱います。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-semibold text-white">2. 取得する情報と取得方法</h2>
          <p>運営者は、本サービスの提供にあたり、利用者から以下の情報を取得します。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              メールアドレス（アカウント登録時・パスワード再設定時に入力いただくもの。
              データベースには平文を保存せず、復元できない不可逆のハッシュ値のみを保存します）
            </li>
            <li>パスワード（不可逆のハッシュ化を行ったうえで保存します）</li>
            <li>ゲーム内キャラクター名・所属サーバー（任意入力）</li>
            <li>出品・買取・取引チャット・掲示板などへの投稿内容</li>
            <li>アクセスログ（IPアドレス・日時等。不正利用防止のためサーバーが標準的に記録するもの）</li>
          </ul>
        </section>

        <section className="space-y-1">
          <h2 className="font-semibold text-white">3. 利用目的</h2>
          <p>取得した情報は、以下の目的の範囲内で利用します。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>アカウントの登録・認証・本人確認のため</li>
            <li>メール認証・パスワード再設定・重要なお知らせ等の連絡のため</li>
            <li>本サービスの提供（取引情報の掲載・取引相手との連絡の仲介・通知）のため</li>
            <li>規約違反・不正利用（複数アカウント作成、荒らし等）の調査・防止のため</li>
            <li>本サービスの維持・改善、および障害・お問い合わせへの対応のため</li>
          </ul>
          <p>上記の目的以外で個人情報を利用する場合は、あらかじめ利用者の同意を得るものとします。</p>
        </section>

        <section className="space-y-1">
          <h2 className="font-semibold text-white">4. 安全管理措置</h2>
          <p>運営者は、個人情報の漏えい・滅失・毀損の防止のため、以下の措置を講じています。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>通信の暗号化（HTTPS/TLS）</li>
            <li>
              メールアドレスの平文非保存（HMAC-SHA256による不可逆のブラインドインデックス方式で照合のみ可能な形で保存）
            </li>
            <li>パスワードの不可逆ハッシュ化保存</li>
            <li>管理機能へのアクセス権限の制限（権限を持つ運営者のみが利用者情報を閲覧可能）</li>
            <li>取引チャットの内容は当事者（および運営上必要な場合の運営者）以外は閲覧不可</li>
          </ul>
        </section>

        <section className="space-y-1">
          <h2 className="font-semibold text-white">5. 第三者提供</h2>
          <p>
            運営者は、次の場合を除き、個人情報を第三者に提供しません。
            (1) 利用者本人の同意がある場合、(2) 法令に基づく場合、
            (3) 人の生命・身体・財産の保護のために必要で本人の同意を得ることが困難な場合。
          </p>
          <p>
            なお、サイト上で他の利用者に表示されるのは登録キャラクター名（未登録の場合は「ユーザー#ID」）のみであり、
            メールアドレスが他の利用者に表示されることはありません。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-semibold text-white">6. 委託</h2>
          <p>
            本サービスの運営に必要な範囲で、サーバーホスティングおよびメール送信の基盤として外部事業者のサービスを
            利用しています。委託先に対しては、法令に基づき必要かつ適切な監督を行います。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-semibold text-white">7. Cookie・ローカルストレージ等について</h2>
          <p>
            本サービスは、ログイン状態の維持のために認証トークンをブラウザのローカルストレージに保存します。
            また、操作案内の表示済みフラグ等の設定情報をローカルストレージに保存することがあります。
            これらはブラウザの設定から削除できます。本サービスは、外部のアクセス解析サービスや広告配信サービスを
            利用していません。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-semibold text-white">8. 開示・訂正・利用停止・削除等の請求（退会を含む）</h2>
          <p>
            利用者は、運営者に対し、ご自身の個人情報（保有個人データ）の開示・訂正・追加・削除・利用停止等を
            請求することができます。アカウントの削除（退会）をご希望の場合も同様に受け付けます。
            ご請求の際は、下記のお問い合わせ窓口までご連絡ください。ご本人であることを確認のうえ、
            法令に従い遅滞なく対応します。
          </p>
          <p className="text-xs text-gray-500">
            ※ 取引の相手方に既に表示された投稿内容など、削除により他の利用者の記録に影響する情報については、
            氏名等を匿名化する方法（「退会ユーザー」表示への置換等）で対応する場合があります。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-semibold text-white">9. お問い合わせ窓口</h2>
          <p>
            個人情報の取扱いに関するご質問・苦情・開示等のご請求は、サイト内の掲示板「お問い合わせ」よりご連絡ください。
            ログインできない等の事情がある場合は、パスワード再設定をご利用いただくか、掲示板に記載の方法に従ってください。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-semibold text-white">10. 本ポリシーの改定</h2>
          <p>
            運営者は、法令の改正やサービス内容の変更に応じて本ポリシーを改定することがあります。
            重要な変更を行う場合は、サイト上のお知らせ等で周知します。改定後のポリシーは、
            本ページに掲載した時点から効力を生じます。
          </p>
        </section>
      </div>
    </div>
  )
}
