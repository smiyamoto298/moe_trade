import { MASTERY_BY_CODE } from '../utils/constants'

/**
 * 必要マスタリのバッジ群。マスタリ名【コード】と、条件になっている構成スキルを並べて表示する。
 *
 * 出品一覧（テクニックタブ・全てタブ）・アイテム管理一覧・アイテム情報カード（`ItemInfoCard`）で
 * 共通利用する。複数指定は OR 条件（いずれか1つのマスタリで発動）。
 */
export default function MasteryBadges({ codes }: { codes: string[] | null | undefined }) {
  if (!codes || codes.length === 0) return <span className="text-xs text-gray-600">—</span>
  return (
    <div className="flex flex-col gap-1.5">
      {codes.length > 1 && (
        <span className="text-[10px] text-purple-300/80">いずれかで発動（OR）</span>
      )}
      {codes.map((code) => {
        const m = MASTERY_BY_CODE[code]
        return (
          <div key={code} className="flex flex-col gap-0.5">
            <span className="text-xs text-purple-200 bg-purple-900/30 border border-purple-700/40 rounded px-1.5 py-0.5 self-start">
              {m ? `${m.name}【${code}】` : code}
            </span>
            {m && (
              <span className="flex flex-wrap gap-0.5">
                {m.skills.map((s) => (
                  <span key={s} className="text-[10px] leading-tight bg-surface border border-surface-border text-gray-400 rounded px-1 py-px">
                    {s}
                  </span>
                ))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
