import type { Item } from '../types'
import { BASE_STAT_LABELS, SPECIAL_CONDITIONS, formatSignedValue, formatBonusValueDisplay } from '../utils/constants'
import { groupPiecesByBaseStats, groupPiecesByBonusEffects, groupPiecesBySpecialConditions, hasBaseStats, hasBonusEffects, hasSpecialConditions } from '../utils/equipmentSet'

// 出品一覧・アイテム管理一覧で共通利用する、装備品/装備セットの効果表示セル群。
// 装備セットは「部位（部位カテゴリ名チップ）」「追加効果」「付加効果」を構成部位から組み立てて表示する。

// 追加効果（base_stats + ミスリル）のバッジ群。
// 専用技は付加効果側（is_exclusive）で扱うため、ここでは表示しない。
export function BaseStatBadges({ item }: { item: Item }) {
  return (
    <>
      {Object.entries(item.base_stats ?? {}).map(([key, val]) => (
        <span key={key} className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
          {BASE_STAT_LABELS[key] ?? key}: <span className="text-white font-medium">{formatSignedValue(val)}</span>
        </span>
      ))}
      {item.mithril && (
        <span className="text-xs bg-slate-700/40 border border-slate-400/40 rounded px-1.5 py-0.5 text-slate-200">
          ミスリル
        </span>
      )}
    </>
  )
}

// 付加効果（bonus_effects）の一覧
export function BonusEffectList({ item }: { item: Item }) {
  return (
    <>
      {(item.bonus_effects ?? []).map((e) => (
        <div key={e.id} className="text-xs bg-surface border border-primary-500/20 rounded px-2 py-1">
          <p className="text-primary-500 font-medium">
            {e.effect_name}
            {e.is_exclusive && (
              <span className="ml-1 text-[10px] bg-amber-900/40 border border-amber-600/40 rounded px-1 py-px text-amber-200">専用技</span>
            )}
          </p>
          {e.values?.map((v, i) => {
            const disp = formatBonusValueDisplay(v.value, v.value_unit)
            // テキスト値が長い（5文字以上）場合は一覧では [詳細] とし、ホバーで全文をポップアップ表示する。
            const isLongText = v.value_unit === 'text' && disp.length >= 5
            return (
              <p key={i} className="text-gray-400 whitespace-nowrap">
                {v.label && <span>{v.label}{disp && '：'}</span>}
                {disp && (
                  isLongText ? (
                    <span className="group relative inline-block cursor-help focus:outline-none" tabIndex={0}>
                      <span className="text-[10px] bg-blue-900/40 border border-blue-600/40 rounded px-1 py-px text-blue-200">詳細</span>
                      <span className="absolute left-0 top-full mt-1 z-20 hidden group-hover:block group-focus:block w-64 bg-surface-card border border-blue-600/40 rounded-md px-3 py-2 text-xs text-gray-200 shadow-xl whitespace-normal normal-case">
                        {disp}
                      </span>
                    </span>
                  ) : (
                    <span className="text-gray-200">{disp}</span>
                  )
                )}
              </p>
            )
          })}
        </div>
      ))}
    </>
  )
}

// 特殊条件のバッジ群（コード＋説明をツールチップ表示）。
export function SpecialConditionBadges({ item }: { item: Item }) {
  return (
    <>
      {(item.special_conditions ?? []).map((c) => (
        <span key={c} title={SPECIAL_CONDITIONS[c]} className="text-xs bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded border border-red-700/30">
          {c}
        </span>
      ))}
    </>
  )
}

// 装備セットの部位名ラベル（部位カテゴリ名チップ）。
// アイテム名の下や、追加効果/付加効果列の各グループ見出しに並べて表示する。
export function PartNamesLabel({ names }: { names: string[] }) {
  return (
    <span className="flex flex-wrap gap-0.5">
      {names.map((n, i) => (
        <span key={i} className="text-[10px] leading-tight bg-amber-900/40 border border-amber-700/40 text-amber-100 rounded px-1 py-px">
          {n}
        </span>
      ))}
    </span>
  )
}

// 装備セットの追加効果セル。設定グループが1つ（全部位共通）なら効果のみ、複数なら部位名つきで分けて表示。
export function SetBaseStatsCell({ members }: { members: Item[] }) {
  if (members.length === 0) return <span className="text-xs text-gray-600">—</span>
  const groups = groupPiecesByBaseStats(members)
  const renderEffects = (m: Item) =>
    hasBaseStats(m) ? <BaseStatBadges item={m} /> : <span className="text-xs text-gray-600">—</span>
  if (groups.length === 1) {
    return <div className="flex flex-wrap gap-1">{renderEffects(groups[0].member)}</div>
  }
  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g, gi) => (
        <div key={gi}>
          <PartNamesLabel names={g.partNames} />
          <div className="flex flex-wrap gap-1 mt-0.5">{renderEffects(g.member)}</div>
        </div>
      ))}
    </div>
  )
}

// 装備セットの特殊条件セル。部位ごとの特殊条件を集約し、設定グループが1つなら条件のみ、
// 複数なら部位名つきで分けて表示する（追加効果/付加効果セルと同じ表示ロジック）。
export function SetSpecialConditionsCell({ members }: { members: Item[] }) {
  if (members.length === 0) return <span className="text-xs text-gray-600">—</span>
  const groups = groupPiecesBySpecialConditions(members)
  const renderConds = (m: Item) =>
    hasSpecialConditions(m) ? <SpecialConditionBadges item={m} /> : <span className="text-xs text-gray-600">—</span>
  if (groups.length === 1) {
    return <div className="flex flex-wrap gap-1">{renderConds(groups[0].member)}</div>
  }
  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g, gi) => (
        <div key={gi}>
          <PartNamesLabel names={g.partNames} />
          <div className="flex flex-wrap gap-1 mt-0.5">{renderConds(g.member)}</div>
        </div>
      ))}
    </div>
  )
}

// スキル値バッジ群。
function SkillBadges({ skills }: { skills: [string, number][] }) {
  return (
    <>
      {skills.map(([skill, val]) => (
        <span key={skill} className="text-xs bg-primary-500/10 border border-primary-500/30 rounded px-1.5 py-0.5 text-primary-300">
          {skill}: <span className="text-white font-medium">{val}</span>
        </span>
      ))}
    </>
  )
}

// 「その他」種別（未開封ペット・レシピ）の固有情報セル。
// ペット名 と、レシピの各エントリ（レシピ名 + そのレシピ名の必要スキル値）をバッジで表示する。
export function OtherInfoCell({ item }: { item: Item }) {
  // レシピ：recipe_entries があればエントリごとに表示。無ければ旧単一フィールドへフォールバック。
  const recipeEntries = item.recipe_entries && item.recipe_entries.length > 0
    ? item.recipe_entries
    : (item.recipe_name || (item.skill_requirements && Object.keys(item.skill_requirements).length > 0)
        ? [{ name: item.recipe_name ?? null, skill_requirements: item.skill_requirements ?? {} }]
        : [])

  if (!item.pet_name && recipeEntries.length === 0) return <span className="text-xs text-gray-600">—</span>

  return (
    <div className="flex flex-col gap-1.5">
      {item.pet_name && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
            ペット名: <span className="text-white font-medium">{item.pet_name}</span>
          </span>
        </div>
      )}
      {recipeEntries.map((e, i) => (
        <div key={i} className="flex flex-wrap gap-1">
          {e.name && (
            <span className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
              レシピ名: <span className="text-white font-medium">{e.name}</span>
            </span>
          )}
          <SkillBadges skills={Object.entries(e.skill_requirements ?? {})} />
        </div>
      ))}
    </div>
  )
}

// 装備セットの付加効果セル。設定グループが1つなら効果のみ、複数なら部位名つきで分けて表示。
export function SetBonusCell({ members }: { members: Item[] }) {
  if (members.length === 0) return <span className="text-xs text-gray-600">—</span>
  const groups = groupPiecesByBonusEffects(members)
  const renderEffects = (m: Item) =>
    hasBonusEffects(m) ? <BonusEffectList item={m} /> : <span className="text-xs text-gray-600">—</span>
  if (groups.length === 1) {
    return <div className="flex flex-col gap-1.5">{renderEffects(groups[0].member)}</div>
  }
  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g, gi) => (
        <div key={gi}>
          <PartNamesLabel names={g.partNames} />
          <div className="flex flex-col gap-1 mt-0.5">{renderEffects(g.member)}</div>
        </div>
      ))}
    </div>
  )
}
