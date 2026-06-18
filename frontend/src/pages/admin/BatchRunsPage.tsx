import { useEffect, useState } from 'react'
import { batchRunsApi } from '../../api/batchRuns'
import type { BatchRun, BatchRunsResponse } from '../../api/batchRuns'

// ISO日時を「YYYY/MM/DD HH:mm:ss」（ローカル時刻）に整形する
const fmtDateTime = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// 所要時間（ミリ秒）を読みやすく整形する
const fmtDuration = (ms: number | null): string => {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const STATUS_LABEL: Record<BatchRun['status'], string> = {
  running: '実行中',
  success: '正常終了',
  failed: '失敗',
}

const STATUS_CLASS: Record<BatchRun['status'], string> = {
  running: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  success: 'bg-green-500/20 text-green-300 border-green-500/40',
  failed: 'bg-red-500/20 text-red-300 border-red-500/40',
}

export default function BatchRunsPage() {
  const [data, setData] = useState<BatchRunsResponse | null>(null)
  const [command, setCommand] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = (cmd: string) => {
    setLoading(true)
    setError(false)
    batchRunsApi
      .list(cmd || undefined)
      .then((r) => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(command)
    // command 変更ごとに再取得する
  }, [command])

  // フィルタの選択肢は初回取得時の全コマンド一覧を保持（絞り込み中に消えないように）
  const [allCommands, setAllCommands] = useState<string[]>([])
  useEffect(() => {
    if (data && !command) setAllCommands(data.commands)
  }, [data, command])

  const selectClass =
    'bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500'

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h1 className="text-xl font-bold text-white">バッチ実行履歴</h1>
        <div className="flex items-center gap-2">
          <select value={command} onChange={(e) => setCommand(e.target.value)} className={selectClass}>
            <option value="">すべてのバッチ</option>
            {allCommands.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={() => load(command)}
            className="text-sm bg-surface-border hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            更新
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-5">
        定期バッチ（出品・買取の期限切れ取り下げ、期限切れお知らせの削除）の実行結果を新しい順に表示します（直近200件）。
        失敗した行は内容を確認し、必要に応じて手動で再実行してください。
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : error || !data ? (
        <p className="text-sm text-red-400">実行履歴の取得に失敗しました。時間をおいて再度お試しください。</p>
      ) : data.runs.length === 0 ? (
        <p className="text-sm text-gray-500">実行履歴はまだありません。</p>
      ) : (
        <div className="overflow-x-auto border border-surface-border rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface text-gray-400">
              <tr>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">状態</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">コマンド</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">開始</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">所要</th>
                <th className="px-4 py-2.5 font-medium">結果</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((run) => (
                <tr key={run.id} className="border-t border-surface-border hover:bg-surface/50">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`inline-block text-xs border rounded px-2 py-0.5 ${STATUS_CLASS[run.status]}`}>
                      {STATUS_LABEL[run.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-mono text-gray-300">{run.command}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-400">{fmtDateTime(run.started_at)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-400">{fmtDuration(run.duration_ms)}</td>
                  <td className={`px-4 py-2.5 ${run.status === 'failed' ? 'text-red-400' : 'text-gray-200'}`}>
                    {run.summary ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
