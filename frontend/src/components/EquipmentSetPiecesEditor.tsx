import ComboInput from './ComboInput'
import CustomStatsEditor from './CustomStatsEditor'
import type { Item, ItemCategory } from '../types'
import type { EquipmentSetPieceInput } from '../api/items'
import { SPECIAL_CONDITIONS, BASE_STAT_LABELS, STAT_INPUT_COLUMNS, bonusValueForSave, isLabelOnlyUnit } from '../utils/constants'
import { mergeBaseStats, splitBaseStats, type CustomStatRow } from '../utils/customStats'
import { normalizeOfficialUrl } from '../utils/officialUrl'

// ───────────────────────────────────────────────────────────
// 装備セットの構成部位エディタ。
// ・部位と名称は1箇所でまとめて設定する（parts）。
// ・追加効果・付加効果は「設定グループ」で別々に管理する。
//   既定はそれぞれ1グループ（全部位共通）。異なる部位がある場合のみグループを追加し、対象部位を割り当てる。
//   グループ[0] は既定グループ（明示的に割り当てられていない残り全部位に適用）。
// ・送信時に formToPieces() で部位単位の pieces[] に展開する。
// ───────────────────────────────────────────────────────────

export interface EquipmentSetPartForm {
  id?: number          // 既存部位アイテムID（編集時）
  category_id: number  // 部位カテゴリ
  name: string         // 部位ごとの名前
  mithril: boolean     // ミスリル（部位ごと）
  dyeable: boolean     // 染色可（部位ごと。チェック＝染色可）
  official_url: string // 公式DB（部位ごとのアイテムページURL。空＝未設定）
}
interface BonusValueForm {
  value: string
  value_unit: string
  label: string
}
interface BonusEffectForm {
  effect_name: string
  values: BonusValueForm[]
  description: string
  is_exclusive: boolean // この付加効果が専用技か
  no_warage_effect: boolean // WarAgeでは効果がない付加効果か
}
export interface BaseStatsGroupForm {
  partCategoryIds: number[] // この設定を適用する部位（グループ[0]は空＝残り全部位）
  base_stats: Record<string, string> // 固定パラメータ（BASE_STAT_LABELS のキー）のみ
  custom_stats: CustomStatRow[]      // その他（自由入力の項目名。保存時 base_stats へマージ）
  special_conditions: string[]
}
export interface BonusGroupForm {
  partCategoryIds: number[]
  bonus_effects: BonusEffectForm[]
}
export interface EquipmentSetForm {
  parts: EquipmentSetPartForm[]
  baseStatsGroups: BaseStatsGroupForm[] // 先頭が既定グループ
  bonusGroups: BonusGroupForm[]         // 先頭が既定グループ
}

const ALL_SPECIAL = Object.keys(SPECIAL_CONDITIONS)

const emptyValue = (): BonusValueForm => ({ value: '', value_unit: '%', label: '' })
const emptyBonus = (): BonusEffectForm => ({ effect_name: '', values: [emptyValue()], description: '', is_exclusive: false, no_warage_effect: false })
const emptyBaseGroup = (): BaseStatsGroupForm => ({
  partCategoryIds: [], base_stats: {}, custom_stats: [], special_conditions: [],
})
const emptyBonusGroup = (): BonusGroupForm => ({ partCategoryIds: [], bonus_effects: [] })

export const emptyEquipmentSetForm = (): EquipmentSetForm => ({
  parts: [],
  baseStatsGroups: [emptyBaseGroup()],
  bonusGroups: [emptyBonusGroup()],
})

// 追加効果（base_stats + 特殊条件）が同一かを表すキー。ミスリル・染色は部位ごとなのでキーに含めない。
function baseKey(m: Item): string {
  return JSON.stringify({
    base_stats: Object.entries(m.base_stats ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    special_conditions: [...(m.special_conditions ?? [])].sort(),
  })
}
// 付加効果（bonus_effects。専用技フラグも含む）が同一かを表すキー
function bonusKey(m: Item): string {
  return JSON.stringify(
    (m.bonus_effects ?? []).map((e) => ({
      effect_name: e.effect_name, values: e.values, description: e.description, is_exclusive: !!e.is_exclusive, no_warage_effect: !!e.no_warage_effect,
    }))
  )
}

// 部位を設定が同一なグループへ分割する。最多数のグループを既定（partCategoryIds=[]）にし、残りは明示的に部位を割り当てる。
function buildGroups<T extends { partCategoryIds: number[] }>(
  members: Item[], keyFn: (m: Item) => string, make: (m: Item) => T, empty: () => T,
): T[] {
  if (members.length === 0) return [empty()]
  const byKey = new Map<string, Item[]>()
  const order: string[] = []
  for (const m of members) {
    const k = keyFn(m)
    if (!byKey.has(k)) { byKey.set(k, []); order.push(k) }
    byKey.get(k)!.push(m)
  }
  // 最多数のキーを既定にする
  let defaultKey = order[0]
  for (const k of order) {
    if (byKey.get(k)!.length > byKey.get(defaultKey)!.length) defaultKey = k
  }
  const groups: T[] = [{ ...make(byKey.get(defaultKey)![0]), partCategoryIds: [] }]
  for (const k of order) {
    if (k === defaultKey) continue
    const arr = byKey.get(k)!
    groups.push({ ...make(arr[0]), partCategoryIds: arr.map((m) => m.category.id) })
  }
  return groups
}

// 既存セットの構成部位（set_members）からフォーム状態を復元する。
export function membersToForm(members: Item[]): EquipmentSetForm {
  if (members.length === 0) return emptyEquipmentSetForm()
  const parts: EquipmentSetPartForm[] = members.map((m) => ({
    id: m.id, category_id: m.category.id, name: m.name,
    mithril: m.mithril, dyeable: m.dyeable ?? false,
    official_url: m.official_url ?? '',
  }))
  const baseStatsGroups = buildGroups<BaseStatsGroupForm>(members, baseKey, (m) => {
    // 固定パラメータとその他（自由入力キー）を分離して復元する
    const { fixed, custom } = splitBaseStats(m.base_stats)
    return {
      partCategoryIds: [],
      base_stats: fixed,
      custom_stats: custom,
      special_conditions: m.special_conditions ?? [],
    }
  }, emptyBaseGroup)
  const bonusGroups = buildGroups<BonusGroupForm>(members, bonusKey, (m) => ({
    partCategoryIds: [],
    bonus_effects: (m.bonus_effects ?? []).map((e) => ({
      effect_name: e.effect_name,
      values: e.values.map((v) => ({ value: String(v.value), value_unit: v.value_unit, label: v.label ?? '' })),
      description: e.description ?? '',
      is_exclusive: !!e.is_exclusive,
      no_warage_effect: !!e.no_warage_effect,
    })),
  }), emptyBonusGroup)
  return { parts, baseStatsGroups, bonusGroups }
}

// フォーム状態を部位単位の pieces[] へ展開する（API送信用）。
export function formToPieces(form: EquipmentSetForm): EquipmentSetPieceInput[] {
  const baseFor = (catId: number) =>
    form.baseStatsGroups.find((g, i) => i > 0 && g.partCategoryIds.includes(catId)) ?? form.baseStatsGroups[0]
  const bonusFor = (catId: number) =>
    form.bonusGroups.find((g, i) => i > 0 && g.partCategoryIds.includes(catId)) ?? form.bonusGroups[0]

  return form.parts.map((p) => {
    const bg = baseFor(p.category_id)
    const ng = bonusFor(p.category_id)
    return {
      ...(p.id ? { id: p.id } : {}),
      category_id: p.category_id,
      name: p.name.trim(),
      official_url: p.official_url.trim() || null,
      base_stats: mergeBaseStats(bg.base_stats, bg.custom_stats),
      special_conditions: bg.special_conditions,
      dyeable: p.dyeable,
      mithril: p.mithril,
      // 専用技は付加効果ごとの is_exclusive で保持する（アイテム単位のフラグは廃止）
      bonus_effects: ng.bonus_effects
        .filter((e) => e.effect_name.trim())
        .map((e) => ({
          effect_name: e.effect_name,
          values: e.values
            .filter((v) => isLabelOnlyUnit(v.value_unit) || v.value !== '')
            .map((v) => ({ value: bonusValueForSave(v), value_unit: v.value_unit, label: v.label || undefined })),
          description: e.description,
          is_exclusive: e.is_exclusive,
          no_warage_effect: e.no_warage_effect,
        })),
    }
  })
}

interface Props {
  categories: ItemCategory[]
  value: EquipmentSetForm
  onChange: (form: EquipmentSetForm) => void
  bonusValueLabelOptions: string[]
  // 追加効果「その他」の項目名候補（管理画面の「追加効果の項目名」で管理）
  statLabelOptions: string[]
}

export default function EquipmentSetPiecesEditor({ categories, value, onChange, bonusValueLabelOptions, statLabelOptions }: Props) {
  const { parts, baseStatsGroups, bonusGroups } = value

  // 選択可能な部位カテゴリ（武器・防具・装飾品などの子カテゴリ）
  const partCategoryGroups = categories.filter(
    (cat) => !(cat.parent_id === null && cat.name === '装備セット')
      && cat.name !== 'テクニック'
      && (cat.children ?? []).length > 0
  )
  const allChildCats = partCategoryGroups.flatMap((c) => c.children ?? [])
  const partName = (catId: number) => allChildCats.find((c) => c.id === catId)?.name ?? `#${catId}`

  // 名前入力欄は、追加した順ではなく構成部位チェックボックス（カテゴリ）の並び順で表示する
  const partCategoryOrder = (catId: number) => {
    const i = allChildCats.findIndex((c) => c.id === catId)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const orderedParts = [...parts].sort((a, b) => partCategoryOrder(a.category_id) - partCategoryOrder(b.category_id))

  // ── 部位（parts）の編集 ──
  const togglePart = (categoryId: number) => {
    const exists = parts.find((p) => p.category_id === categoryId)
    if (exists) {
      onChange({
        parts: parts.filter((p) => p.category_id !== categoryId),
        // 削除部位を各グループの割り当てからも外す
        baseStatsGroups: baseStatsGroups.map((g) => ({ ...g, partCategoryIds: g.partCategoryIds.filter((id) => id !== categoryId) })),
        bonusGroups: bonusGroups.map((g) => ({ ...g, partCategoryIds: g.partCategoryIds.filter((id) => id !== categoryId) })),
      })
    } else {
      onChange({ ...value, parts: [...parts, { category_id: categoryId, name: '', mithril: false, dyeable: false, official_url: '' }] })
    }
  }
  const updatePart = (categoryId: number, patch: Partial<EquipmentSetPartForm>) =>
    onChange({ ...value, parts: parts.map((p) => (p.category_id === categoryId ? { ...p, ...patch } : p)) })

  // ── 追加効果グループの編集 ──
  const updateBase = (gi: number, patch: Partial<BaseStatsGroupForm>) =>
    onChange({ ...value, baseStatsGroups: baseStatsGroups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) })
  const setBaseStat = (gi: number, key: string, val: string) => {
    const base_stats = { ...baseStatsGroups[gi].base_stats }
    if (val === '') delete base_stats[key]; else base_stats[key] = val
    updateBase(gi, { base_stats })
  }
  const toggleBaseCond = (gi: number, c: string) => {
    const cur = baseStatsGroups[gi].special_conditions
    updateBase(gi, { special_conditions: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c] })
  }
  const addBaseGroup = () => onChange({ ...value, baseStatsGroups: [...baseStatsGroups, emptyBaseGroup()] })
  const removeBaseGroup = (gi: number) =>
    onChange({ ...value, baseStatsGroups: baseStatsGroups.filter((_, i) => i !== gi) })
  const toggleBasePart = (gi: number, categoryId: number) => {
    const cur = baseStatsGroups[gi].partCategoryIds
    updateBase(gi, { partCategoryIds: cur.includes(categoryId) ? cur.filter((x) => x !== categoryId) : [...cur, categoryId] })
  }

  // ── 付加効果グループの編集 ──
  const updateBonus = (gi: number, patch: Partial<BonusGroupForm>) =>
    onChange({ ...value, bonusGroups: bonusGroups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) })
  const addBonusGroup = () => onChange({ ...value, bonusGroups: [...bonusGroups, emptyBonusGroup()] })
  const removeBonusGroup = (gi: number) =>
    onChange({ ...value, bonusGroups: bonusGroups.filter((_, i) => i !== gi) })
  const toggleBonusPart = (gi: number, categoryId: number) => {
    const cur = bonusGroups[gi].partCategoryIds
    updateBonus(gi, { partCategoryIds: cur.includes(categoryId) ? cur.filter((x) => x !== categoryId) : [...cur, categoryId] })
  }
  const setBonusField = (gi: number, bi: number, key: 'effect_name' | 'description', val: string) =>
    updateBonus(gi, { bonus_effects: bonusGroups[gi].bonus_effects.map((e, i) => (i === bi ? { ...e, [key]: val } : e)) })
  const setBonusExclusive = (gi: number, bi: number, val: boolean) =>
    updateBonus(gi, { bonus_effects: bonusGroups[gi].bonus_effects.map((e, i) => (i === bi ? { ...e, is_exclusive: val } : e)) })
  const setBonusNoWarage = (gi: number, bi: number, val: boolean) =>
    updateBonus(gi, { bonus_effects: bonusGroups[gi].bonus_effects.map((e, i) => (i === bi ? { ...e, no_warage_effect: val } : e)) })
  const setBonusVal = (gi: number, bi: number, vi: number, key: keyof BonusValueForm, val: string) =>
    updateBonus(gi, {
      bonus_effects: bonusGroups[gi].bonus_effects.map((e, i) => i !== bi ? e : {
        ...e, values: e.values.map((v, j) => (j === vi ? { ...v, [key]: val } : v)),
      }),
    })

  // 既定グループ[0]に属する部位（他グループに割り当てられていない残り）
  const defaultParts = (groups: { partCategoryIds: number[] }[]) => {
    const claimed = new Set(groups.slice(1).flatMap((g) => g.partCategoryIds))
    return parts.filter((p) => !claimed.has(p.category_id))
  }

  // グループ用の部位チェックリスト（他の非既定グループで使用中の部位は無効化）
  const PartPicker = ({ groups, gi, onToggle }: { groups: { partCategoryIds: number[] }[]; gi: number; onToggle: (id: number) => void }) => {
    const usedElsewhere = new Set(groups.flatMap((g, i) => (i === gi || i === 0 ? [] : g.partCategoryIds)))
    return (
      <div className="flex flex-wrap gap-1.5">
        {parts.length === 0 && <span className="text-xs text-gray-500">先に構成部位を追加してください</span>}
        {parts.map((p) => {
          const checked = groups[gi].partCategoryIds.includes(p.category_id)
          const disabled = !checked && usedElsewhere.has(p.category_id)
          return (
            <label key={p.category_id}
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${
                checked ? 'border-amber-500/60 bg-amber-900/30 text-amber-200 cursor-pointer'
                  : disabled ? 'border-surface-border text-gray-600 opacity-50 cursor-not-allowed'
                  : 'border-surface-border text-gray-400 hover:border-gray-500 cursor-pointer'}`}
              title={disabled ? '他のグループで使用中です' : undefined}>
              <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(p.category_id)} className="accent-amber-500" />
              {partName(p.category_id)}
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 構成部位と名称（まとめて設定） */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-amber-300">構成部位と名称</p>
        <div className="space-y-2">
          {partCategoryGroups.map((cat) => (
            <div key={cat.id}>
              <p className="text-xs text-gray-500 mb-1">{cat.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {(cat.children ?? []).map((child) => {
                  const checked = !!parts.find((p) => p.category_id === child.id)
                  return (
                    <label key={child.id}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded border cursor-pointer text-xs transition-colors ${
                        checked ? 'border-amber-500/60 bg-amber-900/30 text-amber-200' : 'border-surface-border text-gray-400 hover:border-gray-500'}`}>
                      <input type="checkbox" checked={checked} onChange={() => togglePart(child.id)} className="accent-amber-500" />
                      {child.name}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {parts.length > 0 && (
          <div className="space-y-1.5 mt-1">
            {orderedParts.map((p) => (
              <div key={p.category_id} className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-amber-300 w-20 shrink-0 truncate" title={partName(p.category_id)}>{partName(p.category_id)}</span>
                  <input type="text" placeholder="部位アイテム名"
                    value={p.name}
                    onChange={(e) => updatePart(p.category_id, { name: e.target.value })}
                    className="flex-1 min-w-[8rem] bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500" />
                  <label className="flex items-center gap-1 text-xs text-gray-300 shrink-0 cursor-pointer select-none">
                    <input type="checkbox" checked={p.mithril} onChange={(e) => updatePart(p.category_id, { mithril: e.target.checked })} className="accent-primary-500" />
                    ミスリル
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-300 shrink-0 cursor-pointer select-none">
                    <input type="checkbox" checked={p.dyeable} onChange={(e) => updatePart(p.category_id, { dyeable: e.target.checked })} className="accent-primary-500" />
                    染色可
                  </label>
                </div>
                <div className="flex items-center gap-2 pl-[5.5rem]">
                  <span className="text-[10px] text-gray-500 shrink-0">公式DB</span>
                  <input type="url" placeholder="http://moepic.com/... （部位のアイテムページURL・任意）"
                    value={p.official_url}
                    onChange={(e) => updatePart(p.category_id, { official_url: normalizeOfficialUrl(e.target.value) })}
                    className="flex-1 min-w-[8rem] bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary-500" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 追加効果（設定グループ） */}
      <div className="space-y-2 border-t border-amber-700/20 pt-3">
        <p className="text-xs font-semibold text-amber-300">追加効果</p>
        {baseStatsGroups.map((g, gi) => (
          <div key={gi} className="border border-surface-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              {gi === 0 ? (
                <span className="text-xs text-gray-400">
                  {baseStatsGroups.length > 1 ? '既定（他グループ以外の部位）' : '全部位共通'}
                  {baseStatsGroups.length > 1 && (
                    <span className="text-gray-500 ml-1">: {defaultParts(baseStatsGroups).map((p) => partName(p.category_id)).join('・') || 'なし'}</span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-gray-400">設定グループ {gi}</span>
              )}
              {gi > 0 && (
                <button type="button" onClick={() => removeBaseGroup(gi)} className="text-xs text-red-400 hover:text-red-300">削除</button>
              )}
            </div>
            {gi > 0 && (
              <div>
                <p className="text-[11px] text-gray-500 mb-1">対象部位</p>
                <PartPicker groups={baseStatsGroups} gi={gi} onToggle={(id) => toggleBasePart(gi, id)} />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STAT_INPUT_COLUMNS.map((column, ci) => (
                <div key={ci} className="space-y-2">
                  {column.map((key) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-400 mb-0.5">{BASE_STAT_LABELS[key]}</label>
                      <input type="number" placeholder="—"
                        value={g.base_stats[key] ?? ''}
                        onChange={(e) => setBaseStat(gi, key, e.target.value)}
                        className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500" />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* その他（自由入力の項目名） */}
            <CustomStatsEditor
              idPrefix={`set-stat-${gi}`}
              rows={g.custom_stats}
              onChange={(rows) => updateBase(gi, { custom_stats: rows })}
              labelOptions={statLabelOptions}
            />

            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold text-gray-300 py-1 flex items-center gap-1 select-none">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span> 特殊条件
              </summary>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {ALL_SPECIAL.map((c) => (
                  <label key={c} className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${g.special_conditions.includes(c) ? 'border-red-500/60 bg-red-900/20 text-red-300' : 'border-surface-border text-gray-400 hover:border-gray-500'}`}>
                    <input type="checkbox" checked={g.special_conditions.includes(c)} onChange={() => toggleBaseCond(gi, c)} className="accent-red-500" />
                    <span className="font-medium">{c}</span>
                    <span className="truncate">{SPECIAL_CONDITIONS[c]}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
        ))}
        <button type="button" onClick={addBaseGroup} disabled={parts.length < 2}
          className="text-xs bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-40 disabled:cursor-not-allowed border border-amber-600/40 text-amber-300 px-3 py-1.5 rounded w-full transition-colors">
          + 設定グループを追加（部位ごとに追加効果を分ける）
        </button>
      </div>

      {/* 付加効果（設定グループ） */}
      <div className="space-y-2 border-t border-amber-700/20 pt-3">
        <p className="text-xs font-semibold text-amber-300">付加効果</p>
        {bonusGroups.map((g, gi) => (
          <div key={gi} className="border border-surface-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              {gi === 0 ? (
                <span className="text-xs text-gray-400">
                  {bonusGroups.length > 1 ? '既定（他グループ以外の部位）' : '全部位共通'}
                  {bonusGroups.length > 1 && (
                    <span className="text-gray-500 ml-1">: {defaultParts(bonusGroups).map((p) => partName(p.category_id)).join('・') || 'なし'}</span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-gray-400">設定グループ {gi}</span>
              )}
              {gi > 0 && (
                <button type="button" onClick={() => removeBonusGroup(gi)} className="text-xs text-red-400 hover:text-red-300">削除</button>
              )}
            </div>
            {gi > 0 && (
              <div>
                <p className="text-[11px] text-gray-500 mb-1">対象部位</p>
                <PartPicker groups={bonusGroups} gi={gi} onToggle={(id) => toggleBonusPart(gi, id)} />
              </div>
            )}

            <div className="space-y-3">
              {g.bonus_effects.map((e, bi) => (
                <div key={bi} className="border border-surface-border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">付加効果 {bi + 1}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-amber-200 select-none">
                        <input type="checkbox" checked={e.is_exclusive} onChange={(ev) => setBonusExclusive(gi, bi, ev.target.checked)} className="accent-amber-500" />
                        専用技
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-sky-200 select-none">
                        <input type="checkbox" checked={e.no_warage_effect} onChange={(ev) => setBonusNoWarage(gi, bi, ev.target.checked)} className="accent-sky-500" />
                        WarAge無効
                      </label>
                      <button type="button" onClick={() => updateBonus(gi, { bonus_effects: g.bonus_effects.filter((_, i) => i !== bi) })} className="text-xs text-red-400 hover:text-red-300">削除</button>
                    </div>
                  </div>
                  <input type="text" placeholder="効果名（例: 炎の魔剣）"
                    value={e.effect_name}
                    onChange={(ev) => setBonusField(gi, bi, 'effect_name', ev.target.value)}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500" />
                  <div className="space-y-1.5">
                    {e.values.map((v, vi) => (
                      <div key={vi} className="grid grid-cols-[1fr_80px_80px_auto] gap-1.5 items-center">
                        <ComboInput
                          id={`set-bonus-${gi}-${bi}-${vi}`}
                          value={v.label}
                          onChange={(val) => setBonusVal(gi, bi, vi, 'label', val)}
                          options={bonusValueLabelOptions}
                          placeholder="項目名"
                          className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 w-full"
                        />
                        {isLabelOnlyUnit(v.value_unit) ? (
                          <span className="text-xs text-gray-500 px-1 py-1 truncate" title={v.value_unit === 'checking' ? '項目名のみ設定（値は確認中）' : '項目名のみ設定（値なし）'}>項目名のみ</span>
                        ) : (
                          <input type={v.value_unit === 'text' ? 'text' : 'number'}
                            placeholder={v.value_unit === 'text' ? 'テキスト' : '数値'}
                            value={v.value}
                            onChange={(ev) => setBonusVal(gi, bi, vi, 'value', ev.target.value)}
                            className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500" />
                        )}
                        <select value={v.value_unit}
                          onChange={(ev) => setBonusVal(gi, bi, vi, 'value_unit', ev.target.value)}
                          className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-primary-500">
                          <option value="%">%</option>
                          <option value="fixed">固定値</option>
                          <option value="x">倍率</option>
                          <option value="per_min">毎分</option>
                          <option value="text">テキスト</option>
                          <option value="checking">確認中</option>
                          <option value="none">なし</option>
                        </select>
                        {e.values.length > 1 && (
                          <button type="button" onClick={() => updateBonus(gi, { bonus_effects: g.bonus_effects.map((b, i) => i !== bi ? b : { ...b, values: b.values.filter((_, j) => j !== vi) }) })} className="text-red-400 text-sm">×</button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => updateBonus(gi, { bonus_effects: g.bonus_effects.map((b, i) => i !== bi ? b : { ...b, values: [...b.values, emptyValue()] }) })} className="text-xs text-primary-500 hover:underline">
                      + 数値を追加
                    </button>
                  </div>
                  <input type="text" placeholder="備考（例: 物理ダメージ+15%、命中-5%）"
                    value={e.description}
                    onChange={(ev) => setBonusField(gi, bi, 'description', ev.target.value)}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500" />
                </div>
              ))}
              <button type="button" onClick={() => updateBonus(gi, { bonus_effects: [...g.bonus_effects, emptyBonus()] })} className="text-xs bg-primary-500/20 hover:bg-primary-500/30 border border-primary-500/40 text-primary-500 px-3 py-1.5 rounded w-full transition-colors">
                + 付加効果を追加
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addBonusGroup} disabled={parts.length < 2}
          className="text-xs bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-40 disabled:cursor-not-allowed border border-amber-600/40 text-amber-300 px-3 py-1.5 rounded w-full transition-colors">
          + 設定グループを追加（部位ごとに付加効果を分ける）
        </button>
      </div>
    </div>
  )
}
