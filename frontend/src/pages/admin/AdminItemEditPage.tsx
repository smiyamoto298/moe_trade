import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { itemsApi } from '../../api/items'
import { useAuth } from '../../contexts/AuthContext'
import { useDialog } from '../../contexts/DialogContext'
import ComboInput from '../../components/ComboInput'
import Spinner from '../../components/Spinner'
import type { ItemCategory, AssetPlacement, AssetFunction } from '../../types'
import { SPECIAL_CONDITIONS, BASE_STAT_LABELS, BONUS_VALUE_LABEL_OPTIONS, SKILL_GROUPS, ASSET_PLACEMENTS, ASSET_FUNCTIONS } from '../../utils/constants'

const ALL_SPECIAL = Object.keys(SPECIAL_CONDITIONS)
const ALL_STATS = Object.keys(BASE_STAT_LABELS)

interface BonusValueForm {
  value: string
  value_unit: string
  label: string
}

interface BonusEffectForm {
  id?: number
  effect_name: string
  values: BonusValueForm[]
  description: string
}

const emptyValue = (): BonusValueForm => ({ value: '', value_unit: '%', label: '' })
const emptyBonus = (): BonusEffectForm => ({
  effect_name: '', values: [emptyValue()], description: '',
})

const isEquipmentSetCategory = (cat: ItemCategory) =>
  cat.parent_id === null && cat.name === '装備セット'

const isAssetCategory = (cat: ItemCategory) =>
  cat.parent_id === null && cat.name === 'アセット'

export default function AdminItemEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // 一覧から渡された絞り込みフィルタ（未確認 / 確認済み / すべて）。戻るときに復元する。
  const incomingFilter = (location.state as { filter?: string } | null)?.filter
  const { alert } = useDialog()
  const { user } = useAuth()
  // editor / admin は全アイテムを編集でき、「確認済みにする」も可能
  const isEditor = user?.role === 'editor' || user?.role === 'admin'
  const isNew = !id

  const [categories, setCategories] = useState<ItemCategory[]>([])
  const [mastersLoading, setMastersLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifiedStatus, setVerifiedStatus] = useState<'verified' | 'unverified' | null>(null)
  // 「保存して確認済みにする」が押されたかどうか（submit 時に参照）
  const verifyAfterSaveRef = useRef(false)
  const [form, setForm] = useState({
    category_id: '',
    name: '',
    description: '',
    base_stats: {} as Record<string, string>,
    special_conditions: [] as string[],
    dyeable: null as boolean | null,
    mithril: false as boolean,
    exclusive_skill: false as boolean,
    is_equipment_set: false as boolean,
    set_piece_category_ids: [] as number[],
    skill_requirements: {} as Record<string, string>,
    placement: '' as '' | AssetPlacement,
    asset_width: '',
    asset_height: '',
    storage_count: '',
    special_function: '' as '' | AssetFunction,
  })
  const [bonusEffects, setBonusEffects] = useState<BonusEffectForm[]>([])

  useEffect(() => {
    setMastersLoading(true)
    const tasks: Promise<unknown>[] = [
      itemsApi.categories().then((r) => setCategories(r.data)),
    ]
    if (!isNew && id) {
      tasks.push(itemsApi.get(Number(id)).then(async (r) => {
        const item = r.data
        // 編集権限チェック：editor/admin は常に可。user は自分の未確認(未ロック)のみ。
        const canEdit = isEditor
          || (!!user && item.submitted_by === user.id && item.verified_status === 'unverified' && !item.locked_by_staff)
        if (!canEdit) {
          await alert(
            item.locked_by_staff
              ? 'このアイテムは編集者・管理者によって更新されたため、編集できません。'
              : 'このアイテムを編集する権限がありません。',
            { title: '編集できません' }
          )
          navigate('/admin/items')
          return
        }
        setForm({
          category_id: String(item.category.id),
          name: item.name,
          description: item.description ?? '',
          base_stats: Object.fromEntries(Object.entries(item.base_stats).map(([k, v]) => [k, String(v)])),
          special_conditions: [...item.special_conditions],
          dyeable: item.dyeable,
          mithril: item.mithril ?? false,
          exclusive_skill: item.exclusive_skill ?? false,
          is_equipment_set: item.is_equipment_set ?? false,
          set_piece_category_ids: item.set_piece_category_ids ?? [],
          skill_requirements: Object.fromEntries(
            Object.entries(item.skill_requirements ?? {}).map(([k, v]) => [k, String(v)])
          ),
          placement: (item.placement ?? '') as '' | AssetPlacement,
          asset_width: item.asset_width != null ? String(item.asset_width) : '',
          asset_height: item.asset_height != null ? String(item.asset_height) : '',
          storage_count: item.storage_count != null ? String(item.storage_count) : '',
          special_function: (item.special_function ?? '') as '' | AssetFunction,
        })
        setVerifiedStatus(item.verified_status)
        setBonusEffects(item.bonus_effects.map((e) => ({
          id: e.id,
          effect_name: e.effect_name,
          values: e.values.length > 0
            ? e.values.map((v) => ({ value: String(v.value), value_unit: v.value_unit, label: v.label ?? '' }))
            : [emptyValue()],
          description: e.description ?? '',
        })))
      }))
    }
    Promise.all(tasks).finally(() => setMastersLoading(false))
  }, [id, isNew])

  // 選択中カテゴリ判定（子カテゴリも含めて検索）
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

  // 一覧に戻るとき、編集中アイテムの種別タブを復元するための state
  const listState = {
    mode: (isSkill ? 'skill' : isAsset ? 'asset' : 'equipment') as 'equipment' | 'skill' | 'asset',
    filter: incomingFilter,
  }
  const backToList = () => navigate('/admin/items', { state: listState })

  const setField = (key: keyof typeof form, value: unknown) =>
    setForm((p) => ({ ...p, [key]: value }))

  const handleCategoryChange = (val: string) => {
    const cat = categories.find((c) => String(c.id) === val)
    if (cat && !isEquipmentSetCategory(cat)) {
      setForm((p) => ({ ...p, category_id: val, set_piece_category_ids: [] }))
    } else {
      setField('category_id', val)
    }
  }

  const togglePart = (partId: number) =>
    setForm((p) => ({
      ...p,
      set_piece_category_ids: p.set_piece_category_ids.includes(partId)
        ? p.set_piece_category_ids.filter((x) => x !== partId)
        : [...p.set_piece_category_ids, partId],
    }))

  const setStat = (key: string, val: string) =>
    setForm((p) => ({ ...p, base_stats: { ...p.base_stats, [key]: val } }))

  const removeStat = (key: string) =>
    setForm((p) => { const next = { ...p.base_stats }; delete next[key]; return { ...p, base_stats: next } })

  const toggleCondition = (c: string) =>
    setForm((p) => ({
      ...p,
      special_conditions: p.special_conditions.includes(c)
        ? p.special_conditions.filter((x) => x !== c)
        : [...p.special_conditions, c],
    }))

  const setBonus = (idx: number, key: 'effect_name' | 'description', val: string) =>
    setBonusEffects((prev) => prev.map((e, i) => i === idx ? { ...e, [key]: val } : e))

  const setBonusValue = (bonusIdx: number, valIdx: number, key: keyof BonusValueForm, val: string) =>
    setBonusEffects((prev) => prev.map((e, i) =>
      i !== bonusIdx ? e : {
        ...e,
        values: e.values.map((v, j) => j === valIdx ? { ...v, [key]: val } : v),
      }
    ))

  const addBonusValue = (bonusIdx: number) =>
    setBonusEffects((prev) => prev.map((e, i) =>
      i === bonusIdx ? { ...e, values: [...e.values, emptyValue()] } : e
    ))

  const removeBonusValue = (bonusIdx: number, valIdx: number) =>
    setBonusEffects((prev) => prev.map((e, i) =>
      i !== bonusIdx ? e : { ...e, values: e.values.filter((_, j) => j !== valIdx) }
    ))

  const addBonus = () => setBonusEffects((prev) => [...prev, emptyBonus()])

  const removeBonus = (idx: number) =>
    setBonusEffects((prev) => prev.filter((_, i) => i !== idx))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const andVerify = verifyAfterSaveRef.current
    verifyAfterSaveRef.current = false
    if (isEquipSet && form.set_piece_category_ids.length === 0) {
      await alert('装備セットは構成部位を1つ以上選択してください。', { title: '入力エラー' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        category_id: Number(form.category_id),
        name: form.name,
        description: form.description,
        base_stats: isPlain ? Object.fromEntries(
          Object.entries(form.base_stats)
            .filter(([, v]) => v !== '')
            .map(([k, v]) => [k, Number(v)])
        ) : {},
        special_conditions: isSkill ? [] : form.special_conditions,
        dyeable: isPlain ? form.dyeable : null,
        mithril: isPlain ? form.mithril : false,
        exclusive_skill: isPlain ? form.exclusive_skill : false,
        is_equipment_set: isEquipSet,
        set_piece_category_ids: isEquipSet ? form.set_piece_category_ids : [],
        skill_requirements: isSkill
          ? Object.fromEntries(
              Object.entries(form.skill_requirements)
                .filter(([, v]) => v !== '')
                .map(([k, v]) => [k, Number(v)])
            )
          : null,
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
      }
      let itemId: number
      if (isNew) {
        const created = await itemsApi.create(payload as Parameters<typeof itemsApi.create>[0])
        itemId = created.data.id
      } else {
        await itemsApi.update(Number(id), payload as Parameters<typeof itemsApi.update>[1])
        itemId = Number(id)
      }
      if (andVerify) await itemsApi.verify(itemId)
      backToList()
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response
      const first = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : undefined
      await alert(first ?? res?.data?.message ?? 'アイテムの保存に失敗しました。', { title: 'エラー' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={backToList} className="text-gray-400 hover:text-white text-sm">← 一覧に戻る</button>
        <h1 className="text-xl font-bold text-white">
          {isNew ? 'アイテムを追加' : 'アイテムを編集'}
        </h1>
        {!isNew && verifiedStatus === 'verified' && (
          <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">✓ 確認済み</span>
        )}
        {!isNew && verifiedStatus === 'unverified' && (
          <span className="ml-auto text-xs text-yellow-400 flex items-center gap-1">⚠ 未確認</span>
        )}
      </div>

      {mastersLoading ? (
        <Spinner center />
      ) : (
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本情報 */}
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">基本情報</h2>
          <div>
            <label className="block text-xs text-gray-400 mb-1">種別</label>
            <select
              required
              value={form.category_id}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
            >
              <option value="">カテゴリを選択</option>
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

          {/* 装備セット：構成部位選択 */}
          {isEquipSet && (
            <div className="border border-amber-600/40 bg-amber-900/10 rounded-lg p-4">
              <p className="text-xs font-semibold text-amber-300 mb-3">
                ⚔ 構成部位 <span className="text-red-400">*</span>
                <span className="text-gray-400 font-normal ml-1">（複数選択可）</span>
              </p>
              <div className="space-y-3">
                {categories
                  .filter((cat) => !isEquipmentSetCategory(cat) && cat.name !== 'テクニック' && (cat.children ?? []).length > 0)
                  .map((cat) => (
                    <div key={cat.id}>
                      <p className="text-xs text-gray-500 mb-1.5">{cat.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(cat.children ?? []).map((child) => {
                          const checked = form.set_piece_category_ids.includes(child.id)
                          return (
                            <label
                              key={child.id}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
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

          <div>
            <label className="block text-xs text-gray-400 mb-1">アイテム名</label>
            <input
              required type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">説明</label>
            <textarea
              rows={3} value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>
        </div>

        {/* アセット情報（アセットのみ） */}
        {isAsset && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">アセット情報</h2>
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-3 gap-4">
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

        {/* 追加効果（装備品のみ） */}
        {isPlain && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">追加効果</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ALL_STATS.map((key) => (
              <div key={key}>
                <label className="block text-xs text-gray-400 mb-1">{BASE_STAT_LABELS[key]}</label>
                <input
                  type="number" placeholder="—"
                  value={form.base_stats[key] ?? ''}
                  onChange={(e) => e.target.value ? setStat(key, e.target.value) : removeStat(key)}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                />
              </div>
            ))}
          </div>
        </div>
        )}

        {/* 付加効果（装備品のみ） */}
        {isPlain && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">付加効果</h2>
            <button
              type="button" onClick={addBonus}
              className="text-xs bg-primary-500/20 hover:bg-primary-500/40 border border-primary-500/40 text-primary-500 px-3 py-1 rounded transition-colors"
            >
              + 追加
            </button>
          </div>

          {bonusEffects.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">付加効果がありません</p>
          )}

          {bonusEffects.map((e, idx) => (
            <div key={idx} className="border border-surface-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 font-medium">付加効果 {idx + 1}</p>
                <button
                  type="button" onClick={() => removeBonus(idx)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  削除
                </button>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">効果名</label>
                <input
                  type="text" required
                  placeholder="例: 炎の魔剣"
                  value={e.effect_name}
                  onChange={(ev) => setBonus(idx, 'effect_name', ev.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">数値</label>
                  <button
                    type="button"
                    onClick={() => addBonusValue(idx)}
                    className="text-xs text-primary-500 hover:text-primary-500/80"
                  >
                    + 数値を追加
                  </button>
                </div>
                {e.values.map((v, vi) => (
                  <div key={vi} className="grid grid-cols-[1fr_90px_1fr_auto] gap-2 items-center">
                    <ComboInput
                      id={`bonus-${idx}-val-${vi}`}
                      value={v.label}
                      onChange={(val) => setBonusValue(idx, vi, 'label', val)}
                      options={BONUS_VALUE_LABEL_OPTIONS}
                      placeholder="項目名（例: 物理ダメージ）"
                      className="bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 w-full"
                    />
                    <input
                      type="number" placeholder="数値"
                      value={v.value}
                      onChange={(ev) => setBonusValue(idx, vi, 'value', ev.target.value)}
                      className="bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                    />
                    <select
                      value={v.value_unit}
                      onChange={(ev) => setBonusValue(idx, vi, 'value_unit', ev.target.value)}
                      className="bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
                    >
                      <option value="%">%</option>
                      <option value="fixed">固定値</option>
                      <option value="x">倍率(x)</option>
                      <option value="per_min">毎分</option>
                    </select>
                    {e.values.length > 1 && (
                      <button type="button" onClick={() => removeBonusValue(idx, vi)} className="text-red-400 hover:text-red-300 text-sm px-1">×</button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">説明文</label>
                <input
                  type="text" placeholder="例: 物理ダメージ+15%、命中-5%"
                  value={e.description}
                  onChange={(ev) => setBonus(idx, 'description', ev.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
          ))}
        </div>
        )}

        {/* スキル要件（スキルカテゴリのみ） */}
        {isSkill && (
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-300">必要スキル値</h2>
            {SKILL_GROUPS.map((group) => (
              <div key={group.group}>
                <p className="text-xs text-gray-500 mb-2">{group.group}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {group.skills.map((skill) => (
                    <div key={skill} className="flex items-center gap-2">
                      <label className="text-xs text-gray-300 w-20 shrink-0">{skill}</label>
                      <input
                        type="number"
                        min={0} max={100}
                        placeholder="—"
                        value={form.skill_requirements[skill] ?? ''}
                        onChange={(e) => setForm((p) => ({
                          ...p,
                          skill_requirements: { ...p.skill_requirements, [skill]: e.target.value }
                        }))}
                        className="w-16 bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 染色（装備品のみ） */}
        {isPlain && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">染色</h2>
          <div className="flex gap-3">
            {([true, false] as const).map((val) => (
              <label
                key={String(val)}
                className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-colors ${
                  form.dyeable === val
                    ? 'border-primary-500 bg-primary-900/20'
                    : 'border-surface-border hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="dyeable"
                  checked={form.dyeable === val}
                  onChange={() => setForm((p) => ({ ...p, dyeable: val }))}
                  className="accent-primary-500"
                />
                <span className="text-xs text-gray-300">
                  {val ? '染色可' : '染色不可'}
                </span>
              </label>
            ))}
          </div>
        </div>
        )}

        {/* ミスリル・専用技（装備品のみ） */}
        {isPlain && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.mithril}
              onChange={(e) => setForm((p) => ({ ...p, mithril: e.target.checked }))}
              className="accent-primary-500"
            />
            <span className="text-sm font-semibold text-gray-300">ミスリル</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.exclusive_skill}
              onChange={(e) => setForm((p) => ({ ...p, exclusive_skill: e.target.checked }))}
              className="accent-primary-500"
            />
            <span className="text-sm font-semibold text-gray-300">専用技</span>
          </label>
        </div>
        )}

        {/* 特殊条件（スキル以外） */}
        {!isSkill && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">特殊条件</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_SPECIAL.map((c) => (
              <label
                key={c}
                className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-colors ${
                  form.special_conditions.includes(c)
                    ? 'border-red-500/60 bg-red-900/20'
                    : 'border-surface-border hover:border-gray-500'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.special_conditions.includes(c)}
                  onChange={() => toggleCondition(c)}
                  className="accent-red-500 w-4 h-4"
                />
                <span className="text-xs">
                  <span className="text-red-300 font-medium">{c}</span>
                  <span className="text-gray-400 ml-1">{SPECIAL_CONDITIONS[c]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button" onClick={backToList}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-surface-border rounded-md transition-colors"
          >
            キャンセル
          </button>
          <button
            type="submit" disabled={saving}
            onClick={() => { verifyAfterSaveRef.current = false }}
            className="px-6 py-2 text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white rounded-md transition-colors"
          >
            {saving ? '保存中...' : isNew ? 'アイテムを追加' : '変更を保存'}
          </button>
          {/* 保存して確認済みにする：editor / admin のみ・既存の未確認アイテム編集時 */}
          {!isNew && isEditor && verifiedStatus === 'unverified' && (
            <button
              type="submit" disabled={saving}
              onClick={() => { verifyAfterSaveRef.current = true }}
              className="px-6 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md transition-colors"
            >
              {saving ? '保存中...' : '保存して確認済みにする'}
            </button>
          )}
        </div>
      </form>
      )}
    </div>
  )
}
