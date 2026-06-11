import { useEffect, useState } from 'react'
import { itemsApi } from '../api/items'
import { useDialog } from '../contexts/DialogContext'
import ComboInput from './ComboInput'
import Spinner from './Spinner'
import type { Item, ItemCategory, AssetPlacement, AssetFunction } from '../types'
import { SPECIAL_CONDITIONS, BASE_STAT_LABELS, SKILL_GROUPS, ASSET_PLACEMENTS, ASSET_FUNCTIONS } from '../utils/constants'
import { useBonusValueLabels } from '../hooks/useBonusValueLabels'

interface BonusValueForm {
  value: string
  value_unit: string
  label: string
}
interface BonusEffectForm {
  effect_name: string
  values: BonusValueForm[]
  description: string
}

const emptyValue = (): BonusValueForm => ({ value: '', value_unit: '%', label: '' })
const emptyBonus = (): BonusEffectForm => ({ effect_name: '', values: [emptyValue()], description: '' })

const ALL_SPECIAL = Object.keys(SPECIAL_CONDITIONS)
const ALL_STATS = Object.keys(BASE_STAT_LABELS)

// 「装備セット」親カテゴリの判定（name で判断）
const isEquipmentSetCategory = (cat: ItemCategory) =>
  cat.parent_id === null && cat.name === '装備セット'

// 「アセット」親カテゴリの判定（子カテゴリなし・name で判断）
const isAssetCategory = (cat: ItemCategory) =>
  cat.parent_id === null && cat.name === 'アセット'

interface Props {
  onRegistered: (item: Item) => void
  onCancel: () => void
  initialName?: string
}

export default function NewItemForm({ onRegistered, onCancel, initialName = '' }: Props) {
  const { alert } = useDialog()
  const bonusValueLabelOptions = useBonusValueLabels()
  const [categories, setCategories] = useState<ItemCategory[]>([])
  const [mastersLoading, setMastersLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    category_id: '',
    name: initialName,
    description: '',
    base_stats: {} as Record<string, string>,
    special_conditions: [] as string[],
    set_piece_category_ids: [] as number[],
    skill_requirements: {} as Record<string, string>,
    dyeable: null as boolean | null,
    mithril: false,
    exclusive_skill: false,
    placement: '' as '' | AssetPlacement,
    asset_width: '',
    asset_height: '',
    storage_count: '',
    special_function: '' as '' | AssetFunction,
  })
  const [bonusEffects, setBonusEffects] = useState<BonusEffectForm[]>([])

  useEffect(() => {
    setMastersLoading(true)
    itemsApi.categories()
      .then((r) => setCategories(r.data))
      .finally(() => setMastersLoading(false))
  }, [])

  // 選択中のカテゴリ判定（子カテゴリも含めて検索）
  const allCategories = categories.flatMap((c) => [c, ...(c.children ?? [])])
  const selectedCategory = allCategories.find((c) => String(c.id) === form.category_id)
  const isEquipSet = selectedCategory ? isEquipmentSetCategory(selectedCategory) : false
  const isAsset = selectedCategory ? isAssetCategory(selectedCategory) : false
  // 親カテゴリが「テクニック」かどうか
  const isSkill = (() => {
    if (!selectedCategory) return false
    const parent = selectedCategory.parent_id
      ? categories.find((c) => c.id === selectedCategory.parent_id)
      : selectedCategory
    return parent?.name === 'テクニック'
  })()
  // 装備品（効果系の入力欄を出す通常アイテム）
  const isPlain = !isSkill && !isAsset

  const setField = (key: keyof typeof form, value: unknown) =>
    setForm((p) => ({ ...p, [key]: value }))

  const setStat = (key: string, val: string) =>
    setForm((p) => ({ ...p, base_stats: { ...p.base_stats, [key]: val } }))

  const removeStat = (key: string) =>
    setForm((p) => { const n = { ...p.base_stats }; delete n[key]; return { ...p, base_stats: n } })

  const toggleCond = (c: string) =>
    setForm((p) => ({
      ...p,
      special_conditions: p.special_conditions.includes(c)
        ? p.special_conditions.filter((x) => x !== c)
        : [...p.special_conditions, c],
    }))

  const togglePart = (id: number) =>
    setForm((p) => ({
      ...p,
      set_piece_category_ids: p.set_piece_category_ids.includes(id)
        ? p.set_piece_category_ids.filter((x) => x !== id)
        : [...p.set_piece_category_ids, id],
    }))

  const setBonus = (i: number, key: 'effect_name' | 'description', val: string) =>
    setBonusEffects((prev) => prev.map((e, idx) => idx === i ? { ...e, [key]: val } : e))

  const setBonusVal = (bi: number, vi: number, key: keyof BonusValueForm, val: string) =>
    setBonusEffects((prev) => prev.map((e, i) => i !== bi ? e : {
      ...e, values: e.values.map((v, j) => j === vi ? { ...v, [key]: val } : v),
    }))

  // カテゴリ変更時に装備セット以外に切り替えたら部位選択をリセット
  const handleCategoryChange = (val: string) => {
    const cat = categories.find((c) => String(c.id) === val)
    if (cat && !isEquipmentSetCategory(cat)) {
      setForm((p) => ({ ...p, category_id: val, set_piece_category_ids: [] }))
    } else {
      setField('category_id', val)
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (isEquipSet && form.set_piece_category_ids.length === 0) {
      await alert('装備セットは構成部位を1つ以上選択してください。', { title: '入力エラー' })
      return
    }
    setError('')
    setSaving(true)
    try {
      // 装備品固有の効果系はアセット・テクニックでは送らない
      const res = await itemsApi.create({
        category_id: Number(form.category_id),
        name: form.name,
        description: form.description,
        base_stats: isPlain ? Object.fromEntries(
          Object.entries(form.base_stats).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])
        ) : {},
        // 特殊条件は装備品・アセットで使用（テクニックは無し）
        special_conditions: isSkill ? [] : form.special_conditions,
        dyeable: isPlain ? form.dyeable : null,
        mithril: isPlain ? form.mithril : false,
        exclusive_skill: isPlain ? form.exclusive_skill : false,
        skill_requirements: isSkill
          ? Object.fromEntries(
              Object.entries(form.skill_requirements)
                .filter(([, v]) => v !== '')
                .map(([k, v]) => [k, Number(v)])
            )
          : null,
        // アセット固有
        placement: isAsset ? (form.placement || null) : null,
        asset_width: isAsset && form.asset_width !== '' ? Number(form.asset_width) : null,
        asset_height: isAsset && form.asset_height !== '' ? Number(form.asset_height) : null,
        storage_count: isAsset && form.storage_count !== '' ? Number(form.storage_count) : null,
        special_function: isAsset ? (form.special_function || null) : null,
        bonus_effects: isPlain ? bonusEffects
          .filter((e) => e.effect_name.trim())
          .map((e) => ({
            effect_name: e.effect_name,
            values: e.values
              .filter((v) => v.value !== '')
              .map((v) => ({ value: Number(v.value), value_unit: v.value_unit, label: v.label || undefined })),
            description: e.description,
          })) : [],
        ...(isEquipSet && {
          is_equipment_set: true,
          set_piece_category_ids: form.set_piece_category_ids,
        }),
      })
      onRegistered(res.data)
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } })?.response
      if (res?.data?.errors) {
        // バリデーションエラー（最初の項目を表示）
        const first = Object.values(res.data.errors)[0]?.[0]
        setError(first ?? '入力内容を確認してください。')
      } else if (res?.status === 401) {
        setError('ログインが必要です。ログインし直してください。')
      } else if (res?.data?.message) {
        setError(res.data.message)
      } else {
        setError('アイテムの登録に失敗しました。通信状態またはサーバーの状態をご確認ください。')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-yellow-300">⚠ 新規アイテム登録（未確認として登録されます）</p>
        <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-white">キャンセル</button>
      </div>

      {mastersLoading ? (
        <Spinner center />
      ) : (
      <>
      {/* 基本情報 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">種別 <span className="text-red-400">*</span></label>
          <select
            required
            value={form.category_id}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
          >
            <option value="">選択してください</option>
            {/* 装備セット（先頭） */}
            {categories.filter(isEquipmentSetCategory).map((cat) => (
              <option key={cat.id} value={cat.id}>⚔ 装備セット</option>
            ))}
            {/* アセット（子カテゴリなし・単体選択） */}
            {categories.filter(isAssetCategory).map((cat) => (
              <option key={cat.id} value={cat.id}>🏠 アセット</option>
            ))}
            {/* 通常の子カテゴリ（武器・防具・装飾品など） */}
            {categories
              .filter((cat) => !isEquipmentSetCategory(cat) && !isAssetCategory(cat))
              .map((cat) => (
                <optgroup key={cat.id} label={cat.name}>
                  {cat.children?.map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">アイテム名 <span className="text-red-400">*</span></label>
          <input
            required type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">説明</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setField('description', e.target.value)}
          className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
          placeholder="アイテムの説明（任意）"
        />
      </div>

      {/* 装備セット：構成部位選択 */}
      {isEquipSet && (
        <div className="border border-amber-600/40 bg-amber-900/10 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-300 mb-2">
            ⚔ 構成部位 <span className="text-red-400">*</span>
            <span className="text-gray-400 font-normal ml-1">（複数選択可）</span>
          </p>
          <div className="space-y-2">
            {categories
              .filter((cat) => !isEquipmentSetCategory(cat) && cat.name !== 'テクニック' && (cat.children ?? []).length > 0)
              .map((cat) => (
                <div key={cat.id}>
                  <p className="text-xs text-gray-500 mb-1">{cat.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(cat.children ?? []).map((child) => {
                      const checked = form.set_piece_category_ids.includes(child.id)
                      return (
                        <label
                          key={child.id}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded border cursor-pointer text-xs transition-colors ${
                            checked
                              ? 'border-amber-500/60 bg-amber-900/30 text-amber-200'
                              : 'border-surface-border text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePart(child.id)}
                            className="accent-amber-500"
                          />
                          {child.name}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
          {form.set_piece_category_ids.length > 0 && (
            <p className="text-xs text-amber-400 mt-2">選択中: {form.set_piece_category_ids.length}部位</p>
          )}
        </div>
      )}

      {/* 必要スキル（スキルカテゴリのみ） */}
      {isSkill && (
        <div className="border border-primary-500/30 bg-primary-500/5 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-primary-400">必要スキル値</p>
          {SKILL_GROUPS.map((group) => (
            <div key={group.group}>
              <p className="text-xs text-gray-500 mb-1.5">{group.group}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {group.skills.map((skill) => (
                  <div key={skill} className="flex items-center gap-1.5">
                    <label className="text-xs text-gray-300 w-20 shrink-0 truncate" title={skill}>{skill}</label>
                    <input
                      type="number"
                      min={0} max={100}
                      placeholder="—"
                      value={form.skill_requirements[skill] ?? ''}
                      onChange={(e) => setForm((p) => ({
                        ...p,
                        skill_requirements: { ...p.skill_requirements, [skill]: e.target.value }
                      }))}
                      className="w-14 bg-surface border border-surface-border rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* アセット固有パラメータ */}
      {isAsset && (
        <div className="border border-primary-500/30 bg-primary-500/5 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-primary-400">アセット情報</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">設置個所</label>
              <select
                value={form.placement}
                onChange={(e) => setField('placement', e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              >
                <option value="">選択なし</option>
                {ASSET_PLACEMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">特殊機能</label>
              <select
                value={form.special_function}
                onChange={(e) => setField('special_function', e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              >
                <option value="">なし</option>
                {ASSET_FUNCTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">サイズ（横）</label>
              <input
                type="number" min={1} placeholder="—"
                value={form.asset_width}
                onChange={(e) => setField('asset_width', e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">サイズ（縦）</label>
              <input
                type="number" min={1} placeholder="—"
                value={form.asset_height}
                onChange={(e) => setField('asset_height', e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">ストレージ数</label>
              <input
                type="number" min={0} placeholder="—"
                value={form.storage_count}
                onChange={(e) => setField('storage_count', e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* 特殊条件（アセット） */}
      {isAsset && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-gray-300 py-1 flex items-center gap-1 select-none">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span> 特殊条件
          </summary>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {ALL_SPECIAL.map((c) => (
              <label
                key={c}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                  form.special_conditions.includes(c)
                    ? 'border-red-500/60 bg-red-900/20 text-red-300'
                    : 'border-surface-border text-gray-400 hover:border-gray-500'
                }`}
              >
                <input type="checkbox" checked={form.special_conditions.includes(c)} onChange={() => toggleCond(c)} className="accent-red-500" />
                <span className="font-medium">{c}</span>
                <span className="truncate">{SPECIAL_CONDITIONS[c]}</span>
              </label>
            ))}
          </div>
        </details>
      )}

      {isPlain && (
      <>
      {/* 染色 */}
      <div>
        <p className="text-sm text-gray-300 mb-1.5">染色</p>
        <div className="flex gap-2">
          {([true, false] as const).map((val) => (
            <label
              key={String(val)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                form.dyeable === val
                  ? 'border-primary-500 bg-primary-900/20 text-gray-200'
                  : 'border-surface-border text-gray-400 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="new-dyeable"
                checked={form.dyeable === val}
                onChange={() => setField('dyeable', val)}
                className="accent-primary-500"
              />
              {val ? '染色可' : '染色不可'}
            </label>
          ))}
        </div>
      </div>

      {/* ミスリル・専用技 */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.mithril}
            onChange={(e) => setField('mithril', e.target.checked)}
            className="accent-primary-500"
          />
          <span className="text-sm text-gray-300">ミスリル</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.exclusive_skill}
            onChange={(e) => setField('exclusive_skill', e.target.checked)}
            className="accent-primary-500"
          />
          <span className="text-sm text-gray-300">専用技</span>
        </label>
      </div>

      {/* 追加効果 */}
      <details className="group">
        <summary className="cursor-pointer text-xs font-semibold text-gray-300 py-1 flex items-center gap-1 select-none">
          <span className="group-open:rotate-90 transition-transform inline-block">▶</span> 追加効果
        </summary>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ALL_STATS.map((key) => (
            <div key={key}>
              <label className="block text-xs text-gray-400 mb-0.5">{BASE_STAT_LABELS[key]}</label>
              <input
                type="number" placeholder="—"
                value={form.base_stats[key] ?? ''}
                onChange={(e) => e.target.value ? setStat(key, e.target.value) : removeStat(key)}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
              />
            </div>
          ))}
        </div>
      </details>

      {/* 付加効果 */}
      <details className="group">
        <summary className="cursor-pointer text-xs font-semibold text-gray-300 py-1 flex items-center gap-1 select-none">
          <span className="group-open:rotate-90 transition-transform inline-block">▶</span> 付加効果
        </summary>
        <div className="mt-2 space-y-3">
          {bonusEffects.map((e, idx) => (
            <div key={idx} className="border border-surface-border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">付加効果 {idx + 1}</span>
                <button type="button" onClick={() => setBonusEffects((p) => p.filter((_, i) => i !== idx))} className="text-xs text-red-400 hover:text-red-300">削除</button>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">効果名</label>
                <input
                  type="text" placeholder="例: 炎の魔剣"
                  value={e.effect_name}
                  onChange={(ev) => setBonus(idx, 'effect_name', ev.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                />
              </div>
              <div className="space-y-1.5">
                {e.values.map((v, vi) => (
                  <div key={vi} className="grid grid-cols-[1fr_80px_80px_auto] gap-1.5 items-center">
                    <ComboInput
                      id={`new-bonus-${idx}-${vi}`}
                      value={v.label}
                      onChange={(val) => setBonusVal(idx, vi, 'label', val)}
                      options={bonusValueLabelOptions}
                      placeholder="項目名"
                      className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 w-full"
                    />
                    <input
                      type="number" placeholder="数値"
                      value={v.value}
                      onChange={(ev) => setBonusVal(idx, vi, 'value', ev.target.value)}
                      className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                    />
                    <select
                      value={v.value_unit}
                      onChange={(ev) => setBonusVal(idx, vi, 'value_unit', ev.target.value)}
                      className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-primary-500"
                    >
                      <option value="%">%</option>
                      <option value="fixed">固定値</option>
                      <option value="x">倍率</option>
                      <option value="per_min">毎分</option>
                    </select>
                    {e.values.length > 1 && (
                      <button type="button" onClick={() => setBonusEffects((prev) => prev.map((b, i) => i !== idx ? b : { ...b, values: b.values.filter((_, j) => j !== vi) }))} className="text-red-400 text-sm">×</button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setBonusEffects((prev) => prev.map((b, i) => i !== idx ? b : { ...b, values: [...b.values, emptyValue()] }))}
                  className="text-xs text-primary-500 hover:underline"
                >
                  + 数値を追加
                </button>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">備考</label>
                <input
                  type="text" placeholder="例: 物理ダメージ+15%、命中-5%"
                  value={e.description}
                  onChange={(ev) => setBonus(idx, 'description', ev.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setBonusEffects((p) => [...p, emptyBonus()])}
            className="text-xs bg-primary-500/20 hover:bg-primary-500/30 border border-primary-500/40 text-primary-500 px-3 py-1.5 rounded w-full transition-colors"
          >
            + 付加効果を追加
          </button>
        </div>
      </details>

      {/* 特殊条件 */}
      <details className="group">
        <summary className="cursor-pointer text-xs font-semibold text-gray-300 py-1 flex items-center gap-1 select-none">
          <span className="group-open:rotate-90 transition-transform inline-block">▶</span> 特殊条件
        </summary>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {ALL_SPECIAL.map((c) => (
            <label
              key={c}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                form.special_conditions.includes(c)
                  ? 'border-red-500/60 bg-red-900/20 text-red-300'
                  : 'border-surface-border text-gray-400 hover:border-gray-500'
              }`}
            >
              <input type="checkbox" checked={form.special_conditions.includes(c)} onChange={() => toggleCond(c)} className="accent-red-500" />
              <span className="font-medium">{c}</span>
              <span className="truncate">{SPECIAL_CONDITIONS[c]}</span>
            </label>
          ))}
        </div>
      </details>
      </>
      )}
      </>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-600/50 rounded px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => handleSubmit()}
        disabled={saving || !form.category_id || !form.name}
        className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
      >
        {saving ? '登録中...' : 'アイテムを登録して選択'}
      </button>
    </div>
  )
}
