import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  notificationSettingsApi,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationSettings,
} from '../api/notificationSettings'
import { useNotification } from '../contexts/NotificationContext'
import { useDialog } from '../contexts/DialogContext'
import { buildPushGuide } from '../utils/pushGuide'
import {
  isInstallAvailable,
  isInstallDismissed,
  isRunningStandalone,
  promptInstall,
  subscribeInstallAvailability,
} from '../utils/installPrompt'

/**
 * 通知設定画面（/mypage/notifications）。
 *
 * 通知の種別（取引 / オークション / 期限切れ）ごとに、ブラウザ通知（Web Push）と
 * メール通知をそれぞれ ON/OFF できる。メール通知は宛先アドレスを設定し、
 * 確認が済んだときだけ届く（未確認のアドレスへは送らない）。
 *
 * 画面の先頭には「このブラウザへの配信」の設定を置く（ここがONでないと種別を
 * ONにしても届かないため）。さらに PWA 未インストールでバナーを「あとで」で
 * 消した端末には、最上部にインストール導線を表示する。
 */
export default function NotificationSettingsPage() {
  const {
    notifPermission, notifSupported, pushEnabled, pushOptedOut,
    disablePush, enablePush, requestNotifPermission,
  } = useNotification()
  const { alert, confirm } = useDialog()
  const [searchParams, setSearchParams] = useSearchParams()

  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [emailDraft, setEmailDraft] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // PWA のインストール可否（beforeinstallprompt を保持しているか）。
  // ヘッダー直下のバナーで「あとで」を選んだ端末はバナーが出ないままになるため、
  // 通知設定画面の先頭に代わりのインストール導線を出す（バナー表示中の端末には重複するので出さない）
  const [installAvailable, setInstallAvailable] = useState(() => isInstallAvailable())
  useEffect(() => subscribeInstallAvailability(setInstallAvailable), [])
  const showInstall = installAvailable && isInstallDismissed() && !isRunningStandalone()

  useEffect(() => {
    notificationSettingsApi
      .get()
      .then(({ data }) => {
        setSettings(data)
        setEmailDraft(data.notification_email ?? '')
      })
      .catch(() => setError('通知設定を読み込めませんでした。時間をおいて再度お試しください。'))
      .finally(() => setLoading(false))
  }, [])

  // 確認メールのリンクから戻ってきたときの結果表示（クエリは一度処理したら消す）
  useEffect(() => {
    const result = searchParams.get('notification_email_verified')
    if (!result) return
    setNotice(
      result === '1'
        ? '通知先メールアドレスを確認しました。メール通知が有効になります。'
        : ''
    )
    if (result !== '1') {
      setError('確認リンクが無効か、有効期限が切れています。お手数ですが再度設定してください。')
    }
    searchParams.delete('notification_email_verified')
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, setSearchParams])

  /** トグルを1つ変更して即座に保存する（失敗したら元に戻す）。 */
  const toggle = async (channel: 'push' | 'email', category: NotificationCategory) => {
    if (!settings || saving) return
    const next: NotificationSettings = {
      ...settings,
      [channel]: { ...settings[channel], [category]: !settings[channel][category] },
    }
    const previous = settings
    setSettings(next)
    setSaving(true)
    setError('')
    try {
      const { data } = await notificationSettingsApi.update({ push: next.push, email: next.email })
      setSettings(data)
    } catch {
      setSettings(previous)
      setError('設定を保存できませんでした。時間をおいて再度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  const saveEmail = async () => {
    const email = emailDraft.trim()
    if (!email) return
    setEmailSaving(true)
    setError('')
    setNotice('')
    try {
      const { data } = await notificationSettingsApi.setEmail(email)
      setSettings(data)
      setEmailDraft(data.notification_email ?? '')
      setNotice(
        data.notification_email_status === 'pending_confirmation'
          ? `${email} に確認メールを送信しました。メール内のリンクを開くとメール通知が有効になります（確認するまで通知は届きません）。`
          : data.notification_email_status === 'pending_account_verification'
            ? 'ログイン用のメールアドレスと同じため、確認メールは送信しません。アカウントのメール認証が完了するとメール通知が有効になります。'
            : 'ログイン用のメールアドレスと同じため、確認なしでメール通知が有効になりました。'
      )
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status
      setError(
        status === 429
          ? '変更の回数が多すぎます。しばらく待ってから再度お試しください。'
          : status === 422
            ? 'メールアドレスの形式が正しくありません。'
            : 'メールアドレスを保存できませんでした。時間をおいて再度お試しください。'
      )
    } finally {
      setEmailSaving(false)
    }
  }

  const clearEmail = async () => {
    const ok = await confirm('通知先メールアドレスを削除します。メール通知は届かなくなります。よろしいですか？')
    if (!ok) return
    setEmailSaving(true)
    setError('')
    setNotice('')
    try {
      const { data } = await notificationSettingsApi.clearEmail()
      setSettings(data)
      setEmailDraft('')
      setNotice('通知先メールアドレスを削除しました。')
    } catch {
      setError('メールアドレスを削除できませんでした。時間をおいて再度お試しください。')
    } finally {
      setEmailSaving(false)
    }
  }

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-6 text-gray-400 text-sm">読み込み中...</div>
  }

  if (!settings) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-sm text-rose-300">{error || '通知設定を読み込めませんでした。'}</p>
      </div>
    )
  }

  // ブラウザ通知が実際に届く状態か（許可済み かつ サイト側でOFFにしていない）
  const pushActive = notifPermission === 'granted' && !pushOptedOut
  const emailActive = settings.notification_email_verified

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-white">通知設定</h1>
        <Link
          to="/mypage"
          className="text-xs bg-surface-card border border-surface-border hover:border-primary-500 text-gray-300 px-3 py-1.5 rounded-md transition-colors"
        >
          ← マイページへ戻る
        </Link>
      </div>

      {/* インストール可能（Android Chrome 等）なのに「あとで」でバナーを消した端末向けの導線。
          バナー表示中の端末はヘッダー直下に同じ導線が出ているため、ここには出さない */}
      {showInstall && (
        <div className="text-sm bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-emerald-100">
          <span>📲 ホーム画面にインストールすると、アプリのように起動でき通知にも気づきやすくなります。</span>
          <button
            onClick={() => promptInstall()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded transition-colors"
          >
            アプリをインストール
          </button>
        </div>
      )}

      {notice && (
        <p className="text-sm text-emerald-300 bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3">{notice}</p>
      )}
      {error && (
        <p className="text-sm text-rose-300 bg-rose-900/20 border border-rose-700/40 rounded-lg p-3">{error}</p>
      )}

      {/* ---- このブラウザへの配信の ON/OFF ----
          下の種別トグルは「何を受け取るか」の設定で、こちらは「このブラウザに配信するか」。
          まずここがONでないとブラウザ通知は届かないため、画面の先頭に置く。
          届かない状態のときは警告色にして、ONにしても届かないことを明示する。 */}
      <section className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-white">ブラウザ通知の受け取り（このブラウザ）</h2>
          <p className="text-xs text-gray-400 mt-1">
            このブラウザにプッシュ通知を配信するかの設定です。ここがOFFのままだと、下の「通知の種類」でONにしてもブラウザ通知は届きません。
          </p>
        </div>
        <div
          className={`text-xs rounded-md p-3 flex flex-wrap items-center gap-2 ${
            pushActive
              ? 'bg-surface border border-surface-border text-gray-300'
              : 'bg-amber-900/20 border border-amber-700/40 text-amber-100/90'
          }`}
        >
          <span className="font-medium">ブラウザ通知（このブラウザ）:</span>
          {notifPermission === 'default' && (
            <>
              <span>未許可のため、ONにしても届きません。</span>
              <button
                onClick={requestNotifPermission}
                className="bg-surface-card border border-surface-border hover:border-primary-500 text-gray-200 px-2.5 py-1 rounded transition-colors"
              >
                🔔 ブラウザ通知を有効にする
              </button>
            </>
          )}
          {notifPermission === 'granted' && pushOptedOut && (
            <>
              <span>OFFにしているため、ONにしても届きません。</span>
              <button
                onClick={enablePush}
                className="bg-surface-card border border-surface-border hover:border-primary-500 text-gray-200 px-2.5 py-1 rounded transition-colors"
              >
                ONに戻す
              </button>
            </>
          )}
          {notifPermission === 'granted' && !pushOptedOut && (
            <>
              <span className="text-emerald-400">
                🔔 ON{pushEnabled ? '（プッシュ配信中）' : ''}
              </span>
              <button
                onClick={disablePush}
                className="bg-surface-card border border-surface-border hover:border-primary-500 text-gray-300 px-2.5 py-1 rounded transition-colors"
              >
                OFFにする
              </button>
            </>
          )}
          {notifPermission === 'denied' && (
            <>
              <span>ブロックされているため、ONにしても届きません。</span>
              <button
                onClick={() => {
                  const guide = buildPushGuide(notifSupported)
                  alert(guide.message, { title: guide.title, highlight: guide.highlight })
                }}
                className="bg-surface-card border border-surface-border hover:border-primary-500 text-gray-200 px-2.5 py-1 rounded transition-colors"
              >
                {notifSupported ? '解除方法' : '利用するには'}
              </button>
            </>
          )}
        </div>
      </section>

      {/* ---- 種別 × チャネルの ON/OFF ---- */}
      <section className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">通知の種類</h2>
          <p className="text-xs text-gray-400 mt-1">
            通知の種類ごとに、ブラウザ通知（プッシュ）とメール通知をそれぞれ受け取るか設定できます。
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[26rem]">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-surface-border">
                <th className="text-left font-medium py-2">通知の種類</th>
                <th className="w-24 py-2 font-medium">ブラウザ通知</th>
                <th className="w-24 py-2 font-medium">メール通知</th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_CATEGORIES.map(({ key, label, description }) => (
                <tr key={key} className="border-b border-surface-border/60 last:border-0 align-top">
                  <td className="py-3 pr-3">
                    <div className="text-gray-200 font-medium">{label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{description}</div>
                  </td>
                  {(['push', 'email'] as const).map((channel) => (
                    <td key={channel} className="py-3 text-center">
                      <label className="inline-flex items-center justify-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={settings[channel][key]}
                          disabled={saving}
                          onChange={() => toggle(channel, key)}
                          aria-label={`${label}の${channel === 'push' ? 'ブラウザ通知' : 'メール通知'}`}
                        />
                        <span className="w-10 h-6 rounded-full bg-surface-border peer-checked:bg-primary-500 peer-disabled:opacity-50 transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!emailActive && (
          <p className="text-xs bg-amber-900/20 border border-amber-700/40 rounded-md p-3 text-amber-100/90">
            通知先メールアドレスが{settings.notification_email ? '未確認' : '未設定'}のため、メール通知はONにしても届きません。
            下の「メール通知の宛先」で設定してください。
          </p>
        )}
      </section>

      {/* ---- メール通知の宛先 ---- */}
      <section className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-white">メール通知の宛先</h2>
          <p className="text-xs text-gray-400 mt-1">
            メール通知を使う場合のみ設定してください。通常、当サイトはメールアドレスを復元できない形（ハッシュ）でしか保存しませんが、
            メールを送るには宛先が必要なため、ここで設定したアドレスだけを暗号化して保存します。いつでも削除できます。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">現在の状態:</span>
          {settings.notification_email_status === 'none' && (
            <span className="text-xs text-gray-300">未設定（メール通知は届きません）</span>
          )}
          {settings.notification_email_status === 'verified' && (
            <span className="text-xs text-emerald-400">✓ 確認済み（{settings.notification_email}）</span>
          )}
          {settings.notification_email_status === 'pending_confirmation' && (
            <span className="text-xs text-amber-300">
              確認待ち（{settings.notification_email}）— 送信した確認メールのリンクを開いてください
            </span>
          )}
          {settings.notification_email_status === 'pending_account_verification' && (
            <span className="text-xs text-amber-300">
              アカウントのメール認証待ち（{settings.notification_email}）
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[14rem]">
            <span className="block text-xs text-gray-400 mb-1">メールアドレス</span>
            <input
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="notify@example.com"
              autoComplete="email"
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
            />
          </label>
          <button
            onClick={saveEmail}
            disabled={emailSaving || !emailDraft.trim() || emailDraft.trim() === settings.notification_email}
            className="bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:hover:bg-primary-600 text-white text-sm px-4 py-2 rounded-md transition-colors"
          >
            {emailSaving ? '保存中...' : '保存'}
          </button>
          {settings.notification_email && (
            <button
              onClick={clearEmail}
              disabled={emailSaving}
              className="bg-surface-card border border-surface-border hover:border-rose-500 text-gray-300 hover:text-rose-300 text-sm px-3 py-2 rounded-md transition-colors"
            >
              削除
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500">
          ログイン用のメールアドレスと違うアドレスを指定した場合は、なりすまし防止のため確認メールを送ります。
          リンクを開いて確認が完了するまで、そのアドレスへ通知は届きません。
        </p>
      </section>
    </div>
  )
}
