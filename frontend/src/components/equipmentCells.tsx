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
          {e.values?.map((v, i) => (
            <p key={i} className="text-gray-400 whitespace-nowrap">
              {v.label && <span>{v.label}：</span>}
              <span className="text-gray-200">{formatBonusValueDisplay(v.value, v.value_unit)}</span>
            </p>
          ))}
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

// 「その他」種別（未開封ペット・レシピ）の固有情報セル。
// ペット名 / バインダー / レシピ名 と、レシピの必要スキル値をバッジで表示する。
export function OtherInfoCell({ item }: { item: Item }) {
  const entries: { label: string; value: string }[] = []
  if (item.pet_name) entries.push({ label: 'ペット名', value: item.pet_name })
  if (item.recipe_binder) entries.push({ label: 'バインダー', value: item.recipe_binder })
  if (item.recipe_name) entries.push({ label: 'レシピ名', value: item.recipe_name })
  const skills = Object.entries(item.skill_requirements ?? {})
  if (entries.length === 0 && skills.length === 0) return <span className="text-xs text-gray-600">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((e) => (
        <span key={e.label} className="text-xs bg-surface border border-surface-border rounded px-1.5 py-0.5 text-gray-300">
          {e.label}: <span className="text-white font-medium">{e.value}</span>
        </span>
      ))}
      {skills.map(([skill, val]) => (
        <span key={skill} className="text-xs bg-primary-500/10 border border-primary-500/30 rounded px-1.5 py-0.5 text-primary-300">
          {skill}: <span className="text-white font-medium">{val}</span>
        </span>
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
