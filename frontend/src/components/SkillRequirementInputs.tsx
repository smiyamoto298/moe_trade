import { useState } from 'react'
import { SKILL_GROUPS } from '../utils/constants'

// ───────────────────────────────────────────────────────────
// 必要スキル値の入力欄。戦闘 / 基本 / 生産 / 熟練 のグループ単位でアコーディオン表示する。
// ・defaultOpenGroups を指定すると、そのグループのみ初期展開する（例: レシピは ['生産'] のみ）。
//   未指定なら全グループを初期展開する（テクニックなど）。
// ・値は文字列で保持し、onChange(skill, value) で親へ通知する（送信時に数値化する前提）。
// ───────────────────────────────────────────────────────────

interface Props {
  values: Record<string, string>
  onChange: (skill: string, value: string) => void
  defaultOpenGroups?: string[]
  idPrefix?: string // input の id 衝突を避けるための接頭辞（複数エディタで同一スキル名を使うため）
}

export default function SkillRequirementInputs({ values, onChange, defaultOpenGroups, idPrefix }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      SKILL_GROUPS.map((g) => [g.group, defaultOpenGroups ? defaultOpenGroups.includes(g.group) : true]),
    ),
  )
  const toggle = (group: string) => setOpen((p) => ({ ...p, [group]: !p[group] }))

  return (
    <div className="space-y-1.5">
      {SKILL_GROUPS.map((group) => {
        const isOpen = open[group.group]
        // このグループで入力済みのスキル数（折りたたみ時の目印）
        const filled = group.skills.filter((s) => (values[s] ?? '') !== '').length
        return (
          <div key={group.group} className="border border-surface-border rounded">
            <button
              type="button"
              onClick={() => toggle(group.group)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-gray-300 hover:bg-surface/60"
              aria-expanded={isOpen}
            >
              <span className="flex items-center gap-2">
                <span className="text-gray-500">{isOpen ? '▼' : '▶'}</span>
                <span className="font-medium">{group.group}</span>
                {filled > 0 && (
                  <span className="text-[10px] text-primary-300 bg-primary-500/10 border border-primary-500/30 rounded px-1">
                    {filled}
                  </span>
                )}
              </span>
            </button>
            {isOpen && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2 pt-1">
                {group.skills.map((skill) => (
                  <div key={skill} className="flex items-center gap-1.5">
                    <label
                      htmlFor={idPrefix ? `${idPrefix}-${skill}` : undefined}
                      className="text-xs text-gray-300 w-20 shrink-0 truncate"
                      title={skill}
                    >
                      {skill}
                    </label>
                    <input
                      id={idPrefix ? `${idPrefix}-${skill}` : undefined}
                      type="number"
                      min={0} max={100}
                      placeholder="—"
                      value={values[skill] ?? ''}
                      onChange={(e) => onChange(skill, e.target.value)}
                      className="w-14 bg-surface border border-surface-border rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
