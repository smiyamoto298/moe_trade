import type { Item } from '../types'
import { BASE_STAT_LABELS, SPECIAL_CONDITIONS, formatSignedValue } from '../utils/constants'
import { groupPiecesByPerformance } from '../utils/equipmentSet'

const unitSuffix = (unit: string) =>
  unit === '%' ? '%' : unit === 'x' ? '倍' : unit === 'per_min' ? '/min' : ''

// 装備セットの構成部位（set_members）を、部位ごとの名前・追加効果・付加効果・特殊条件つきで表示する。
// 出品/買取の詳細ページで共通利用する。
// 一覧（ListingsPage）と同様に、性能（追加効果・付加効果・特殊条件）が同一の部位は1カードにまとめて表示する。
export default function EquipmentSetBreakdown({ members }: { members?: Item[] }) {
  if (!members || members.length === 0) return null

  const groups = groupPiecesByPerformance(members)

  return (
    <div className="mb-4 border border-amber-600/40 bg-amber-900/10 rounded-lg p-4">
      <h2 className="text-xs font-semibold text-amber-300 uppercase tracking-wider mb-3">
        ⚔ セット内訳（{members.length}部位）
      </h2>
      <div className="space-y-2">
        {groups.map((g, gi) => {
          const m = g.member
          return (
            <div key={gi} className="bg-surface/60 border border-amber-700/30 rounded-md p-3">
              {/* 部位と名前（同一性能の部位はまとめて表示） */}
              <div className="flex flex-col gap-1 mb-1.5">
                {g.members.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs bg-amber-900/40 border border-amber-700/40 text-amber-200 rounded px-1.5 py-0.5">
                      {p.category.name}
                    </span>
                    <span className="text-white font-medium text-sm">{p.name}</span>
                  </div>
                ))}
              </div>

              {/* 追加効果 */}
              {(Object.keys(m.base_stats).length > 0 || m.mithril) && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {Object.entries(m.base_stats).map(([k, v]) => (
                    <span key={k} className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
                      {BASE_STAT_LABELS[k] ?? k}: <span className="text-white font-medium">{formatSignedValue(v)}</span>
                    </span>
                  ))}
                  {m.mithril && (
                    <span className="text-xs bg-slate-700/40 border border-slate-400/40 rounded px-1.5 py-0.5 text-slate-200">ミスリル</span>
                  )}
                </div>
              )}

              {/* 付加効果（付加効果ごとに専用技を表示） */}
              {m.bonus_effects.length > 0 && (
                <div className="flex flex-col gap-0.5 mb-1">
                  {m.bonus_effects.map((e) => (
                    <div key={e.id} className="text-xs">
                      <span className="text-primary-500 font-medium">{e.effect_name}</span>
                      {e.is_exclusive && (
                        <span className="ml-1 text-[10px] bg-amber-900/40 border border-amber-600/40 rounded px-1 py-px text-amber-200">専用技</span>
                      )}
                      {e.values.map((v, i) => (
                        <span key={i} className="text-gray-300 ml-1">
                          {v.label && <span className="text-gray-400">{v.label} </span>}
                          {formatSignedValue(v.value, v.value_unit)}{unitSuffix(v.value_unit)}
                        </span>
                      ))}
                      {e.description && <span className="text-gray-500 ml-1">— {e.description}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* 特殊条件 */}
              {m.special_conditions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.special_conditions.map((c) => (
                    <span key={c} title={SPECIAL_CONDITIONS[c]}
                      className="text-xs bg-red-900/30 border border-red-700/30 text-red-300 rounded px-1.5 py-0.5">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
