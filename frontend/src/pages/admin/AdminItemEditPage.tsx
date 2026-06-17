import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { itemsApi } from '../../api/items'
import { useAuth } from '../../contexts/AuthContext'
import { useDialog } from '../../contexts/DialogContext'
import ComboInput from '../../components/ComboInput'
import Spinner from '../../components/Spinner'
import EquipmentSetPiecesEditor, { type EquipmentSetForm, emptyEquipmentSetForm, formToPieces, membersToForm } from '../../components/EquipmentSetPiecesEditor'
import type { Item, ItemCategory, AssetPlacement, AssetFunction } from '../../types'
import { applyCopyRename, type CopyRename } from '../../utils/copyRename'
import { parseHashtags, formatHashtags } from '../../utils/hashtags'
import { SPECIAL_CONDITIONS, BASE_STAT_LABELS, STAT_INPUT_COLUMNS, SKILL_GROUPS, ASSET_PLACEMENTS, ASSET_FUNCTIONS, MASTERIES, bonusValueForSave } from '../../utils/constants'
import { useBonusValueLabels } from '../../hooks/useBonusValueLabels'
import { useBinderLabels } from '../../hooks/useBinderLabels'
import { OTHER_PET, OTHER_RECIPE } from '../../utils/itemType'

const ALL_SPECIAL = Object.keys(SPECIAL_CONDITIONS)

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
  is_exclusive: boolean // この付加効果が専用技か
}

const emptyValue = (): BonusValueForm => ({ value: '', value_unit: '%', label: '' })
const emptyBonus = (): BonusEffectForm => ({
  effect_name: '', values: [emptyValue()], description: '', is_exclusive: false,
})

const isEquipmentSetCategory = (cat: ItemCategory) =>
  cat.parent_id === null && cat.name === '装備セット'

const isAssetCategory = (cat: ItemCategory) =>
  cat.parent_id === null && cat.name === 'アセット'

// 「その他」配下の子カテゴリ判定（未開封ペット / レシピ）
const isPetCategory = (cat: ItemCategory) => cat.name === OTHER_PET
const isRecipeCategory = (cat: ItemCategory) => cat.name === OTHER_RECIPE

export default function AdminItemEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // 一覧から渡された絞り込みフィルタ（未確認 / 確認済み / すべて）。戻るときに復元する。
  // copyRename はコピーダイアログで入力した名前変更（置換・末尾追加）。
  const incomingState = location.state as { filter?: string; copyRename?: CopyRename } | null
  const incomingFilter = incomingState?.filter
  const copyRename = incomingState?.copyRename
  const { alert, confirm } = useDialog()
  const { user } = useAuth()
  const bonusValueLabelOptions = useBonusValueLabels()
  const binderLabelOptions = useBinderLabels()
  // editor / admin は全アイテムを編集でき、「確認済みにする」も可能
  const isEditor = user?.role === 'editor' || user?.role === 'admin'
  const isNew = !id
  // コピーして編集：新規作成時に ?copy=<id> が付いていたら、コピー元アイテムを複製してフォームに展開する（editor 以上）
  const [searchParams] = useSearchParams()
  const copyFromId = isNew ? Number(searchParams.get('copy')) || null : null

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
    is_equipment_set: false as boolean,
    skill_requirements: {} as Record<string, string>,
    mastery_requirements: [] as string[],
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
  // ハッシュタグ（admin/editor は固定タグ・通常タグの両方を1つのテキストボックスで編集。例: #和風 #袴）
  const [fixedTagsText, setFixedTagsText] = useState('')
  const [userTagsText, setUserTagsText] = useState('')

  useEffect(() => {
    // アイテム情報をフォーム状態へ展開する。asCopy のときは新規作成として複製するため、
    // 既存レコードに紐づくID（装備セット部位・付加効果）と確認状態を引き継がない。
    const fillFormFromItem = (item: Item, asCopy: boolean) => {
      setForm({
        category_id: String(item.category.id),
        // コピー時はダイアログで入力した名前変更（置換・末尾追加）を適用する
        name: asCopy ? applyCopyRename(item.name, copyRename) : item.name,
        description: item.description ?? '',
        base_stats: Object.fromEntries(Object.entries(item.base_stats).map(([k, v]) => [k, String(v)])),
        special_conditions: [...item.special_conditions],
        dyeable: item.dyeable,
        mithril: item.mithril ?? false,
        is_equipment_set: item.is_equipment_set ?? false,
        skill_requirements: Object.fromEntries(
          Object.entries(item.skill_requirements ?? {}).map(([k, v]) => [k, String(v)])
        ),
        mastery_requirements: [...(item.mastery_requirements ?? [])],
        placement: (item.placement ?? '') as '' | AssetPlacement,
        asset_width: item.asset_width != null ? String(item.asset_width) : '',
        asset_height: item.asset_height != null ? String(item.asset_height) : '',
        storage_count: item.storage_count != null ? String(item.storage_count) : '',
        special_function: (item.special_function ?? '') as '' | AssetFunction,
        pet_name: item.pet_name ?? '',
        recipe_name: item.recipe_name ?? '',
        recipe_binder: item.recipe_binder ?? '',
      })
      if (!asCopy) setVerifiedStatus(item.verified_status)
      // ハッシュタグをテキストボックスへ復元（コピー時も引き継ぐ）
      const tags = item.hashtags ?? []
      setFixedTagsText(formatHashtags(tags.filter((h) => h.is_fixed)))
      setUserTagsText(formatHashtags(tags.filter((h) => !h.is_fixed)))
      // 装備セットの構成部位をフォーム状態へ復元（部位リスト＋追加効果/付加効果グループ）
      if (item.is_equipment_set) {
        const equipForm = membersToForm(item.set_members ?? [])
        // コピー時は各部位アイテム名にも名前変更を適用する
        setEquipSetForm(asCopy
          ? { ...equipForm, parts: equipForm.parts.map((p) => ({ ...p, id: undefined, name: applyCopyRename(p.name, copyRename) })) }
          : equipForm)
      }
      setBonusEffects(item.bonus_effects.map((e) => ({
        ...(asCopy ? {} : { id: e.id }),
        effect_name: e.effect_name,
        values: e.values.length > 0
          ? e.values.map((v) => ({ value: String(v.value), value_unit: v.value_unit, label: v.label ?? '' }))
          : [emptyValue()],
        description: e.description ?? '',
        is_exclusive: !!e.is_exclusive,
      })))
    }

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
          navigate('/items')
          return
        }
        fillFormFromItem(item, false)
      }))
    } else if (copyFromId) {
      // コピーして編集（editor 以上）：コピー元を取得し、新規作成フォームへ複製する
      tasks.push((async () => {
        if (!isEditor) {
          await alert('アイテムのコピーは編集者・管理者のみ利用できます。', { title: 'コピーできません' })
          navigate('/items')
          return
        }
        const r = await itemsApi.get(copyFromId)
        fillFormFromItem(r.data, true)
      })())
    }
    Promise.all(tasks).finally(() => setMastersLoading(false))
  }, [id, isNew, copyFromId])

  // 選択中カテゴリ判定（子カテゴリも含めて検索）
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

  // 一覧に戻るとき、編集中アイテムの種別タブを復元するための state
  const listState = {
    mode: (isSkill ? 'skill' : isAsset ? 'asset' : isOther ? 'other' : 'equipment') as 'equipment' | 'skill' | 'asset' | 'other',
    filter: incomingFilter,
  }
  const backToList = () => navigate('/items', { state: listState })

  const setField = (key: keyof typeof form, value: unknown) =>
    setForm((p) => ({ ...p, [key]: value }))

  // カテゴリIDから種別を判定（部位↔装備セット切替時のデータ移行に使う）
  const classifyCategory = (catId: string): 'equipSet' | 'asset' | 'skill' | 'plain' | 'none' => {
    const cat = allCategories.find((c) => String(c.id) === catId)
    if (!cat) return 'none'
    if (isEquipmentSetCategory(cat)) return 'equipSet'
    if (isAssetCategory(cat)) return 'asset'
    const parent = cat.parent_id ? categories.find((c) => c.id === cat.parent_id) : cat
    return parent?.name === 'テクニック' ? 'skill' : 'plain'
  }

  const handleCategoryChange = async (val: string) => {
    const prev = classifyCategory(form.category_id)
    const next = classifyCategory(val)

    // 部位（装備品）→ 装備セット: 入力済みの追加効果・付加効果・特殊条件を「全部位共通」グループ[0]へ引き継ぐ。
    // グループ[0] のみ置き換え、部位（parts）や追加済みの設定グループ[1..] はそのまま残す。
    if (prev === 'plain' && next === 'equipSet') {
      const baseStatsGroups = [
        { partCategoryIds: [], base_stats: { ...form.base_stats }, special_conditions: [...form.special_conditions] },
        ...equipSetForm.baseStatsGroups.slice(1),
      ]
      const bonusGroups = [
        {
          partCategoryIds: [],
          bonus_effects: bonusEffects
            .filter((e) => e.effect_name.trim() || e.values.some((v) => v.value) || e.description.trim())
            .map((e) => ({
              effect_name: e.effect_name,
              values: e.values.map((v) => ({ value: v.value, value_unit: v.value_unit, label: v.label })),
              description: e.description,
              is_exclusive: e.is_exclusive,
            })),
        },
        ...equipSetForm.bonusGroups.slice(1),
      ]

      // 現在編集中の部位（名前・カテゴリ・ミスリル・染色）を、そのまま構成部位として引用するか確認する。
      // 「はい」で部位リストへ追加（効果は上の全部位共通グループから適用される）。
      const partCatId = Number(form.category_id)
      const hasPlainData = form.name.trim() !== ''
        || Object.keys(form.base_stats).length > 0
        || bonusEffects.some((e) => e.effect_name.trim())
      let parts = equipSetForm.parts
      if (hasPlainData) {
        const quote = await confirm(
          `現在編集中の「${form.name.trim() || '(名称未設定)'}」を、この装備セットの構成部位としてそのまま登録しますか？\n` +
          '「はい」で部位リストに追加し、入力済みの追加効果・付加効果を引き継ぎます。',
          { title: '構成部位として登録', confirmLabel: 'はい（部位として登録）', cancelLabel: 'いいえ' }
        )
        if (quote && !parts.some((p) => p.category_id === partCatId)) {
          parts = [...parts, {
            // 既存アイテムの編集時は id を引き継ぎ、出品・取引などの紐付けを保持したまま構成部位にする
            // （保存時は convert-to-set で、このアイテム自身をメンバーに含む新しいセットを作成する）
            ...(!isNew && id ? { id: Number(id) } : {}),
            category_id: partCatId, name: form.name.trim(), mithril: form.mithril, dyeable: form.dyeable ?? false,
          }]
        }
      }

      setEquipSetForm({ parts, baseStatsGroups, bonusGroups })
      setField('category_id', val)
      return
    }

    // 装備セット → 部位（装備品）: 「全部位共通」グループ[0]の追加効果・付加効果・特殊条件を部位フォームへ戻す。
    if (prev === 'equipSet' && next === 'plain') {
      const bg = equipSetForm.baseStatsGroups[0]
      const ng = equipSetForm.bonusGroups[0]
      setForm((p) => ({
        ...p,
        category_id: val,
        base_stats: { ...(bg?.base_stats ?? {}) },
        special_conditions: [...(bg?.special_conditions ?? [])],
      }))
      setBonusEffects((ng?.bonus_effects ?? []).map((e) => ({
        effect_name: e.effect_name,
        values: e.values.length > 0 ? e.values.map((v) => ({ ...v })) : [emptyValue()],
        description: e.description,
        is_exclusive: e.is_exclusive,
      })))
      return
    }

    // それ以外（既存挙動）: 装備セット以外のトップレベル種別（アセット）へ切り替えたら構成部位を初期化する
    const cat = categories.find((c) => String(c.id) === val)
    if (cat && !isEquipmentSetCategory(cat)) {
      setEquipSetForm(emptyEquipmentSetForm())
    }
    setField('category_id', val)
  }

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

  const toggleMastery = (code: string) =>
    setForm((p) => ({
      ...p,
      mastery_requirements: p.mastery_requirements.includes(code)
        ? p.mastery_requirements.filter((x) => x !== code)
        : [...p.mastery_requirements, code],
    }))

  const setBonus = (idx: number, key: 'effect_name' | 'description', val: string) =>
    setBonusEffects((prev) => prev.map((e, i) => i === idx ? { ...e, [key]: val } : e))

  const setBonusExclusive = (idx: number, val: boolean) =>
    setBonusEffects((prev) => prev.map((e, i) => i === idx ? { ...e, is_exclusive: val } : e))

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

  // 確認済み → 確認中に戻す（フォーム保存とは独立した即時操作）
  const handleUnverify = async () => {
    if (saving || !id) return
    setSaving(true)
    try {
      await itemsApi.unverify(Number(id))
      setVerifiedStatus('unverified')
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } })?.response
      await alert(res?.data?.message ?? '確認状態の変更に失敗しました。', { title: 'エラー' })
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const andVerify = verifyAfterSaveRef.current
    verifyAfterSaveRef.current = false
    let pieces: ReturnType<typeof formToPieces> = []
    if (isEquipSet) {
      pieces = formToPieces(equipSetForm)
      // editor/admin は構成部位を必須に。一般ユーザーは未入力でも登録可（運営が後から設定）。
      if (pieces.length === 0 && isEditor) {
        await alert('装備セットは構成部位を1つ以上登録してください。', { title: '入力エラー' })
        return
      }
      if (pieces.some((p) => !p.name)) {
        await alert('各部位の名前を入力してください。', { title: '入力エラー' })
        return
      }
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
        is_equipment_set: isEquipSet,
        ...(isEquipSet ? { pieces } : {}),
        skill_requirements: showSkillRequirements
          ? Object.fromEntries(
              Object.entries(form.skill_requirements)
                .filter(([, v]) => v !== '')
                .map(([k, v]) => [k, Number(v)])
            )
          : null,
        mastery_requirements: isSkill ? form.mastery_requirements : null,
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
        // ハッシュタグ（admin/editor は固定タグ・通常タグの両方を編集可。固定は権限をバックエンドでも再チェック）
        ...(isEditor ? { fixed_hashtags: parseHashtags(fixedTagsText), user_hashtags: parseHashtags(userTagsText) } : {}),
        // 新規登録時、editor/admin は確認済み(確認済みにして追加)/確認中(確認中で追加)を選べる
        ...(isNew && isEditor ? { verified: andVerify } : {}),
      }
      // 既存の部位アイテム自身を構成部位に含む装備セットへ変換するケース
      // （部位として残し、出品などの紐付けを保持したまま新しいセット本体を作成する）。
      const convertSelfToSet = !isNew && isEquipSet && pieces.some((p) => p.id != null && Number(p.id) === Number(id))
      let itemId: number
      if (convertSelfToSet) {
        const created = await itemsApi.convertToSet(Number(id), {
          category_id: Number(form.category_id),
          name: form.name,
          description: form.description,
          pieces,
        })
        itemId = created.data.id
      } else if (isNew) {
        const created = await itemsApi.create(payload as Parameters<typeof itemsApi.create>[0])
        itemId = created.data.id
      } else {
        await itemsApi.update(Number(id), payload as Parameters<typeof itemsApi.update>[1])
        itemId = Number(id)
      }
      // 新規は payload の verified で確認状態を確定済みなので、追加の verify 呼び出しは不要
      if (andVerify && !isNew) await itemsApi.verify(itemId)
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
          {!isNew ? 'アイテムを編集' : copyFromId ? 'アイテムをコピーして追加' : 'アイテムを追加'}
        </h1>
        {!isNew && verifiedStatus === 'verified' && (
          <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">✓ 確認済み</span>
        )}
        {!isNew && verifiedStatus === 'unverified' && (
          <span className="ml-auto text-xs text-yellow-400 flex items-center gap-1">⚠ 確認中</span>
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
              onChange={(e) => { void handleCategoryChange(e.target.value) }}
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

        {/* 「その他」種別：適切な種別がない場合の案内 */}
        {isOther && (
          <div className="bg-amber-900/20 border border-amber-700/40 rounded px-4 py-3 text-sm text-amber-200 leading-relaxed">
            適切な種別がない場合、運営掲示板でご連絡おねがいします！
          </div>
        )}

        {/* 未開封ペット：ペット名 */}
        {isPet && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">未開封ペット情報</h2>
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
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">レシピ情報</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">バインダー</label>
              <ComboInput
                id="recipe-binder"
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

        {/* 装備セット：構成部位（アイテム名・説明の下で入力） */}
        {isEquipSet && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">
            構成部位 {isEditor && <span className="text-red-400">*</span>}
            <span className="text-gray-500 font-normal ml-1 text-xs">（部位ごとに名前・効果を設定。同じ設定の部位はまとめて入力できます）</span>
          </h2>
          {!isEditor && (
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
            {STAT_INPUT_COLUMNS.map((column, ci) => (
              <div key={ci} className="space-y-3">
                {column.map((key) => (
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
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-amber-200 select-none">
                    <input
                      type="checkbox"
                      checked={e.is_exclusive}
                      onChange={(ev) => setBonusExclusive(idx, ev.target.checked)}
                      className="accent-amber-500"
                    />
                    専用技
                  </label>
                  <button
                    type="button" onClick={() => removeBonus(idx)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    削除
                  </button>
                </div>
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
                      options={bonusValueLabelOptions}
                      placeholder="項目名（例: 物理ダメージ）"
                      className="bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 w-full"
                    />
                    {v.value_unit === 'checking' ? (
                      <span className="text-xs text-gray-500 px-2 py-1.5 truncate" title="項目名のみ設定（値は確認中）">項目名のみ</span>
                    ) : (
                      <input
                        type={v.value_unit === 'text' ? 'text' : 'number'}
                        placeholder={v.value_unit === 'text' ? 'テキスト' : '数値'}
                        value={v.value}
                        onChange={(ev) => setBonusValue(idx, vi, 'value', ev.target.value)}
                        className="bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                      />
                    )}
                    <select
                      value={v.value_unit}
                      onChange={(ev) => setBonusValue(idx, vi, 'value_unit', ev.target.value)}
                      className="bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
                    >
                      <option value="%">%</option>
                      <option value="fixed">固定値</option>
                      <option value="x">倍率(x)</option>
                      <option value="per_min">毎分</option>
                      <option value="text">テキスト</option>
                      <option value="checking">確認中</option>
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

        {/* スキル要件（テクニック＋レシピ） */}
        {showSkillRequirements && (
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-300">必要スキル値</h2>
            {isRecipe && (
              <p className="text-xs text-gray-500">このレシピの作成に必要なスキル値があれば入力してください。</p>
            )}
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

        {/* 必要マスタリ（テクニックのみ） */}
        {isSkill && (
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-300">必要マスタリ</h2>
            <p className="text-xs text-gray-500">発動に必要なマスタリがあれば選択してください（構成スキルを全て40で発動）。複数選択した場合は「いずれか」で発動（OR条件）。</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MASTERIES.map((m) => (
                <label
                  key={m.code}
                  className={`flex flex-col gap-0.5 px-3 py-2 rounded border cursor-pointer transition-colors ${
                    form.mastery_requirements.includes(m.code)
                      ? 'border-primary-500/60 bg-primary-500/10'
                      : 'border-surface-border hover:border-gray-500'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.mastery_requirements.includes(m.code)}
                      onChange={() => toggleMastery(m.code)}
                      className="accent-primary-500 w-4 h-4"
                    />
                    <span className="font-medium text-gray-200">{m.name}</span>
                    <span className="text-xs text-gray-500">【{m.code}】</span>
                  </span>
                  <span className="text-[11px] text-gray-500 pl-6">{m.skills.join('・')}</span>
                </label>
              ))}
            </div>
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

        {/* ミスリル（装備品のみ。専用技は付加効果ごとに設定する） */}
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
        </div>
        )}

        {/* 特殊条件（スキル・装備セット・その他以外。装備セットは部位側で設定） */}
        {!isSkill && !isEquipSet && !isOther && (
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

        {/* ハッシュタグ（editor / admin）。固定タグ・通常タグともテキストボックスで複数入力（例: #和風 #袴）。 */}
        {isEditor && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300">ハッシュタグ</h2>
          <div>
            <label className="block text-xs text-gray-400 mb-1">固定ハッシュタグ</label>
            <input
              type="text"
              value={fixedTagsText}
              onChange={(e) => setFixedTagsText(e.target.value)}
              placeholder="#公式 #イベント（スペース区切り）"
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
            />
            <p className="text-xs text-gray-500 mt-0.5">
              一覧でアイテム名の下に📌付きで表示されます。一般ユーザーは削除・編集できません。
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">通常ハッシュタグ</label>
            <input
              type="text"
              value={userTagsText}
              onChange={(e) => setUserTagsText(e.target.value)}
              placeholder="#和風 #袴（スペース区切り）"
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
            />
            <p className="text-xs text-gray-500 mt-0.5">
              一般ユーザーも自由に追加・編集できる通常タグです。
            </p>
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
          {isNew && isEditor ? (
            // 新規登録：editor / admin は確認状態を選んで追加する
            <>
              <button
                type="submit" disabled={saving}
                onClick={() => { verifyAfterSaveRef.current = false }}
                className="px-6 py-2 text-sm bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-md transition-colors"
              >
                {saving ? '保存中...' : '確認中で追加'}
              </button>
              <button
                type="submit" disabled={saving}
                onClick={() => { verifyAfterSaveRef.current = true }}
                className="px-6 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md transition-colors"
              >
                {saving ? '保存中...' : '確認済みにして追加'}
              </button>
            </>
          ) : (
            <>
              <button
                type="submit" disabled={saving}
                onClick={() => { verifyAfterSaveRef.current = false }}
                className="px-6 py-2 text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white rounded-md transition-colors"
              >
                {saving ? '保存中...' : isNew ? 'アイテムを追加' : '変更を保存'}
              </button>
              {/* 保存して確認済みにする：editor / admin のみ・既存の確認中アイテム編集時 */}
              {!isNew && isEditor && verifiedStatus === 'unverified' && (
                <button
                  type="submit" disabled={saving}
                  onClick={() => { verifyAfterSaveRef.current = true }}
                  className="px-6 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md transition-colors"
                >
                  {saving ? '保存中...' : '保存して確認済みにする'}
                </button>
              )}
              {/* 確認中に戻す：editor / admin のみ・既存の確認済みアイテム編集時（フォーム保存とは独立した即時操作） */}
              {!isNew && isEditor && verifiedStatus === 'verified' && (
                <button
                  type="button" disabled={saving}
                  onClick={handleUnverify}
                  className="px-6 py-2 text-sm bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-md transition-colors"
                >
                  {saving ? '処理中...' : '確認中に戻す'}
                </button>
              )}
            </>
          )}
        </div>
      </form>
      )}
    </div>
  )
}
