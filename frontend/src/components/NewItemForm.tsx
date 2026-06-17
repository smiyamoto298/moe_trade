import { useEffect, useState } from 'react'
import { itemsApi } from '../api/items'
import { useDialog } from '../contexts/DialogContext'
import { useAuth } from '../contexts/AuthContext'
import ComboInput from './ComboInput'
import Spinner from './Spinner'
import EquipmentSetPiecesEditor, { type EquipmentSetForm, emptyEquipmentSetForm, formToPieces } from './EquipmentSetPiecesEditor'
import type { Item, ItemCategory, AssetPlacement, AssetFunction } from '../types'
import { SPECIAL_CONDITIONS, BASE_STAT_LABELS, STAT_INPUT_COLUMNS, SKILL_GROUPS, ASSET_PLACEMENTS, ASSET_FUNCTIONS, MASTERIES, bonusValueForSave } from '../utils/constants'
import { useBonusValueLabels } from '../hooks/useBonusValueLabels'
import { useBinderLabels } from '../hooks/useBinderLabels'
import { OTHER_PET, OTHER_RECIPE } from '../utils/itemType'

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
}

const emptyValue = (): BonusValueForm => ({ value: '', value_unit: '%', label: '' })
const emptyBonus = (): BonusEffectForm => ({ effect_name: '', values: [emptyValue()], description: '', is_exclusive: false })

const ALL_SPECIAL = Object.keys(SPECIAL_CONDITIONS)

// 「装備セット」親カテゴリの判定（name で判断）
const isEquipmentSetCategory = (cat: ItemCategory) =>
  cat.parent_id === null && cat.name === '装備セット'

// 「アセット」親カテゴリの判定（子カテゴリなし・name で判断）
const isAssetCategory = (cat: ItemCategory) =>
  cat.parent_id === null && cat.name === 'アセット'

// 「その他」配下の子カテゴリ判定（未開封ペット / レシピ）
const isPetCategory = (cat: ItemCategory) => cat.name === OTHER_PET
const isRecipeCategory = (cat: ItemCategory) => cat.name === OTHER_RECIPE

interface Props {
  onRegistered: (item: Item) => void
  onCancel: () => void
  initialName?: string
}

export default function NewItemForm({ onRegistered, onCancel, initialName = '' }: Props) {
  const { alert } = useDialog()
  const { user } = useAuth()
  // editor/admin は構成部位の入力を必須とする。一般ユーザーは未入力でも登録でき、運営に任せられる。
  const isStaff = user?.role === 'editor' || user?.role === 'admin'
  const bonusValueLabelOptions = useBonusValueLabels()
  const binderLabelOptions = useBinderLabels()
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
    skill_requirements: {} as Record<string, string>,
    mastery_requirements: [] as string[],
    dyeable: null as boolean | null,
    mithril: false,
    placement: '' as '' | AssetPlacement,
    asset_width: '',
    asset_height: '',
    storage_count: '',
    special_function: '' as '' | AssetFunction,
    pet_name: '',
    recipe_name: '',
    recipe_binder: '',
  })
  const [bonusEffects, setBonusEffects] = useState<BonusEffectForm[]>([])
  // 装備セットの構成部位（部位リスト＋追加効果/付加効果の設定グループ）
  const [equipSetForm, setEquipSetForm] = useState<EquipmentSetForm>(emptyEquipmentSetForm())

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
  // 「その他」種別（未開封ペット / レシピ）
  const isPet = selectedCategory ? isPetCategory(selectedCategory) : false
  const isRecipe = selectedCategory ? isRecipeCategory(selectedCategory) : false
  const isOther = isPet || isRecipe
  // 親カテゴリが「テクニック」かどうか
  const isSkill = (() => {
    if (!selectedCategory) return false
    const parent = selectedCategory.parent_id
      ? categories.find((c) => c.id === selectedCategory.parent_id)
      : selectedCategory
    return parent?.name === 'テクニック'
  })()
  // 装備品（効果系の入力欄を出す通常アイテム）。装備セット本体は効果を持たない（部位側で設定）。
  const isPlain = !isSkill && !isAsset && !isEquipSet && !isOther
  // 必要スキル値の入力欄を出す種別（テクニック＋レシピ）。レシピは作成に必要なスキル値を持つ。
  const showSkillRequirements = isSkill || isRecipe

  const setField = (key: keyof typeof form, value: unknown) =>
    setForm((p) => ({ ...p, [key]: value }))

  const setStat = (key: string, val: string) =>
    setForm((p) => ({ ...p, base_stats: { ...p.base_stats, [key]: val } }))

  const removeStat = (key: string) =>
    setForm((p) => { const n = { ...p.base_stats }; delete n[key]; return { ...p, base_stats: n } })

  const toggleMastery = (code: string) =>
    setForm((p) => ({
      ...p,
      mastery_requirements: p.mastery_requirements.includes(code)
        ? p.mastery_requirements.filter((x) => x !== code)
        : [...p.mastery_requirements, code],
    }))

  const toggleCond = (c: string) =>
    setForm((p) => ({
      ...p,
      special_conditions: p.special_conditions.includes(c)
        ? p.special_conditions.filter((x) => x !== c)
        : [...p.special_conditions, c],
    }))

  const setBonus = (i: number, key: 'effect_name' | 'description', val: string) =>
    setBonusEffects((prev) => prev.map((e, idx) => idx === i ? { ...e, [key]: val } : e))

  const setBonusExclusive = (i: number, val: boolean) =>
    setBonusEffects((prev) => prev.map((e, idx) => idx === i ? { ...e, is_exclusive: val } : e))

  const setBonusVal = (bi: number, vi: number, key: keyof BonusValueForm, val: string) =>
    setBonusEffects((prev) => prev.map((e, i) => i !== bi ? e : {
      ...e, values: e.values.map((v, j) => j === vi ? { ...v, [key]: val } : v),
    }))

  // カテゴリ変更時に装備セット以外に切り替えたら部位入力をリセット
  const handleCategoryChange = (val: string) => {
    const cat = categories.find((c) => String(c.id) === val)
    if (cat && !isEquipmentSetCategory(cat)) {
      setEquipSetForm(emptyEquipmentSetForm())
    }
    setField('category_id', val)
  }

  // verified: editor/admin が「確認済みにして登録」を選んだときのみ true。
  // 一般ユーザーは undefined（サーバー側で常に確認中扱い）。
  const handleSubmit = async (verified?: boolean) => {
    let pieces: ReturnType<typeof formToPieces> = []
    if (isEquipSet) {
      pieces = formToPieces(equipSetForm)
      // editor/admin は構成部位を必須に。一般ユーザーは未入力でも登録可（運営が後から設定）。
      if (pieces.length === 0 && isStaff) {
        await alert('装備セットは構成部位を1つ以上登録してください。', { title: '入力エラー' })
        return
      }
      if (pieces.some((p) => !p.name)) {
        await alert('各部位の名前を入力してください。', { title: '入力エラー' })
        return
      }
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
        skill_requirements: showSkillRequirements
          ? Object.fromEntries(
              Object.entries(form.skill_requirements)
                .filter(([, v]) => v !== '')
                .map(([k, v]) => [k, Number(v)])
            )
          : null,
        mastery_requirements: isSkill ? form.mastery_requirements : null,
        // アセット固有
        placement: isAsset ? (form.placement || null) : null,
        asset_width: isAsset && form.asset_width !== '' ? Number(form.asset_width) : null,
        asset_height: isAsset && form.asset_height !== '' ? Number(form.asset_height) : null,
        storage_count: isAsset && form.storage_count !== '' ? Number(form.storage_count) : null,
        special_function: isAsset ? (form.special_function || null) : null,
        // 「その他」種別固有
        pet_name: isPet ? (form.pet_name.trim() || null) : null,
        recipe_name: isRecipe ? (form.recipe_name.trim() || null) : null,
        recipe_binder: isRecipe ? (form.recipe_binder.trim() || null) : null,
        bonus_effects: isPlain ? bonusEffects
          .filter((e) => e.effect_name.trim())
          .map((e) => ({
            effect_name: e.effect_name,
            values: e.values
              .filter((v) => v.value_unit === 'checking' || v.value !== '')
              .map((v) => ({ value: bonusValueForSave(v), value_unit: v.value_unit, label: v.label || undefined })),
            description: e.description,
            is_exclusive: e.is_exclusive,
          })) : [],
        // editor/admin が選んだ確認状態（一般ユーザーは undefined）
        ...(verified !== undefined && { verified }),
        ...(isEquipSet && {
          is_equipment_set: true,
          pieces,
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
        <p className="text-sm font-semibold text-yellow-300">
          {isStaff ? '新規アイテム登録' : '⚠ 新規アイテム登録（確認中として登録されます）'}
        </p>
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

      {/* 「その他」種別：適切な種別がない場合の案内 */}
      {isOther && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded px-3 py-2 text-sm text-amber-200 leading-relaxed">
          適切な種別がない場合、運営掲示板でご連絡おねがいします！
        </div>
      )}

      {/* 未開封ペット：ペット名 */}
      {isPet && (
        <div className="border border-primary-500/30 bg-primary-500/5 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-primary-400">未開封ペット情報</p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">ペット名</label>
            <input
              type="text"
              value={form.pet_name}
              onChange={(e) => setField('pet_name', e.target.value)}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              placeholder="ペットの名前"
            />
          </div>
        </div>
      )}

      {/* レシピ：バインダー（項目名管理）・レシピ名 */}
      {isRecipe && (
        <div className="border border-primary-500/30 bg-primary-500/5 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-primary-400">レシピ情報</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">バインダー</label>
              <ComboInput
                id="new-recipe-binder"
                value={form.recipe_binder}
                onChange={(val) => setField('recipe_binder', val)}
                options={binderLabelOptions}
                placeholder="バインダー名"
                className="bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">レシピ名</label>
              <input
                type="text"
                value={form.recipe_name}
                onChange={(e) => setField('recipe_name', e.target.value)}
                className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                placeholder="レシピ名"
              />
            </div>
          </div>
        </div>
      )}

      {/* 装備セット：構成部位（設定グループ単位で編集） */}
      {isEquipSet && (
        <div className="border border-amber-600/40 bg-amber-900/10 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-300">
            ⚔ 構成部位 {isStaff && <span className="text-red-400">*</span>}
            <span className="text-gray-400 font-normal ml-1">（部位ごとに名前・効果を設定。同じ設定の部位はまとめて入力できます）</span>
          </p>
          {!isStaff && (
            <p className="text-xs text-amber-200 bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1.5 leading-relaxed">
              構成部位の設定は管理者に丸投げでも登録できます！個人で運営しているので入力いただけたらとても助かります・・！
            </p>
          )}
          <EquipmentSetPiecesEditor
            categories={categories}
            value={equipSetForm}
            onChange={setEquipSetForm}
            bonusValueLabelOptions={bonusValueLabelOptions}
          />
        </div>
      )}

      {/* 必要スキル値（テクニック＋レシピ） */}
      {showSkillRequirements && (
        <div className="border border-primary-500/30 bg-primary-500/5 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-primary-400">必要スキル値</p>
          {isRecipe && (
            <p className="text-[10px] text-gray-500">このレシピの作成に必要なスキル値があれば入力してください。</p>
          )}
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

      {/* 必要マスタリ（テクニックのみ） */}
      {isSkill && (
        <div className="border border-primary-500/30 bg-primary-500/5 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-primary-400">必要マスタリ</p>
          <p className="text-[10px] text-gray-500">発動に必要なマスタリがあれば選択してください（構成スキルを全て40で発動）。複数選択した場合は「いずれか」で発動（OR条件）。</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {MASTERIES.map((m) => (
              <label
                key={m.code}
                className={`flex flex-col gap-0.5 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                  form.mastery_requirements.includes(m.code)
                    ? 'border-primary-500/60 bg-primary-500/10 text-gray-200'
                    : 'border-surface-border text-gray-400 hover:border-gray-500'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.mastery_requirements.includes(m.code)}
                    onChange={() => toggleMastery(m.code)}
                    className="accent-primary-500"
                  />
                  <span className="font-medium text-gray-200">{m.name}</span>
                  <span className="text-gray-500">【{m.code}】</span>
                </span>
                <span className="text-[10px] text-gray-500 pl-6">{m.skills.join('・')}</span>
              </label>
            ))}
          </div>
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

      {/* ミスリル（専用技は付加効果ごとに設定する） */}
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
      </div>

      {/* 追加効果 */}
      <details className="group">
        <summary className="cursor-pointer text-xs font-semibold text-gray-300 py-1 flex items-center gap-1 select-none">
          <span className="group-open:rotate-90 transition-transform inline-block">▶</span> 追加効果
        </summary>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {STAT_INPUT_COLUMNS.map((column, ci) => (
            <div key={ci} className="space-y-2">
              {column.map((key) => (
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
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-amber-200 select-none">
                    <input type="checkbox" checked={e.is_exclusive} onChange={(ev) => setBonusExclusive(idx, ev.target.checked)} className="accent-amber-500" />
                    専用技
                  </label>
                  <button type="button" onClick={() => setBonusEffects((p) => p.filter((_, i) => i !== idx))} className="text-xs text-red-400 hover:text-red-300">削除</button>
                </div>
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
                    {v.value_unit === 'checking' ? (
                      <span className="text-xs text-gray-500 px-1 py-1 truncate" title="項目名のみ設定（値は確認中）">項目名のみ</span>
                    ) : (
                      <input
                        type={v.value_unit === 'text' ? 'text' : 'number'}
                        placeholder={v.value_unit === 'text' ? 'テキスト' : '数値'}
                        value={v.value}
                        onChange={(ev) => setBonusVal(idx, vi, 'value', ev.target.value)}
                        className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                      />
                    )}
                    <select
                      value={v.value_unit}
                      onChange={(ev) => setBonusVal(idx, vi, 'value_unit', ev.target.value)}
                      className="bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-primary-500"
                    >
                      <option value="%">%</option>
                      <option value="fixed">固定値</option>
                      <option value="x">倍率</option>
                      <option value="per_min">毎分</option>
                      <option value="text">テキスト</option>
                      <option value="checking">確認中</option>
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

      {isStaff ? (
        // editor/admin は確認状態を選んで登録する
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={saving || !form.category_id || !form.name}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? '登録中...' : '確認済みにして登録'}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={saving || !form.category_id || !form.name}
            className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? '登録中...' : '確認中で登録'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={saving || !form.category_id || !form.name}
          className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? '登録中...' : 'アイテムを登録して選択'}
        </button>
      )}
    </div>
  )
}
