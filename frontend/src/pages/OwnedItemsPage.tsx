import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDialog } from '../contexts/DialogContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { itemsApi } from '../api/items'
import { buyRequestsApi } from '../api/buyRequests'
import { excludedItemsApi } from '../api/excludedItems'
import client from '../api/client'
import NewItemForm from '../components/NewItemForm'
import CandidateSelectModal from '../components/CandidateSelectModal'
import PriceAnalyticsModal from '../components/PriceAnalyticsModal'
import Spinner from '../components/Spinner'
import { BaseStatBadges } from '../components/equipmentCells'
import type { Item, InventoryData, InventoryStorageMode, OwnedItem, BuyPriceInfo, MyItemCounts, ExclusionType } from '../types'
import { parseItemBox, isTransferNg, isTruncatedName, truncatedBase } from '../utils/itemBoxPaste'
import { newLocalId, emptyInventory, buildExclusionSet, isExcluded, selectedCommonNames } from '../utils/inventory'
import { compareJa } from '../utils/collator'
import { getStorageMode, loadInitialInventory, saveInventory, persistStorageMode, getSkipExcludeConfirm, setSkipExcludeConfirm, getAppliedExclusionTypeIds, setAppliedExclusionTypeIds, getDisabledCommonNames, setDisabledCommonNames } from '../utils/inventoryStore'

const SAMPLE = `No▼\tアイテム名\tカテゴリ\t転送\t個数
1\tアイネの抱っこぬいぐるみ\t中級者レア\t○\t1
3\tアクアマリン\t中級者アンコモン\t○\t321`

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function OwnedItemsPage() {
  usePageMeta('マイペ整理', '公式サイトのアイテムボックスを貼り付けて、所持アイテムを管理できます。')
  const { confirm, alert } = useDialog()
  const navigate = useNavigate()

  // ---- 保存先・台帳データ ----
  const [mode, setMode] = useState<InventoryStorageMode>(() => getStorageMode())
  const [inventory, setInventory] = useState<InventoryData>(emptyInventory())
  const [loading, setLoading] = useState(true)

  // ---- 除外（共通＋個別） ----
  // 共通除外（管理者）はアイテム名＋種別IDで保持し、「適用する種別」で絞り込む。
  const [commonItems, setCommonItems] = useState<{ name: string; type_id: number }[]>([])
  const [exclusionTypes, setExclusionTypes] = useState<ExclusionType[]>([])
  // ユーザーが適用する種別ID（端末ローカル設定）。null は全種別を適用（既定）。
  const [appliedTypeIds, setAppliedTypeIds] = useState<number[] | null>(() => getAppliedExclusionTypeIds())
  // 既定種別「その他」のうち個別にOFFにした共通除外アイテム名（端末ローカル設定）。
  const [disabledOtherNames, setDisabledOtherNames] = useState<string[]>(() => getDisabledCommonNames())

  // ---- 貼り付け ----
  const [raw, setRaw] = useState('')
  const [parsing, setParsing] = useState(false)
  const [pasteResult, setPasteResult] = useState<string | null>(null)
  // 貼り付け先アカウント（null = 未割り当て）
  const [pasteAccountId, setPasteAccountId] = useState<string | null>(null)

  // ---- 表示フィルタ ----
  const [filterAccountId, setFilterAccountId] = useState<string>('all') // 'all' | accountId | 'unassigned'
  const [markedOnly, setMarkedOnly] = useState(false)

  // ---- 買取中価格 ----
  const [buyPrices, setBuyPrices] = useState<Record<number, BuyPriceInfo>>({})

  // ---- 自分の募集中の出品・買取件数（item_id ごと。出品中表示に使用） ----
  const [myItemCounts, setMyItemCounts] = useState<MyItemCounts | null>(null)
  useEffect(() => {
    client.get<MyItemCounts>('/mypage/item-counts').then((r) => setMyItemCounts(r.data)).catch(() => {})
  }, [])

  // ---- モーダル ----
  const [newItemRowId, setNewItemRowId] = useState<string | null>(null)
  // 新規登録モーダルに渡す初期アイテム名（候補ダイアログから登録する場合は検索キーワードを引き継ぐ）
  const [newItemInitialName, setNewItemInitialName] = useState('')
  const [candidateRowId, setCandidateRowId] = useState<string | null>(null)
  const [analyticsItem, setAnalyticsItem] = useState<{ id: number; name: string } | null>(null)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [exclusionModalOpen, setExclusionModalOpen] = useState(false)
  // 共通除外の「適用する種別」設定モーダル（個別除外リストとは別）
  const [commonExclusionModalOpen, setCommonExclusionModalOpen] = useState(false)

  // ---- スクロール追従（表示切替バー・テーブルヘッダーを画面上部で固定） ----
  // グローバルヘッダー（お知らせバナー込み）と表示切替バーの実測高さを基準に、
  // sticky の top オフセットを算出する。バナーの有無やモバイルで高さが変わるため動的計測する。
  const filterBarRef = useRef<HTMLDivElement>(null)
  const [headerH, setHeaderH] = useState(56)
  const [filterBarH, setFilterBarH] = useState(0)
  useEffect(() => {
    if (loading || typeof ResizeObserver === 'undefined') return
    const headerEl = document.querySelector('header')
    const barEl = filterBarRef.current
    const measure = () => {
      if (headerEl) setHeaderH(headerEl.getBoundingClientRect().height)
      if (barEl) setFilterBarH(barEl.getBoundingClientRect().height)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (headerEl) ro.observe(headerEl)
    if (barEl) ro.observe(barEl)
    return () => ro.disconnect()
  }, [loading])

  // ---- 保存状態・離脱ガード ----
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const dirtyRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<InventoryData>(inventory)
  const modeRef = useRef<InventoryStorageMode>(mode)
  latestRef.current = inventory
  modeRef.current = mode

  // ---- 初期ロード ----
  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      // 保存先モードはサーバー（ユーザー単位）を正として取得する。
      // これにより、ある端末で「サーバー」を選べば別端末でも同じ保存先が適用される。
      loadInitialInventory().catch(() => ({ mode: getStorageMode(), data: emptyInventory() })),
      excludedItemsApi.list().then((r) => r.data).catch(() => ({ types: [], items: [] })),
    ]).then(([{ mode: loadedMode, data: inv }, common]) => {
      if (!active) return
      setMode(loadedMode)
      modeRef.current = loadedMode
      setInventory(inv)
      setCommonItems(common.items)
      setExclusionTypes(common.types)
      // 既定の貼り付け先は先頭アカウント
      setPasteAccountId(inv.accounts[0]?.id ?? null)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  // 取り込み先は常に実在のアカウントを指すようにする（未割り当ては許容しない）。
  // アカウントが1つ以上あり、現在の選択が無効／未選択なら先頭アカウントを既定にする。
  useEffect(() => {
    if (inventory.accounts.length > 0 && !inventory.accounts.some((a) => a.id === pasteAccountId)) {
      setPasteAccountId(inventory.accounts[0].id)
    }
  }, [inventory.accounts, pasteAccountId])

  // ---- 一覧表示時の自動再紐づけ ----
  // 登録アイテムと未紐づけ（itemId=null）の行を、一覧を表示するタイミングで登録アイテムへ再照合し、
  // 一致したものを自動でリンクする。取り込み時点では未登録だったアイテムが後から新規登録された場合などに、
  // ページを開き直すだけで登録アイテム情報（カテゴリ・追加効果・相場・出品判定）が紐づく。
  // 末尾「...」の省略名は誤紐づけを避けるため対象外（候補ボタンで手動選択する）。
  const relinkedRef = useRef(false)
  useEffect(() => {
    if (loading || relinkedRef.current) return
    relinkedRef.current = true
    const names = Array.from(new Set(
      latestRef.current.items
        .filter((i) => i.itemId == null && !isTruncatedName(i.name))
        .map((i) => i.name)
    ))
    if (names.length === 0) return
    let active = true
    itemsApi.matchNames(names)
      .then((res) => {
        if (!active) return
        const map = res.data
        if (Object.keys(map).length === 0) return
        commit((p) => ({
          ...p,
          items: p.items.map((i) =>
            i.itemId == null && !isTruncatedName(i.name) && map[i.name]
              ? { ...i, itemId: map[i.name].id, item: map[i.name] }
              : i
          ),
        }))
      })
      .catch(() => {})
    return () => { active = false }
    // commit は安定参照（再生成されない）ため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // ---- 買取中価格の取得（紐づけ済みアイテムが対象） ----
  const linkedItemIds = useMemo(
    () => Array.from(new Set(inventory.items.map((i) => i.itemId).filter((v): v is number => v != null))),
    [inventory.items]
  )
  const linkedIdsKey = linkedItemIds.join(',')
  useEffect(() => {
    if (linkedItemIds.length === 0) { setBuyPrices({}); return }
    let active = true
    buyRequestsApi.prices(linkedItemIds)
      .then((r) => { if (active) setBuyPrices(r.data) })
      .catch(() => {})
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedIdsKey])

  // ---- 保存（自動・デバウンス） ----
  const scheduleSave = () => {
    dirtyRef.current = true
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void flushSave() }, 800)
  }

  const flushSave = async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (!dirtyRef.current) return
    try {
      await saveInventory(modeRef.current, latestRef.current)
      dirtyRef.current = false
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  // inventory を更新しつつ保存を予約する共通ヘルパー
  const commit = (updater: (prev: InventoryData) => InventoryData) => {
    setInventory((prev) => {
      const next = updater(prev)
      latestRef.current = next
      scheduleSave()
      return next
    })
  }

  // 離脱ガード: 未保存があればブラウザ警告。アンマウント時は保存をフラッシュ。
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
      // アンマウント時に保留中の保存を確定する
      if (dirtyRef.current) void saveInventory(modeRef.current, latestRef.current)
    }
  }, [])

  // ページ内の遷移（出品・売却ページ）。未保存があれば確認してから保存して移動する。
  const goWithGuard = async (to: string, state?: unknown) => {
    if (dirtyRef.current) {
      const ok = await confirm('編集中の内容を保存して移動します。よろしいですか？', {
        title: 'ページの移動', confirmLabel: '保存して移動', cancelLabel: 'キャンセル',
      })
      if (!ok) return
      await flushSave()
    }
    navigate(to, state ? { state } : undefined)
  }

  // ---- 保存先の切替（ローカル⇔DB） ----
  const switchMode = async (next: InventoryStorageMode) => {
    if (next === mode) return
    const ok = await confirm(
      next === 'db'
        ? '保存先をサーバー（DB）に切り替えます。現在の内容をサーバーへ移行し、以後は別の端末でも同じデータを参照できます。\n\n※ サーバーに保存したデータは、運営（管理者）が参照できる場合があります。ご了承のうえ切り替えてください。'
        : '保存先をこの端末（ローカルストレージ）に切り替えます。以後の変更はこの端末にのみ保存されます。よろしいですか？',
      {
        title: '保存先の切替',
        confirmLabel: '切り替える',
        cancelLabel: 'キャンセル',
        ...(next === 'db'
          ? { highlight: '※DBに保存する場合、アカウント名はゲームIDではなくニックネームの使用を推奨します！' }
          : {}),
      }
    )
    if (!ok) return
    try {
      // 現在の内容を新しい保存先へ書き出してから切り替える（移行）。
      // その後、保存先モードをユーザー単位でサーバーに記録する（他端末にも反映される）。
      await saveInventory(next, latestRef.current)
      await persistStorageMode(next)
      setMode(next)
      modeRef.current = next
      dirtyRef.current = false
      setSaveState('saved')
    } catch {
      await alert('保存先の切替に失敗しました。時間をおいて再度お試しください。', { title: 'エラー' })
    }
  }

  // ---- アカウント操作 ----
  // アカウントを作成して新しいIDを返す（貼り付け先として即利用するため）
  const createAccount = (name: string): string => {
    const id = newLocalId('acc')
    commit((p) => ({ ...p, accounts: [...p.accounts, { id, name }] }))
    return id
  }

  const addAccount = async () => {
    const name = (await promptName('追加する MoE アカウント名'))?.trim()
    if (!name) return
    setPasteAccountId(createAccount(name))
  }

  const renameAccount = async (id: string, current: string) => {
    const name = (await promptName('アカウント名', current))?.trim()
    if (!name) return
    commit((p) => ({ ...p, accounts: p.accounts.map((a) => (a.id === id ? { ...a, name } : a)) }))
  }

  // アカウント削除。所持アイテムは「未割り当て」を許容しないため、紐づくアイテムも一緒に削除する。
  const removeAccount = async (id: string, name: string) => {
    const count = inventory.items.filter((i) => i.accountId === id).length
    const ok = await confirm(
      `アカウント「${name}」を削除します。${count > 0 ? `紐づく所持アイテム${count}件も削除されます。` : ''}よろしいですか？`,
      { title: 'アカウントの削除', confirmLabel: '削除', cancelLabel: 'キャンセル', danger: true }
    )
    if (!ok) return
    commit((p) => ({
      ...p,
      accounts: p.accounts.filter((a) => a.id !== id),
      items: p.items.filter((i) => i.accountId !== id),
    }))
    if (pasteAccountId === id) setPasteAccountId(null)
    if (filterAccountId === id) setFilterAccountId('all')
  }

  // 簡易プロンプト（DialogContext には prompt が無いため window.prompt を使う）
  const promptName = (label: string, initial = ''): Promise<string | null> =>
    Promise.resolve(window.prompt(label, initial))

  // ---- 貼り付け読込 ----
  // 既定種別「その他」（アイテム単位で適用）の id
  const defaultTypeId = useMemo(() => exclusionTypes.find((t) => t.is_default)?.id ?? null, [exclusionTypes])
  // 管理者が「既定ON」にした種別（その他以外）。ユーザー未設定時の既定適用セット。
  const defaultEnabledTypeIds = useMemo(
    () => exclusionTypes.filter((t) => !t.is_default && t.default_enabled).map((t) => t.id),
    [exclusionTypes]
  )

  // 適用する種別（appliedTypeIds が null なら管理者の既定ON）で共通除外を絞り、個別除外とマージする。
  // その他はアイテム単位（disabledOtherNames でOFF）で絞る。
  const exclusionSet = useMemo(
    () => buildExclusionSet(selectedCommonNames(commonItems, appliedTypeIds, defaultTypeId, disabledOtherNames, defaultEnabledTypeIds), inventory.exclusions),
    [commonItems, appliedTypeIds, defaultTypeId, disabledOtherNames, defaultEnabledTypeIds, inventory.exclusions]
  )
  // 適用中の共通除外件数
  const appliedCommonCount = useMemo(
    () => selectedCommonNames(commonItems, appliedTypeIds, defaultTypeId, disabledOtherNames, defaultEnabledTypeIds).length,
    [commonItems, appliedTypeIds, defaultTypeId, disabledOtherNames, defaultEnabledTypeIds]
  )

  // 種別の適用ON/OFFを切り替える（端末ローカルに保存）。その他以外の種別単位の制御。
  // appliedTypeIds が null（ユーザー未設定）のときは、管理者の既定ON（default_enabled）の集合を
  // 起点にして、当該種別をトグルした集合を新しい選択として確定する。
  const toggleAppliedType = (typeId: number) => {
    const defaults = exclusionTypes.filter((t) => t.default_enabled).map((t) => t.id)
    const current = appliedTypeIds ?? defaults
    const next = current.includes(typeId)
      ? current.filter((id) => id !== typeId)
      : [...current, typeId]
    setAppliedTypeIds(next)
    setAppliedExclusionTypeIds(next)
  }
  // 未設定時は管理者の既定ON/OFF（default_enabled）に従う。
  const isTypeApplied = (typeId: number) =>
    appliedTypeIds == null
      ? (exclusionTypes.find((t) => t.id === typeId)?.default_enabled ?? true)
      : appliedTypeIds.includes(typeId)

  // その他（既定種別）のアイテム単位ON/OFF。OFF（disabled）に入っていなければ適用。
  const persistDisabledOther = (next: string[]) => {
    setDisabledOtherNames(next)
    setDisabledCommonNames(next)
  }
  const isOtherItemApplied = (name: string) => !disabledOtherNames.includes(name)
  const toggleOtherItem = (name: string) => {
    persistDisabledOther(
      disabledOtherNames.includes(name)
        ? disabledOtherNames.filter((n) => n !== name)
        : [...disabledOtherNames, name]
    )
  }

  // 同名アイテムが減ったとき、残すアイテム（ステータス）を確認するための保留状態
  const [pendingReduction, setPendingReduction] = useState<{
    accountId: string
    kept: ReturnType<typeof parseItemBox>['rows']
    map: Record<string, Item>
    excludedByList: number
    prevByName: Map<string, OwnedItem[]>
    groups: { name: string; newCount: number; existing: OwnedItem[] }[]
  } | null>(null)
  // 各ステータス差ありグループで「残す」既存アイテムの id 集合
  const [reductionKeep, setReductionKeep] = useState<Record<string, string[]>>({})

  // 状態の同一性（削れ・染色・マーク）。減少時にどれを残すか確認すべきか判定するのに使う。
  const statusSig = (i: OwnedItem) => `${i.worn ? 1 : 0}${i.dyed ? 1 : 0}${i.marked ? 1 : 0}`

  // 貼り付け行から新しい OwnedItem 配列を組み立てる。
  // selections に名前が含まれる場合は、その順序の既存行から状態（削れ・染色・マーク）を引き継ぐ。
  // 含まれない名前は既存の出現順（n番目）で引き継ぐ。
  const buildNewItems = (
    kept: ReturnType<typeof parseItemBox>['rows'],
    map: Record<string, Item>,
    accountId: string,
    prevByName: Map<string, OwnedItem[]>,
    selections: Map<string, OwnedItem[]>
  ): OwnedItem[] => {
    const usedByName = new Map<string, number>()
    return kept.map((r) => {
      const k = usedByName.get(r.name) ?? 0
      usedByName.set(r.name, k + 1)
      const prev = (selections.get(r.name) ?? prevByName.get(r.name))?.[k]
      const matched = isTruncatedName(r.name) ? null : (map[r.name] ?? null)
      return {
        id: newLocalId(),
        accountId,
        no: r.no,
        name: r.name,
        category: r.category,
        count: r.count,
        itemId: matched?.id ?? null,
        item: matched,
        worn: prev?.worn ?? false,
        dyed: prev?.dyed ?? false,
        marked: prev?.marked ?? false,
        note: prev?.note ?? '',
      }
    })
  }

  // 取り込みは「全て置き換え」に統一する。読込のたびに対象アカウントの行を貼り付け内容で置き換える。
  const handleLoad = async () => {
    if (!raw.trim()) return

    // 取り込み先アカウントは必須（未割り当ては許容しない）。未選択ならその場で作成を促す。
    let accountId = pasteAccountId
    if (!accountId) {
      const name = (await promptName('貼り付け先の MoE アカウント名を入力してください（所持アイテムはアカウントごとに管理します）'))?.trim()
      if (!name) {
        await alert('取り込み先のアカウントを選択または作成してください。', { title: 'アカウントが必要です' })
        return
      }
      accountId = createAccount(name)
      setPasteAccountId(accountId)
    }

    setParsing(true)
    setPasteResult(null)
    try {
      const { rows: parsed } = parseItemBox(raw)
      // 転送×（トレード不可）は取り込まない
      const tradable = parsed.filter((r) => !isTransferNg(r.tenso))
      // 共通＋個別除外に一致する行を除外
      const kept = tradable.filter((r) => !isExcluded(r.name, exclusionSet))
      const excludedByList = tradable.length - kept.length

      // 登録アイテムと照合（末尾「...」の省略名は自動設定しない）
      const names = Array.from(new Set(kept.filter((r) => !isTruncatedName(r.name)).map((r) => r.name)))
      const res = names.length > 0 ? await itemsApi.matchNames(names) : { data: {} as Record<string, Item> }
      const map = res.data

      // 既存アイテムを名前ごとにまとめる（マーク・削れ・染色の引き継ぎに使う）
      const prevByName = new Map<string, OwnedItem[]>()
      for (const it of inventory.items) {
        if (it.accountId !== accountId) continue
        const arr = prevByName.get(it.name)
        if (arr) arr.push(it)
        else prevByName.set(it.name, [it])
      }
      // 貼り付け後の同名件数
      const newCountByName = new Map<string, number>()
      for (const r of kept) newCountByName.set(r.name, (newCountByName.get(r.name) ?? 0) + 1)

      // 「数が減った」かつ「既存のステータスが複数種類ある」名前 → どれを残すか確認が必要
      const groups = [...prevByName.entries()]
        .map(([name, existing]) => ({ name, newCount: newCountByName.get(name) ?? 0, existing }))
        .filter((g) => g.newCount > 0 && g.newCount < g.existing.length && new Set(g.existing.map(statusSig)).size > 1)

      if (groups.length > 0) {
        const init: Record<string, string[]> = {}
        for (const g of groups) init[g.name] = g.existing.slice(0, g.newCount).map((e) => e.id)
        setReductionKeep(init)
        setPendingReduction({ accountId, kept, map, excludedByList, prevByName, groups })
        return
      }

      const newItems = buildNewItems(kept, map, accountId, prevByName, new Map())
      commit((p) => ({
        ...p,
        items: [...p.items.filter((i) => i.accountId !== accountId), ...newItems],
      }))
      setRaw('')
      setPasteResult(`${newItems.length}件を取り込みました。${excludedByList > 0 ? `（除外リストにより${excludedByList}件を除外）` : ''}`)
    } finally {
      setParsing(false)
    }
  }

  // 「残すアイテム」を確定して取り込みを完了する
  const applyReduction = () => {
    if (!pendingReduction) return
    const { accountId, kept, map, excludedByList, prevByName, groups } = pendingReduction
    // 選択した id を既存の並び順で OwnedItem[] に変換
    const selections = new Map<string, OwnedItem[]>()
    for (const g of groups) {
      const keepIds = new Set(reductionKeep[g.name] ?? [])
      selections.set(g.name, g.existing.filter((e) => keepIds.has(e.id)))
    }
    const newItems = buildNewItems(kept, map, accountId, prevByName, selections)
    commit((p) => ({
      ...p,
      items: [...p.items.filter((i) => i.accountId !== accountId), ...newItems],
    }))
    setRaw('')
    setPasteResult(`${newItems.length}件を取り込みました。${excludedByList > 0 ? `（除外リストにより${excludedByList}件を除外）` : ''}`)
    setPendingReduction(null)
  }

  // 確定可能か（各グループで残す件数がちょうど newCount）
  const reductionReady = !!pendingReduction && pendingReduction.groups.every(
    (g) => (reductionKeep[g.name]?.length ?? 0) === g.newCount
  )

  // ---- 行操作 ----
  const patchRow = (id: string, patch: Partial<OwnedItem>) =>
    commit((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))

  const removeRow = (id: string) =>
    commit((p) => ({ ...p, items: p.items.filter((i) => i.id !== id) }))

  // 新規登録完了 → 同名の行すべてに反映
  const handleRegistered = (item: Item) => {
    commit((p) => ({
      ...p,
      items: p.items.map((i) => (i.name === item.name || i.id === newItemRowId ? { ...i, itemId: item.id, item } : i)),
    }))
    setNewItemRowId(null)
  }

  const handleCandidateSelected = (item: Item) => {
    const id = candidateRowId
    setCandidateRowId(null)
    if (!id) return
    patchRow(id, { itemId: item.id, item })
  }

  // 新規登録モーダルを開く（初期名を指定）
  const openNewItemForm = (rowId: string, initialName: string) => {
    setNewItemInitialName(initialName)
    setNewItemRowId(rowId)
  }

  // 候補ダイアログで候補が無いとき → そのまま新規登録へ（検索キーワードを初期名に引き継ぐ）
  const handleCandidateRegisterNew = (keyword: string) => {
    const id = candidateRowId
    setCandidateRowId(null)
    if (!id) return
    openNewItemForm(id, keyword)
  }

  // 「除外時の確認を今後表示しない」設定（端末ごと・localStorage）
  const [hideExcludeConfirm, setHideExcludeConfirm] = useState(getSkipExcludeConfirm())

  // 個別除外に追加（その行のアイテムを除外し、台帳からも取り除く）
  const addPersonalExclusion = async (name: string) => {
    const doAdd = () => {
      commit((p) => ({
        ...p,
        exclusions: p.exclusions.includes(name) ? p.exclusions : [...p.exclusions, name],
        items: p.items.filter((i) => i.name !== name),
      }))
      // 端末保存の場合は除外名がサーバーに残らないため、共通除外の検討用に匿名で報告する
      // （誰が除外したかは記録されない）。DB保存時は自動保存で user_excluded_items に入るため不要。
      if (modeRef.current === 'local') {
        excludedItemsApi.report([name]).catch(() => {})
      }
    }

    // 「今後表示しない」が設定済みなら確認を省略して追加
    if (hideExcludeConfirm) { doAdd(); return }

    let dontShowAgain = false
    const ok = await confirm(`「${name}」を自分の除外リストに追加します。今後この名前は貼り付け時に除外されます。よろしいですか？`, {
      title: '除外リストに追加', confirmLabel: '追加する', cancelLabel: 'キャンセル',
      checkbox: { label: '今後除外するときにメッセージを表示しない' },
      onCheckbox: (c) => { dontShowAgain = c },
    })
    if (!ok) return
    if (dontShowAgain) { setSkipExcludeConfirm(true); setHideExcludeConfirm(true) }
    doAdd()
  }

  const removePersonalExclusion = (name: string) =>
    commit((p) => ({ ...p, exclusions: p.exclusions.filter((n) => n !== name) }))

  // ---- 派生 ----
  const accountName = (id: string | null) =>
    id == null ? '未割り当て' : (inventory.accounts.find((a) => a.id === id)?.name ?? '未割り当て')

  // 表示名（登録アイテム名があればそれ、無ければ貼り付け名）。並び替えの基準に使う。
  const displayName = (i: OwnedItem) => i.item?.name ?? i.name

  const visibleItems = useMemo(() => {
    return inventory.items
      .filter((i) => {
        if (filterAccountId === 'all') { /* all */ }
        else if (filterAccountId === 'unassigned') { if (i.accountId != null) return false }
        else if (i.accountId !== filterAccountId) return false
        if (markedOnly && !i.marked) return false
        return true
      })
      // 常にあいうえお順（日本語ロケール）で表示する。
      // 共有コレーター（compareJa）を使い、大きな一覧でもソートが重くならないようにする。
      .sort((a, b) => compareJa(displayName(a), displayName(b)))
  }, [inventory.items, filterAccountId, markedOnly])

  const markedCount = inventory.items.filter((i) => i.marked).length
  const newItemRow = inventory.items.find((i) => i.id === newItemRowId) ?? null
  const candidateRow = inventory.items.find((i) => i.id === candidateRowId) ?? null

  const saveLabel =
    saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '✓ 保存済み' : saveState === 'error' ? '⚠ 保存に失敗' : ''

  // テーブルヘッダーのセル共通クラス。lg 以上では画面上部（表示切替バーの直下）に sticky 固定する。
  const thCls = 'border-b border-surface-border bg-surface-card lg:sticky lg:z-20 lg:top-[var(--thead-top)]'

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-6"><Spinner center /></div>
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">マイペ整理</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            公式サイトのアイテムボックスを貼り付けて、所持アイテムを記録・管理できます。
            保存先は「この端末（ローカル）」か「サーバー（DB）」を選べます（既定はこの端末）。
            <span className="text-amber-400/90">サーバーに保存したデータは運営（管理者）が参照できる場合があります。</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveLabel && (
            <span className={`text-xs ${saveState === 'error' ? 'text-red-400' : saveState === 'saving' ? 'text-gray-400' : 'text-emerald-400'}`}>
              {saveLabel}
            </span>
          )}
          {/* 保存先トグル */}
          <div data-tour="owned-storage" className="flex border border-surface-border rounded-lg overflow-hidden text-xs">
            {(['local', 'db'] as InventoryStorageMode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`px-3 py-1.5 transition-colors ${mode === m ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'}`}
                title={m === 'local' ? 'この端末のみに保存' : 'サーバーに保存（別端末でも参照可）'}
              >
                {m === 'local' ? '📱 この端末' : '☁ サーバー'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* アカウント管理 */}
      <div data-tour="owned-accounts" className="bg-surface-card border border-surface-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">MoE アカウント</h2>
          <button onClick={() => setAccountModalOpen(true)} className="text-xs text-primary-500 hover:underline">管理</button>
        </div>
        {inventory.accounts.length === 0 ? (
          <p className="text-xs text-gray-500">所持アイテムはアカウントごとに管理します。「管理」からアカウントを追加してください（貼り付け時に未選択の場合もその場で追加できます）。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {inventory.accounts.map((a) => {
              const cnt = inventory.items.filter((i) => i.accountId === a.id).length
              return (
                <span key={a.id} className="text-xs bg-surface border border-surface-border rounded px-2 py-1 text-gray-200">
                  {a.name} <span className="text-gray-500">({cnt})</span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* 貼り付け */}
      <div data-tour="owned-paste" className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">アイテムボックスを貼り付け</h2>
        <textarea
          rows={5}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={SAMPLE}
          className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 font-mono"
        />
        {/* 取り込み先アカウントの切替（読込ボタンの上・左寄せ） */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 py-1">取り込み先:</span>
          {inventory.accounts.length === 0 ? (
            <button
              type="button"
              onClick={addAccount}
              className="text-xs border border-dashed border-surface-border hover:border-primary-500 text-gray-300 hover:text-white px-3 py-1 rounded-full transition-colors"
            >
              + アカウントを追加
            </button>
          ) : (
            inventory.accounts.map((a) => {
              const active = pasteAccountId === a.id
              const cnt = inventory.items.filter((i) => i.accountId === a.id).length
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setPasteAccountId(a.id)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : 'border-surface-border text-gray-300 hover:text-white hover:border-gray-500'
                  }`}
                >
                  {a.name} <span className={active ? 'text-white/70' : 'text-gray-500'}>({cnt})</span>
                </button>
              )
            })
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleLoad}
            disabled={parsing || !raw.trim()}
            className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-sm px-5 py-2 rounded transition-colors"
          >
            {parsing ? '読込中...' : '読込'}
          </button>
          <span className="text-xs text-gray-500">
            {pasteAccountId
              ? `「${accountName(pasteAccountId)}」の内容を貼り付け内容で置き換えます。`
              : '読込時に取り込み先アカウントの選択（または作成）が必要です。'}
            転送×（トレード不可）は取り込みません。
          </span>
          {pasteResult && <span className="text-xs text-emerald-400">{pasteResult}</span>}
        </div>
      </div>

      {/* フィルタ（スクロール時は画面上部に固定） */}
      <div
        ref={filterBarRef}
        data-tour="owned-filter"
        className="flex flex-wrap items-center gap-3 sticky z-30 bg-surface/90 backdrop-blur px-4 py-2 rounded-lg"
        style={{ top: headerH }}
      >
        {/* 表示切替（アカウントごとのタブ。セレクトボックスからタブ表示へ） */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">表示</span>
          {[
            { id: 'all', label: 'すべて', count: inventory.items.length },
            ...inventory.accounts.map((a) => ({
              id: a.id,
              label: a.name,
              count: inventory.items.filter((i) => i.accountId === a.id).length,
            })),
            // 旧データに未割り当てが残っている場合のみ表示（新規取り込みでは作られない）
            ...(inventory.items.some((i) => i.accountId == null)
              ? [{ id: 'unassigned', label: '未割り当て', count: inventory.items.filter((i) => i.accountId == null).length }]
              : []),
          ].map((tab) => {
            const active = filterAccountId === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterAccountId(tab.id)}
                aria-pressed={active}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-primary-500 border-primary-500 text-white'
                    : 'border-surface-border text-gray-300 hover:text-white hover:border-gray-500'
                }`}
              >
                {tab.label} <span className={active ? 'text-white/70' : 'text-gray-500'}>({tab.count})</span>
              </button>
            )
          })}
        </div>
        <label className="flex items-center gap-2 px-2 py-1.5 rounded border border-surface-border hover:border-gray-500 cursor-pointer text-xs text-gray-300 transition-colors">
          <input type="checkbox" checked={markedOnly} onChange={(e) => setMarkedOnly(e.target.checked)} className="accent-amber-500 w-4 h-4" />
          <span>★ マークのみ ({markedCount})</span>
        </label>
        <button
          onClick={() => setExclusionModalOpen(true)}
          className="text-xs px-2 py-1.5 rounded border border-surface-border hover:border-gray-500 text-gray-300 transition-colors"
        >
          除外リスト ({inventory.exclusions.length})
        </button>
        {exclusionTypes.length > 0 && (
          <button
            onClick={() => setCommonExclusionModalOpen(true)}
            className="text-xs px-2 py-1.5 rounded border border-surface-border hover:border-gray-500 text-gray-300 transition-colors"
            title="貼り付け時に適用する共通除外の種別を選ぶ"
          >
            共通除外の設定 ({appliedCommonCount})
          </button>
        )}
      </div>

      {/* 一覧 */}
      {/* lg 以上では overflow を visible にして、ヘッダー行を画面（ビューポート）上部に sticky 固定する。
          overflow-x-auto は overflow-y も auto 扱いとなりスクロールコンテナ化して sticky が効かないため、
          横スクロールが不要になる lg 以上でのみ visible に切り替える。--thead-top はヘッダー＋表示切替バーの高さ。 */}
      <div
        className="bg-surface-card border border-surface-border rounded-lg overflow-x-auto lg:overflow-visible"
        style={{ '--thead-top': `${headerH + filterBarH}px` } as CSSProperties}
      >
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-xs text-gray-400">
              <th className={`${thCls} px-2 py-3 text-center w-10`}>★</th>
              <th className={`${thCls} px-4 py-3 text-left`}>アイテム</th>
              {filterAccountId === 'all' && <th className={`${thCls} px-3 py-3 text-left`}>アカウント</th>}
              <th className={`${thCls} px-3 py-3 text-right`}>個数</th>
              <th className={`${thCls} px-2 py-3 text-center`}>削れ</th>
              <th className={`${thCls} px-2 py-3 text-center`}>染色</th>
              <th className={`${thCls} px-3 py-3 text-left`}>メモ</th>
              <th className={`${thCls} px-3 py-3 text-right whitespace-nowrap`}>買取中</th>
              <th className={`${thCls} px-4 py-3`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {visibleItems.length === 0 ? (
              <tr><td colSpan={filterAccountId === 'all' ? 9 : 8} className="text-center py-12 text-gray-500">
                {inventory.items.length === 0 ? 'アイテムボックスを貼り付けて読み込んでください。' : '表示できるアイテムがありません。'}
              </td></tr>
            ) : (
              visibleItems.map((row) => {
                const linked = !!row.item
                const buy = row.itemId != null ? buyPrices[row.itemId] : undefined
                // 自分が募集中の出品があるか（アイテム・削れ・染色がすべて一致する出品の件数）
                const variantKey = row.itemId != null ? `${row.itemId}:${row.worn ? 1 : 0}:${row.dyed ? 1 : 0}` : null
                const listedCount = variantKey ? (myItemCounts?.listing_variants?.[variantKey] ?? 0) : 0
                return (
                  <tr key={row.id} className={linked ? '' : 'bg-yellow-900/5'}>
                    {/* マーク */}
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => patchRow(row.id, { marked: !row.marked })}
                        title={row.marked ? 'マークを外す' : 'マークする'}
                        className={`text-lg leading-none transition-colors ${row.marked ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400'}`}
                      >
                        {row.marked ? '★' : '☆'}
                      </button>
                    </td>

                    {/* アイテム情報。登録アイテムに紐づく場合は登録アイテムの情報のみ表示する。 */}
                    <td className="px-4 py-3">
                      {linked ? (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-white font-medium">{row.item!.name}</p>
                            {row.item!.verified_status === 'unverified' && (
                              <span title="確認中アイテム" className="text-[10px] text-yellow-400 bg-yellow-900/30 border border-yellow-700/40 rounded px-1 py-0.5">⚠ 確認中</span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500">{row.item!.category.name}</p>
                          {(Object.keys(row.item!.base_stats).length > 0 || row.item!.mithril) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              <BaseStatBadges item={row.item!} />
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-white font-medium">{row.name}</p>
                          {row.category && <p className="text-[11px] text-gray-500">{row.category}</p>}
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            {/* 「...」省略名は候補ボタンのみ（候補が無ければダイアログから新規登録できる）。
                                完全な名前のときだけ新規登録ボタンを出す。 */}
                            {isTruncatedName(row.name) ? (
                              <button
                                onClick={() => setCandidateRowId(row.id)}
                                className="text-xs bg-sky-600/80 hover:bg-sky-600 text-white px-2 py-0.5 rounded transition-colors"
                              >
                                候補
                              </button>
                            ) : (
                              <button
                                onClick={() => openNewItemForm(row.id, row.name)}
                                className="text-xs bg-yellow-600/80 hover:bg-yellow-600 text-white px-2 py-0.5 rounded transition-colors"
                              >
                                + 新規登録
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </td>

                    {/* アカウント（すべて表示時のみ） */}
                    {filterAccountId === 'all' && (
                      <td className="px-3 py-3 text-xs text-gray-400">{accountName(row.accountId)}</td>
                    )}

                    {/* 個数 */}
                    <td className="px-3 py-3 text-right text-gray-300">{row.count}</td>

                    {/* 削れ */}
                    <td className="px-2 py-3 text-center">
                      <input type="checkbox" checked={row.worn} onChange={(e) => patchRow(row.id, { worn: e.target.checked })} title="削れあり" className="accent-amber-500" />
                    </td>
                    {/* 染色 */}
                    <td className="px-2 py-3 text-center">
                      <input type="checkbox" checked={row.dyed} onChange={(e) => patchRow(row.id, { dyed: e.target.checked })} title="染色済み" className="accent-fuchsia-500" />
                    </td>

                    {/* メモ（自由記入・自動保存） */}
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={row.note}
                        onChange={(e) => patchRow(row.id, { note: e.target.value })}
                        placeholder="メモ"
                        maxLength={500}
                        title="このアイテムのメモ（自動保存されます）"
                        className="w-36 bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                      />
                    </td>

                    {/* 買取中価格（複数あるときは最高値を表示・クリックで売却ページへ） */}
                    <td className="px-3 py-3 text-right">
                      {buy ? (
                        <div className="flex flex-col items-end">
                          <button
                            onClick={() => goWithGuard(`/buy-requests/${buy.buy_request_id}`)}
                            title={buy.count > 1 ? `買取${buy.count}件中の最高値。売却ページへ移動します。` : 'この買取に売却する'}
                            className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 hover:underline whitespace-nowrap"
                          >
                            {buy.price.toLocaleString()} {buy.currency}
                          </button>
                          {buy.count > 1 && (
                            <span className="text-[10px] text-gray-500 whitespace-nowrap">最高 / 全{buy.count}件</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>

                    {/* 操作 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {linked && (
                          listedCount > 0 ? (
                            <span
                              title={`削れ・染色まで一致する出品中アイテム（${listedCount}件）`}
                              className="text-xs bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 px-2 py-1 rounded whitespace-nowrap"
                            >
                              出品中{listedCount > 1 ? ` ${listedCount}件` : ''}
                            </span>
                          ) : (
                            <button
                              onClick={() => goWithGuard('/listings/new', { presetItem: row.item, presetWorn: row.worn, presetDyed: row.dyed })}
                              className="text-xs bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/50 text-primary-300 px-2 py-1 rounded transition-colors"
                              title="このアイテムを出品する"
                            >
                              出品
                            </button>
                          )
                        )}
                        {linked && (
                          <button
                            onClick={() => setAnalyticsItem({ id: row.itemId!, name: row.item!.name })}
                            className="text-xs bg-sky-900/40 hover:bg-sky-900/70 border border-sky-700/50 text-sky-300 px-2 py-1 rounded transition-colors"
                            title="相場情報"
                          >
                            相場
                          </button>
                        )}
                        <button
                          onClick={() => addPersonalExclusion(row.name)}
                          className="text-xs bg-surface hover:bg-surface-border border border-surface-border text-gray-400 px-2 py-1 rounded transition-colors"
                          title="このアイテムを除外リストに追加"
                        >
                          除外
                        </button>
                        <button
                          onClick={() => removeRow(row.id)}
                          className="text-xs text-gray-500 hover:text-red-400 px-1 transition-colors"
                          title="この行を削除"
                          aria-label="削除"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 新規アイテム登録モーダル */}
      {newItemRow && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="bg-surface-card border border-yellow-700/50 rounded-lg p-5 max-w-2xl w-full my-8">
            <NewItemForm
              initialName={newItemInitialName}
              onRegistered={handleRegistered}
              onCancel={() => setNewItemRowId(null)}
            />
          </div>
        </div>
      )}

      {/* 候補選択モーダル */}
      {candidateRow && (
        <CandidateSelectModal
          baseName={truncatedBase(candidateRow.name)}
          originalName={candidateRow.name}
          onSelect={handleCandidateSelected}
          onRegisterNew={handleCandidateRegisterNew}
          onCancel={() => setCandidateRowId(null)}
        />
      )}

      {/* 相場情報モーダル */}
      {analyticsItem && (
        <PriceAnalyticsModal itemId={analyticsItem.id} itemName={analyticsItem.name} onClose={() => setAnalyticsItem(null)} />
      )}

      {/* アカウント管理モーダル */}
      {accountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setAccountModalOpen(false)}>
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">MoE アカウントの管理</h3>
              <button onClick={addAccount} className="text-xs bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded transition-colors">+ 追加</button>
            </div>
            {inventory.accounts.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">アカウントはありません。「追加」から登録できます。</p>
            ) : (
              <div className="space-y-1.5">
                {inventory.accounts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 bg-surface border border-surface-border rounded px-3 py-2">
                    <span className="flex-1 text-sm text-white truncate">{a.name}</span>
                    <span className="text-xs text-gray-500">{inventory.items.filter((i) => i.accountId === a.id).length}件</span>
                    <button onClick={() => renameAccount(a.id, a.name)} className="text-xs text-gray-300 hover:text-white px-2">改名</button>
                    <button onClick={() => removeAccount(a.id, a.name)} className="text-xs text-red-400 hover:text-red-300 px-2">削除</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setAccountModalOpen(false)} className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border transition-colors">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 個別除外リスト管理モーダル */}
      {exclusionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setExclusionModalOpen(false)}>
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-bold text-white">自分の除外リスト</h3>
              <p className="text-xs text-gray-400 mt-1">ここに登録した名前は貼り付け時に除外されます（管理者の共通除外 {appliedCommonCount} 件とマージして適用）。共通除外の適用範囲は「共通除外の設定」から変更できます。</p>
            </div>
            {inventory.exclusions.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">個別の除外アイテムはありません。一覧の「除外」ボタンから追加できます。</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {inventory.exclusions.map((name) => (
                  <div key={name} className="flex items-center gap-2 bg-surface border border-surface-border rounded px-3 py-2">
                    <span className="flex-1 text-sm text-white truncate">{name}</span>
                    <button onClick={() => removePersonalExclusion(name)} className="text-xs text-red-400 hover:text-red-300 px-2">解除</button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none border-t border-surface-border pt-3">
              <input
                type="checkbox"
                checked={hideExcludeConfirm}
                onChange={(e) => { setHideExcludeConfirm(e.target.checked); setSkipExcludeConfirm(e.target.checked) }}
                className="accent-primary-500 w-4 h-4"
              />
              除外するときに確認メッセージを表示しない
            </label>
            <div className="flex justify-end">
              <button onClick={() => setExclusionModalOpen(false)} className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border transition-colors">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 共通除外の設定（適用する種別を選ぶ・個別除外リストとは別） */}
      {commonExclusionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setCommonExclusionModalOpen(false)}>
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-bold text-white">共通除外の設定</h3>
              <p className="text-xs text-gray-400 mt-1">
                チェックした種類のアイテムは読み込み時に除外されます。<br />
                ※管理者が手動で設定しているので、除外されないアイテムも多いですがご了承ください。
              </p>
            </div>
            {exclusionTypes.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">共通除外の種別はありません。</p>
            ) : (
              <div className="space-y-3">
                {/* その他以外の種別は種別単位でON/OFF */}
                <div className="flex flex-wrap gap-2">
                  {exclusionTypes.filter((t) => !t.is_default).map((t) => {
                    const cnt = commonItems.filter((i) => i.type_id === t.id).length
                    const on = isTypeApplied(t.id)
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border cursor-pointer transition-colors ${
                          on ? 'border-primary-500/60 bg-primary-500/10 text-white' : 'border-surface-border text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleAppliedType(t.id)}
                          className="accent-primary-500"
                        />
                        {t.name} <span className="text-gray-500">({cnt})</span>
                      </label>
                    )
                  })}
                </div>

                {/* その他（既定種別）は最後に表示し、アイテム単位で選択する */}
                {(() => {
                  const other = exclusionTypes.find((t) => t.is_default)
                  if (!other) return null
                  const otherItems = commonItems
                    .filter((i) => i.type_id === other.id)
                    .slice()
                    .sort((a, b) => compareJa(a.name, b.name))
                  const allOn = otherItems.length > 0 && otherItems.every((i) => isOtherItemApplied(i.name))
                  const toggleAll = () => {
                    const names = otherItems.map((i) => i.name)
                    persistDisabledOther(
                      allOn
                        ? Array.from(new Set([...disabledOtherNames, ...names]))
                        : disabledOtherNames.filter((n) => !names.includes(n))
                    )
                  }
                  return (
                    <div className="border-t border-surface-border pt-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h4 className="text-sm font-semibold text-gray-300">{other.name}（アイテムごとに選択）</h4>
                        {otherItems.length > 0 && (
                          <button onClick={toggleAll} className="text-xs text-primary-400 hover:text-primary-300">
                            {allOn ? 'すべて外す' : 'すべて選択'}
                          </button>
                        )}
                      </div>
                      {otherItems.length === 0 ? (
                        <p className="text-xs text-gray-500">アイテムはありません。</p>
                      ) : (
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {otherItems.map((i) => {
                            const on = isOtherItemApplied(i.name)
                            return (
                              <label
                                key={i.name}
                                className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border cursor-pointer transition-colors ${
                                  on ? 'border-primary-500/60 bg-primary-500/10 text-white' : 'border-surface-border text-gray-400 hover:border-gray-500'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleOtherItem(i.name)}
                                  className="accent-primary-500 shrink-0"
                                />
                                <span className="truncate">{i.name}</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setCommonExclusionModalOpen(false)} className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border transition-colors">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 数が減った同名アイテムのうち、どれ（どのステータス）を残すか確認 */}
      {pendingReduction && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setPendingReduction(null)}>
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-bold text-white">残すアイテムの確認</h3>
              <p className="text-xs text-gray-400 mt-1">
                個数が減った同名アイテムのうち、削れ・染色・マークが異なるものがあります。残すアイテムを選択してください。
              </p>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {pendingReduction.groups.map((g) => {
                const keep = reductionKeep[g.name] ?? []
                const toggle = (id: string) =>
                  setReductionKeep((p) => {
                    const cur = p[g.name] ?? []
                    if (cur.includes(id)) return { ...p, [g.name]: cur.filter((x) => x !== id) }
                    if (cur.length >= g.newCount) return p // 上限に達したら追加しない
                    return { ...p, [g.name]: [...cur, id] }
                  })
                return (
                  <div key={g.name} className="border border-surface-border rounded-lg p-3">
                    <p className="text-sm text-white font-medium">{g.name}</p>
                    <p className="text-xs text-gray-400 mb-2">
                      {g.existing.length} 件 → {g.newCount} 件に減少。残す {g.newCount} 件を選択（{keep.length}/{g.newCount}）
                    </p>
                    <div className="space-y-1.5">
                      {g.existing.map((e, idx) => {
                        const checked = keep.includes(e.id)
                        const atLimit = keep.length >= g.newCount && !checked
                        const badges = [e.worn && '削れ', e.dyed && '染色', e.marked && '★マーク'].filter(Boolean) as string[]
                        // この既存行（アイテム・削れ・染色）に一致する自分の出品があるか
                        const listed = e.itemId != null && (myItemCounts?.listing_variants?.[`${e.itemId}:${e.worn ? 1 : 0}:${e.dyed ? 1 : 0}`] ?? 0) > 0
                        return (
                          <label
                            key={e.id}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded border cursor-pointer transition-colors ${
                              checked ? 'border-primary-500 bg-primary-500/10' : atLimit ? 'border-surface-border opacity-40 cursor-not-allowed' : 'border-surface-border hover:border-gray-500'
                            }`}
                          >
                            <input type="checkbox" checked={checked} disabled={atLimit} onChange={() => toggle(e.id)} className="accent-primary-500" />
                            <span className="text-xs text-gray-300">#{idx + 1}</span>
                            <span className="flex flex-wrap items-center gap-1 flex-1">
                              {badges.length === 0 ? (
                                <span className="text-xs text-gray-500">（状態なし）</span>
                              ) : badges.map((b) => (
                                <span key={b} className="text-[10px] bg-surface border border-surface-border text-gray-200 rounded px-1.5 py-0.5">{b}</span>
                              ))}
                            </span>
                            {/* 出品有無 */}
                            <span
                              className={`text-[10px] rounded px-1.5 py-0.5 shrink-0 border ${
                                listed
                                  ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300'
                                  : 'bg-surface border-surface-border text-gray-500'
                              }`}
                            >
                              {listed ? '出品中' : '未出品'}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingReduction(null)} className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border transition-colors">キャンセル</button>
              <button
                onClick={applyReduction}
                disabled={!reductionReady}
                className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-5 py-2 rounded-md transition-colors"
              >
                これで取り込む
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
