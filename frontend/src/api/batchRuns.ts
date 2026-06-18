import client from './client'

export interface BatchRun {
  id: number
  // コマンド名（例: listings:expire）
  command: string
  // running（実行中）/ success（正常終了）/ failed（例外発生）
  status: 'running' | 'success' | 'failed'
  // コマンドが返した要約、または例外メッセージ
  summary: string | null
  started_at: string
  finished_at: string | null
  // 所要時間（ミリ秒）
  duration_ms: number | null
}

export interface BatchRunsResponse {
  // 新しい順（直近200件まで）
  runs: BatchRun[]
  // 過去に実行されたコマンド名（フィルタ用）
  commands: string[]
}

export const batchRunsApi = {
  // 管理: バッチ実行履歴を取得。command 指定で特定バッチに絞り込む
  list: (command?: string): Promise<{ data: BatchRunsResponse }> => {
    const params = command ? `?command=${encodeURIComponent(command)}` : ''
    return client.get<BatchRunsResponse>(`/admin/batch-runs${params}`)
  },
}
