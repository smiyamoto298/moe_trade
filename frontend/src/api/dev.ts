import client from './client'
import type { BatchRun } from './batchRuns'

export interface PullProdResponse {
  ok: boolean
  // db:pull-prod の実行履歴（要約・件数・ローカルログイン情報を含む）
  run: BatchRun | null
}

export const devApi = {
  // 本番データをマスキングしてローカルDBへ取り込む（ローカル環境専用）
  pullProd: (): Promise<{ data: PullProdResponse }> =>
    client.post<PullProdResponse>('/admin/dev/pull-prod'),
}
