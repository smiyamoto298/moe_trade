import { useEffect, useState } from 'react'
import { promoTweetsApi } from '../../api/promoTweets'
import type { PromoTweetsResponse } from '../../api/promoTweets'

// 当日（ローカル時刻）を input[type=date] 用の YYYY-MM-DD にする
const todayStr = (): string => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Web Intent（投稿画面を開くだけ。API不要・無料で使える）
const intentUrl = (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`

// X公式アプリの投稿画面を開くディープリンク（スマホ向け）
const appPostUrl = (text: string) => `twitter://post?message=${encodeURIComponent(text)}`

// スマホ（iOS / Android）判定。スマホではX公式アプリで開く
const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

type Mode = 'day' | 'range'

export default function PromoTweetsPage() {
  const [mode, setMode] = useState<Mode>('day')
  // 単日モードの集計開始（前回ツイート時刻）。'' のときはサーバ既定（記録済みの前回ツイート時刻・無ければ当日0:00）
  const [since, setSince] = useState('')
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const [data, setData] = useState<PromoTweetsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  useEffect(() => {
    if (mode === 'range' && from > to) return // 期間が逆転している間は取得しない
    setLoading(true)
    setError(false)
    const query = mode === 'day' ? (since ? { since } : {}) : { from, to }
    promoTweetsApi
      .list(query)
      .then((r) => {
        setData(r.data)
        // 入力が空（初回・モード切替直後）のときはサーバ既定の開始時刻を入力に反映する
        if (mode === 'day' && !since && r.data.since) setSince(r.data.since)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [mode, since, from, to])

  // 「Xでポスト」押下時に前回ツイート時刻を記録する（次回の単日モードの集計開始になる）
  const markPosted = () => {
    promoTweetsApi.markPosted().catch(() => {
      // 記録に失敗しても投稿フロー自体は妨げない（次回は手動で開始時刻を調整可能）
    })
  }

  // 「Xでポスト」押下。デスクトップは <a href> の通常動作（Web Intentを新規タブで開く）。
  // スマホはX公式アプリの投稿画面をディープリンクで開き、未インストール等で開けない場合は
  // Web Intentにフォールバックする（アプリが開いてページが非表示になればフォールバックを止める）。
  const openPost = (e: React.MouseEvent<HTMLAnchorElement>, text: string) => {
    markPosted()
    if (!isMobile()) return
    e.preventDefault()
    const fallback = window.setTimeout(() => {
      window.location.href = intentUrl(text)
    }, 1500)
    const cancelFallback = () => {
      if (document.hidden) window.clearTimeout(fallback)
    }
    document.addEventListener('visibilitychange', cancelFallback, { once: true })
    window.location.href = appPostUrl(text)
  }

  const copy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 2000)
    } catch {
      // クリップボードが使えない環境では何もしない（文面は画面上で選択コピー可能）
    }
  }

  const dateInputClass =
    'bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500'

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h1 className="text-xl font-bold text-white">宣伝ポスト（X）</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* 単日／期間（累計）の切り替え。登録数が少ない日は期間でまとめて宣伝する */}
          <div className="flex rounded-md overflow-hidden border border-surface-border text-sm">
            {([['day', '単日'], ['range', '期間（累計）']] as [Mode, string][]).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 transition-colors ${
                  mode === m ? 'bg-primary-500 text-white' : 'bg-surface text-gray-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'day' ? (
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-400">前回ツイート〜現在</span>
              <input
                type="datetime-local"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                className={dateInputClass}
              />
              {/* サーバに記録された前回ツイート時刻へ戻す */}
              <button
                onClick={() => setSince('')}
                title="記録済みの前回ツイート時刻に戻す"
                className="text-xs text-gray-400 hover:text-white px-2 py-1.5"
              >
                リセット
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={from}
                onChange={(e) => e.target.value && setFrom(e.target.value)}
                className={dateInputClass}
              />
              <span className="text-gray-400">〜</span>
              <input
                type="date"
                value={to}
                onChange={(e) => e.target.value && setTo(e.target.value)}
                className={dateInputClass}
              />
            </div>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-5">
        {mode === 'day' ? '前回ツイート時刻から現在まで' : '指定した期間（累計）'}の「新規出品」「新規買取」「取引成立件数」「現在の登録数」をX（旧Twitter）の文字数制限内に分割した文面です。
        「Xでポスト」を押すと投稿画面が開くので、内容を確認して順番に投稿してください（API不要・無料）。
        スマホではX公式アプリで開きます（アプリが無い場合はブラウザの投稿画面が開きます）。
        {mode === 'day' && '「Xでポスト」を押した時刻が前回ツイート時刻として自動記録され、次回はその時刻からの集計になります（開始時刻は手動で変更も可能）。'}
        複数に分かれた場合、<span className="text-gray-300">2通目以降は1通目への返信として投稿</span>してください（スレッドとしてつながり、サイトリンクは1通目にのみ付きます）。
      </p>

      {mode === 'range' && from > to ? (
        <p className="text-sm text-red-400">期間の開始日は終了日以前にしてください。</p>
      ) : loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : error || !data ? (
        <p className="text-sm text-red-400">文面の取得に失敗しました。時間をおいて再度お試しください。</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-sm text-gray-300 bg-surface-card border border-surface-border rounded-lg px-4 py-3 mb-5">
            <span>新規出品: <span className="font-bold text-white">{data.listing_count}件</span></span>
            <span>新規買取: <span className="font-bold text-white">{data.buy_request_count}件</span></span>
            <span>取引成立: <span className="font-bold text-white">{data.trade_count}件</span></span>
            <span className="text-gray-500">ツイート数: {data.tweets.length}</span>
          </div>

          <div className="space-y-4">
            {data.tweets.map((t, idx) => (
              <div key={idx} className="bg-surface-card border border-surface-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">
                    {idx + 1} / {data.tweets.length} 通目
                  </span>
                  <span className={`text-xs ${t.length > t.limit ? 'text-red-400' : 'text-gray-500'}`}>
                    {t.length} / {t.limit}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-200 bg-surface border border-surface-border rounded px-3 py-2 mb-3">
                  {t.text}
                </pre>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => copy(t.text, idx)}
                    className="text-xs bg-surface-border hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded transition-colors"
                  >
                    {copiedIdx === idx ? 'コピーしました' : '文面をコピー'}
                  </button>
                  <a
                    href={intentUrl(t.text)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => openPost(e, t.text)}
                    className="text-sm bg-primary-500 hover:bg-primary-600 text-white px-5 py-1.5 rounded-md transition-colors"
                  >
                    Xでポスト
                  </a>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
