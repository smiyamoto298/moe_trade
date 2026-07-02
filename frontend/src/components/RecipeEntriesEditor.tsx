import type { Item } from '../types'
import SkillRequirementInputs from './SkillRequirementInputs'

// ───────────────────────────────────────────────────────────
// レシピの入力エディタ。
// ・レシピは {レシピ名, 必要スキル値} の組（エントリ）を複数持てる。
// ・装備セットの「設定グループ」を参考に、レシピ名ごとに必要スキル値を変えられる。
// ・必要スキル値は SkillRequirementInputs で入力し、レシピでは「生産」グループのみ初期展開する。
// ・入力中のスキル値は文字列で保持し、送信時に recipeEntriesToPayload() で数値化する。
// ───────────────────────────────────────────────────────────

export interface RecipeEntryForm {
  name: string
  skill_requirements: Record<string, string> // 入力中は文字列で保持
}

export const emptyRecipeEntry = (): RecipeEntryForm => ({ name: '', skill_requirements: {} })

// アイテム（既存データ）を編集フォーム用のエントリ配列へ変換する。
// recipe_entries があればそれを、無ければ旧来の単一 recipe_name/skill_requirements から
// 単一エントリを合成する（マイグレーション未反映データや旧UIデータの後方互換）。
export const itemToRecipeEntries = (item: Item): RecipeEntryForm[] => {
  const toStrSkills = (s: Record<string, number> | null | undefined): Record<string, string> =>
    Object.fromEntries(Object.entries(s ?? {}).map(([k, v]) => [k, String(v)]))

  if (item.recipe_entries && item.recipe_entries.length > 0) {
    return item.recipe_entries.map((e) => ({
      name: e.name ?? '',
      skill_requirements: toStrSkills(e.skill_requirements),
    }))
  }
  if (item.recipe_name || (item.skill_requirements && Object.keys(item.skill_requirements).length > 0)) {
    return [{
      name: item.recipe_name ?? '',
      skill_requirements: toStrSkills(item.skill_requirements),
    }]
  }
  return []
}

// 送信用ペイロードへ変換する。空エントリ（レシピ名・スキルすべて空）は除去し、
// スキル値は数値化する（空欄は落とす）。
export const recipeEntriesToPayload = (
  entries: RecipeEntryForm[],
): { name: string | null; skill_requirements: Record<string, number> }[] =>
  entries
    .map((e) => {
      const skills = Object.fromEntries(
        Object.entries(e.skill_requirements)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => [k, Number(v)]),
      )
      return { name: e.name.trim(), skills }
    })
    .filter((e) => e.name !== '' || Object.keys(e.skills).length > 0)
    .map((e) => ({
      name: e.name || null,
      skill_requirements: e.skills,
    }))

interface Props {
  value: RecipeEntryForm[]
  onChange: (entries: RecipeEntryForm[]) => void
}

export default function RecipeEntriesEditor({ value, onChange }: Props) {
  const update = (i: number, patch: Partial<RecipeEntryForm>) =>
    onChange(value.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  const setSkill = (i: number, skill: string, val: string) =>
    onChange(value.map((e, idx) =>
      idx === i ? { ...e, skill_requirements: { ...e.skill_requirements, [skill]: val } } : e,
    ))
  const add = () => onChange([...value, emptyRecipeEntry()])
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-xs text-gray-500">「＋ レシピを追加」で、レシピ名・必要スキル値の組を登録できます。</p>
      )}
      {value.map((entry, i) => (
        <div key={i} className="border border-surface-border rounded-lg p-3 space-y-3 bg-surface/40">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-primary-300">レシピ {i + 1}</p>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              削除
            </button>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">レシピ名</label>
            <input
              type="text"
              value={entry.name}
              onChange={(e) => update(i, { name: e.target.value })}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              placeholder="レシピ名"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] text-gray-500">このレシピの作成に必要なスキル値があれば入力してください。</p>
            <SkillRequirementInputs
              values={entry.skill_requirements}
              onChange={(skill, val) => setSkill(i, skill, val)}
              defaultOpenGroups={['生産']}
              idPrefix={`recipe-skill-${i}`}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs px-3 py-1.5 rounded border border-primary-500/40 text-primary-300 hover:bg-primary-500/10"
      >
        ＋ レシピを追加
      </button>
    </div>
  )
}
