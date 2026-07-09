import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDialog } from '../contexts/DialogContext'
import { useAuth } from '../contexts/AuthContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { itemsApi } from '../api/items'
import { buyRequestsApi } from '../api/buyRequests'
import { excludedItemsApi, serverExcludedItemsApi } from '../api/excludedItems'
import client from '../api/client'
import NewItemForm from '../components/NewItemForm'
import CandidateSelectModal from '../components/CandidateSelectModal'
import PriceAnalyticsModal from '../components/PriceAnalyticsModal'
import Spinner from '../components/Spinner'
import OfficialDbLink from '../components/OfficialDbLink'
import { BaseStatBadges } from '../components/equipmentCells'
import type { Item, InventoryData, InventoryStorageMode, OwnedItem, BuyPriceInfo, MyItemCounts, ExclusionType, CustomTypeId } from '../types'
import { parseItemBox, isTransferNg, isTruncatedName, truncatedBase } from '../utils/itemBoxPaste'
import { newLocalId, emptyInventory, effectiveTypeId, isCustomTypeId, normalizeName, type EffectiveType } from '../utils/inventory'
import { compareJa } from '../utils/collator'
import { getStorageMode, loadInitialInventory, saveInventory, persistStorageMode, getDisplayType, setDisplayType, getServerExcludedNames, setServerExcludedNames, type DisplayType } from '../utils/inventoryStore'

const SAMPLE = `No▼\tアイテム名\tカテゴリ\t転送\t個数
1\tアイネの抱っこぬいぐるみ\t中級者レア\t○\t1
3\tアクアマリン\t中級者アンコモン\t○\t321`

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function OwnedItemsPage() {
  usePageMeta('アイテムボックス', '公式サイトのアイテムボックスを貼り付けて、所持アイテムを管理できます。')
  const { confirm, alert, prompt } = useDialog()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const navigate = useNavigate()

  // ---- 保存先・台帳データ ----
  const [mode, setMode] = useState<InventoryStorageMode>(() => getStorageMode())
  const [inventory, setInventory] = useState<InventoryData>(emptyInventory())
  const [loading, setLoading] = useState(true)

  // ---- 表示種別（ジャンル）の分類データ ----
  // 共通の種別割当（管理者）はアイテム名→種別IDで保持する。
  const [commonItems, setCommonItems] = useState<{ name: string; type_id: number }[]>([])
  const [exclusionTypes, setExclusionTypes] = useState<ExclusionType[]>([])
  // 現在選択中の表示種別タブ（端末ローカル設定）。既定は取引可能のみ表示。
  const [displayType, setDisplayTypeState] = useState<DisplayType>(() => getDisplayType())
  // 「サーバ登録対象外」: システム共通分（API）と、ユーザー指定分（端末ローカル）。
  const [serverCommonNames, setServerCommonNames] = useState<string[]>([])
  const [userServerExcluded, setUserServerExcluded] = useState<string[]>(() => getServerExcludedNames())

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
  // 種別選択ダイアログ（取引可能以外の行に種別を割り当て・変更する。共通割当も上書き可）。対象の行IDを保持。
  const [typeDialogRowId, setTypeDialogRowId] = useState<string | null>(null)
  // 管理者が種別ダイアログから新規種別を登録するための入力
  const [newTypeName, setNewTypeName] = useState('')
  const [addingType, setAddingType] = useState(false)
  // 種別ダイアログからカスタム種別（自分専用）を追加するための入力
  const [newCustomTypeName, setNewCustomTypeName] = useState('')
  // カスタム種別の管理モーダル
  const [customTypeModalOpen, setCustomTypeModalOpen] = useState(false)
  // サーバ登録対象外の設定モーダル
  const [serverExcludedModalOpen, setServerExcludedModalOpen] = useState(false)
  const [serverExcludedInput, setServerExcludedInput] = useState('')
  // 重複確認モーダル（異なる取り込み先で同名の登録アイテムを所持している場合に一覧表示）
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)

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

  // サーバ登録対象外の集合（システム共通 ∪ ユーザー指定）。保存時の分割保存に使う。
  const serverExcludedSet = useMemo(
    () => new Set([...serverCommonNames, ...userServerExcluded].map((n) => normalizeName(n))),
    [serverCommonNames, userServerExcluded]
  )
  const serverExcludedRef = useRef(serverExcludedSet)
  serverExcludedRef.current = serverExcludedSet

  // ---- 初期ロード ----
  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      // 保存先モードはサーバー（ユーザー単位）を正として取得する。
      // これにより、ある端末で「サーバー」を選べば別端末でも同じ保存先が適用される。
      loadInitialInventory().catch(() => ({ mode: getStorageMode(), data: emptyInventory() })),
      excludedItemsApi.list().then((r) => r.data).catch(() => ({ types: [], items: [] })),
      serverExcludedItemsApi.list().then((r) => r.data).catch(() => [] as string[]),
    ]).then(([{ mode: loadedMode, data: inv }, common, serverCommon]) => {
      if (!active) return
      setMode(loadedMode)
      modeRef.current = loadedMode
      // 共通登録済みと同じ種別のユーザー個別設定は冗長なので取り除く（共通に従う＝該当設定は削除）。
      // 主に端末（ローカル）保存分のクリーンアップ。DB保存分はサーバー側でも除外済み。種別が異なる上書きは保持。
      const defId = common.types.find((t) => t.is_default)?.id ?? null
      const commonTypeByName = new Map(common.items.map((i) => [normalizeName(i.name), i.type_id]))
      const prunedExclusions = inv.exclusions.filter((e) => {
        // カスタム種別への割当は常にユーザー固有なので冗長判定の対象外
        if (e.custom_type_id != null) return true
        const ct = commonTypeByName.get(normalizeName(e.name))
        return ct == null || (e.exclusion_type_id ?? defId) !== ct
      })
      const cleanedInv = prunedExclusions.length === inv.exclusions.length
        ? inv : { ...inv, exclusions: prunedExclusions }
      setInventory(cleanedInv)
      setCommonItems(common.items)
      setExclusionTypes(common.types)
      setServerCommonNames(serverCommon)
      // 端末に保存された種別タブが既に存在しないカスタム種別を指していたら既定へ戻す
      // （DB保存モードでは保存のたびにサーバー id が変わり得るため）
      if (isCustomTypeId(displayType) && !cleanedInv.customTypes.some((t) => t.id === displayType)) {
        selectDisplayType('tradeable')
      }
      // 既定の貼り付け先は先頭アカウント
      setPasteAccountId(cleanedInv.accounts[0]?.id ?? null)
      setLoading(false)
      // 冗長な個別設定を取り除いた場合は保存して永続化する（ローカルは localStorage、DBは PUT）。
      if (cleanedInv !== inv) {
        latestRef.current = cleanedInv
        dirtyRef.current = true
        scheduleSave()
      }
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

  // ---- 一覧表示時の自動再紐づけ・スナップショット更新 ----
  // 一覧を表示するタイミングで、各行の名称を登録アイテムへ再照合する。
  // ・未紐づけ（itemId=null）の行 → 一致したものを自動でリンクする（取り込み時点では未登録だった
  //   アイテムが後から新規登録された場合などに、ページを開き直すだけで登録アイテム情報が紐づく）。
  // ・紐づけ済みの行 → 登録アイテムの最新情報でスナップショットを更新する（ローカル保存だと item は
  //   リンク時点の凍結スナップショットのため、公式DBリンク等の後付け項目が反映されない問題への対処。
  //   照合は保存された名称ではなく登録アイテム名で行う）。
  // 末尾「...」の省略名は誤紐づけを避けるため対象外（候補ボタンで手動選択する）。
  const relinkedRef = useRef(false)
  useEffect(() => {
    if (loading || relinkedRef.current) return
    relinkedRef.current = true
    // 未紐づけ行は貼り付け名、紐づけ済み行は登録アイテム名で照合する
    const names = Array.from(new Set(
      latestRef.current.items
        .filter((i) => i.item != null || !isTruncatedName(i.name))
        .map((i) => i.item?.name ?? i.name)
    ))
    if (names.length === 0) return
    let active = true
    itemsApi.matchNames(names)
      .then((res) => {
        if (!active) return
        const map = res.data
        if (Object.keys(map).length === 0) return
        let changed = false
        const nextItems = latestRef.current.items.map((i) => {
          if (i.item != null) {
            // 紐づけ済み: 登録アイテム名で最新スナップショットに置き換える。
            // 内容が変わらない場合は無駄な保存を避けるため据え置く。
            const fresh = map[i.item.name]
            if (fresh && JSON.stringify(fresh) !== JSON.stringify(i.item)) {
              changed = true
              return { ...i, itemId: fresh.id, item: fresh }
            }
            return i
          }
          // 未紐づけ: 完全名が一致したらリンクする
          if (!isTruncatedName(i.name) && map[i.name]) {
            changed = true
            return { ...i, itemId: map[i.name].id, item: map[i.name] }
          }
          return i
        })
        if (changed) commit((p) => ({ ...p, items: nextItems }))
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
      await saveInventory(modeRef.current, latestRef.current, serverExcludedRef.current)
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
      if (dirtyRef.current) void saveInventory(modeRef.current, latestRef.current, serverExcludedRef.current)
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
          ? { highlight: '※DBに保存する場合、アカウント名はゲームIDではなくニックネームの使用を推奨します！\n\n※サーバーに保存したくないアイテムは「端末のみ」のロックをONにしてください。' }
          : {}),
      }
    )
    if (!ok) return
    try {
      // 現在の内容を新しい保存先へ書き出してから切り替える（移行）。
      // その後、保存先モードをユーザー単位でサーバーに記録する（他端末にも反映される）。
      await saveInventory(next, latestRef.current, serverExcludedRef.current)
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

  // アカウント名の入力。ブラウザ標準の prompt ではなくダイアログ内のテキストボックスで受け取る。
  const promptName = (label: string, initial = ''): Promise<string | null> =>
    prompt(label, { title: 'MoE アカウント', defaultValue: initial, confirmLabel: '決定' })

  // ---- 表示種別（ジャンル）の分類 ----
  // 既定種別「その他」の id（ユーザー割当 type_id=null はこの種別とみなす）
  const defaultTypeId = useMemo(() => exclusionTypes.find((t) => t.is_default)?.id ?? null, [exclusionTypes])
  // 共通の種別割当（管理者）: name → type_id
  const commonMap = useMemo(
    () => new Map(commonItems.map((i) => [normalizeName(i.name), i.type_id])),
    [commonItems]
  )
  // ユーザーの種別割当: name → カスタム種別id | type_id | null（カスタムが共通種別より優先）
  const userMap = useMemo(() => {
    const customIds = new Set(inventory.customTypes.map((t) => t.id))
    return new Map<string, number | CustomTypeId | null>(
      inventory.exclusions.map((e) => [
        normalizeName(e.name),
        // 削除済みカスタム種別への参照は無視して共通種別（無ければ既定種別）へ落とす
        e.custom_type_id != null && customIds.has(e.custom_type_id) ? e.custom_type_id : e.exclusion_type_id,
      ])
    )
  }, [inventory.exclusions, inventory.customTypes])
  // 種別名の解決（表示用）。カスタム種別（ct_ 付き id）も共通種別も引ける
  const typeName = (id: number | CustomTypeId) =>
    (isCustomTypeId(id)
      ? inventory.customTypes.find((t) => t.id === id)?.name
      : exclusionTypes.find((t) => t.id === id)?.name) ?? '種別'
  // 行の実効種別
  const rowType = (row: OwnedItem): EffectiveType => effectiveTypeId(row, commonMap, userMap, defaultTypeId)

  // 表示種別タブの切替（端末ローカルに保存）
  const selectDisplayType = (t: DisplayType) => {
    setDisplayTypeState(t)
    setDisplayType(t)
  }

  // ---- サーバ登録対象外（ユーザー指定分の操作） ----
  const isServerExcludedName = (name: string) => serverExcludedSet.has(normalizeName(name))
  const persistUserServerExcluded = (next: string[]) => {
    setUserServerExcluded(next)
    setServerExcludedNames(next)
    // 保存先がサーバーのとき、対象の振り分け（分割保存）を反映させるため保存を予約する
    if (modeRef.current === 'db') scheduleSave()
  }
  const toggleUserServerExcluded = (name: string) => {
    const n = name.trim()
    if (!n) return
    persistUserServerExcluded(
      userServerExcluded.includes(n) ? userServerExcluded.filter((x) => x !== n) : [...userServerExcluded, n]
    )
  }

  // 同名アイテムが減ったとき、残すアイテム（ステータス）を確認するための保留状態
  const [pendingReduction, setPendingReduction] = useState<{
    accountId: string
    kept: ReturnType<typeof parseItemBox>['rows']
    map: Record<string, Item>
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
      // 転送×（トレード不可）以外は全件取り込む（除外はせず、種別で表示を切り替える方式）
      const kept = parsed.filter((r) => !isTransferNg(r.tenso))

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
        setPendingReduction({ accountId, kept, map, prevByName, groups })
        return
      }

      const newItems = buildNewItems(kept, map, accountId, prevByName, new Map())
      commit((p) => ({
        ...p,
        items: [...p.items.filter((i) => i.accountId !== accountId), ...newItems],
      }))
      setRaw('')
      setPasteResult(`${newItems.length}件を取り込みました。`)
    } finally {
      setParsing(false)
    }
  }

  // 「残すアイテム」を確定して取り込みを完了する
  const applyReduction = () => {
    if (!pendingReduction) return
    const { accountId, kept, map, prevByName, groups } = pendingReduction
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
    setPasteResult(`${newItems.length}件を取り込みました。`)
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

  // ユーザーの種別割当を付与/更新する（アイテム名単位。同名の全行に効く）。
  // 取り込み済みの行は削除しない（表示種別で切り替える方式）。
  // カスタム種別（ct_ 付き id）も共通種別（number）も同じ入口で割り当てる。
  const assignUserType = (name: string, typeId: number | CustomTypeId | null) => {
    if (isCustomTypeId(typeId)) {
      commit((p) => ({
        ...p,
        exclusions: [
          ...p.exclusions.filter((e) => e.name !== name),
          { name, exclusion_type_id: null, custom_type_id: typeId },
        ],
      }))
      // カスタム種別への割当は本人専用の分類なので、共通種別化の検討用報告はしない
      return
    }
    // 選んだ種別が共通登録済みの種別と同じなら、個別設定は冗長なので持たない
    // （共通に従う＝該当設定は削除。実効種別は共通から同じ種別になる）。
    const commonType = commonMap.get(normalizeName(name))
    if (commonType != null && (typeId ?? defaultTypeId) === commonType) {
      clearUserType(name)
      return
    }
    commit((p) => ({
      ...p,
      exclusions: [
        ...p.exclusions.filter((e) => e.name !== name),
        { name, exclusion_type_id: typeId },
      ],
    }))
    // 端末保存の場合は種別割当がサーバーに残らないため、共通種別化の検討用に匿名で名前を報告する
    // （誰が分類したかは記録されない）。DB保存時は自動保存で user_excluded_items に入るため不要。
    if (modeRef.current === 'local') {
      excludedItemsApi.report([name]).catch(() => {})
    }
  }

  // ユーザーの種別割当を解除する（未設定に戻す）
  const clearUserType = (name: string) =>
    commit((p) => ({ ...p, exclusions: p.exclusions.filter((e) => e.name !== name) }))

  // ---- カスタム種別（自分専用）の操作 ----
  // カスタム種別を追加する（重複名は共通種別・カスタム種別の両方と照合して拒否）。
  const createCustomType = async (rawName: string): Promise<CustomTypeId | null> => {
    const name = rawName.trim()
    if (!name) return null
    if (name.length > 100) {
      await alert('種別名は100文字以内で入力してください。', { title: 'エラー' })
      return null
    }
    if (inventory.customTypes.some((t) => t.name === name) || exclusionTypes.some((t) => t.name === name)) {
      await alert('同じ名前の種別が既にあります。', { title: 'エラー' })
      return null
    }
    const id = newLocalId('ct') as CustomTypeId
    commit((p) => ({ ...p, customTypes: [...p.customTypes, { id, name }] }))
    return id
  }

  // 種別ダイアログからカスタム種別を追加し、そのまま当該アイテムへ割り当てる。
  const createCustomTypeAndAssign = async (rowName: string) => {
    const id = await createCustomType(newCustomTypeName)
    if (!id) return
    assignUserType(rowName, id)
    setNewCustomTypeName('')
    setTypeDialogRowId(null)
  }

  // 管理モーダルからの追加（名前はダイアログ内のテキストボックスで受け取る）
  const addCustomTypeViaPrompt = async () => {
    const name = (await prompt('追加するカスタム種別名', { title: 'カスタム種別', confirmLabel: '決定' }))?.trim()
    if (!name) return
    await createCustomType(name)
  }

  const renameCustomType = async (id: CustomTypeId, current: string) => {
    const name = (await prompt('カスタム種別名', { title: 'カスタム種別', defaultValue: current, confirmLabel: '決定' }))?.trim()
    if (!name || name === current) return
    if (inventory.customTypes.some((t) => t.id !== id && t.name === name) || exclusionTypes.some((t) => t.name === name)) {
      await alert('同じ名前の種別が既にあります。', { title: 'エラー' })
      return
    }
    commit((p) => ({ ...p, customTypes: p.customTypes.map((t) => (t.id === id ? { ...t, name } : t)) }))
  }

  // カスタム種別を削除する。割当も一緒に解除する（実効種別は共通割当／取引可能／未登録へ戻る）。
  const removeCustomType = async (id: CustomTypeId, name: string) => {
    const count = inventory.exclusions.filter((e) => e.custom_type_id === id).length
    const ok = await confirm(
      `カスタム種別「${name}」を削除します。${count > 0 ? `この種別を割り当てた${count}件のアイテム名は割当が解除されます。` : ''}よろしいですか？`,
      { title: 'カスタム種別の削除', confirmLabel: '削除', cancelLabel: 'キャンセル', danger: true }
    )
    if (!ok) return
    commit((p) => ({
      ...p,
      customTypes: p.customTypes.filter((t) => t.id !== id),
      exclusions: p.exclusions.filter((e) => e.custom_type_id !== id),
    }))
    if (displayType === id) selectDisplayType('all')
  }

  // 管理者が種別ダイアログから新しい種別を登録し、その種別を当該アイテムへ割り当てる。
  const createTypeAndAssign = async (name: string) => {
    const tn = newTypeName.trim()
    if (!tn) return
    setAddingType(true)
    try {
      const res = await excludedItemsApi.createType(tn)
      setExclusionTypes((p) => [...p, res.data])
      assignUserType(name, res.data.id)
      setNewTypeName('')
      setTypeDialogRowId(null)
    } catch {
      await alert('種別の追加に失敗しました（同名が既にある可能性があります）。', { title: 'エラー' })
    } finally {
      setAddingType(false)
    }
  }

  // ---- 派生 ----
  const accountName = (id: string | null) =>
    id == null ? '未割り当て' : (inventory.accounts.find((a) => a.id === id)?.name ?? '未割り当て')

  // 表示名（登録アイテム名があればそれ、無ければ貼り付け名）。並び替えの基準に使う。
  const displayName = (i: OwnedItem) => i.item?.name ?? i.name

  // 行が現在の表示種別タブに合致するか
  const matchesDisplayType = (i: OwnedItem) => {
    if (displayType === 'all') return true
    return rowType(i) === displayType
  }

  const visibleItems = useMemo(() => {
    return inventory.items
      .filter((i) => {
        if (filterAccountId === 'all') { /* all */ }
        else if (filterAccountId === 'unassigned') { if (i.accountId != null) return false }
        else if (i.accountId !== filterAccountId) return false
        if (markedOnly && !i.marked) return false
        if (!matchesDisplayType(i)) return false
        return true
      })
      // 常にあいうえお順（日本語ロケール）で表示する。
      // 共有コレーター（compareJa）を使い、大きな一覧でもソートが重くならないようにする。
      .sort((a, b) => compareJa(displayName(a), displayName(b)))
    // matchesDisplayType は commonMap/userMap/displayType に依存（下記の依存で網羅）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory.items, filterAccountId, markedOnly, displayType, commonMap, userMap, defaultTypeId])

  // 表示種別タブごとの件数（アカウント・マーク絞り込みは反映、種別だけを変えた件数）
  const typeCounts = useMemo(() => {
    const base = inventory.items.filter((i) => {
      if (filterAccountId === 'all') { /* all */ }
      else if (filterAccountId === 'unassigned') { if (i.accountId != null) return false }
      else if (i.accountId !== filterAccountId) return false
      if (markedOnly && !i.marked) return false
      return true
    })
    const counts = new Map<DisplayType, number>()
    counts.set('all', base.length)
    for (const i of base) {
      const t = rowType(i)
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory.items, filterAccountId, markedOnly, commonMap, userMap, defaultTypeId])

  // 重複（異なる取り込み先で同名のアイテムを所持）。取引可能（登録アイテム）に限らず、
  // 種別が割り当てられた行も対象とし、名称（表示名）でまとめる。実効種別が「未登録」（unset）の
  // 行のみ対象外。取り込み先（アカウント）が2件以上にまたがる名称を抽出し、各アカウントの所持個数を併記する。
  const duplicates = useMemo(() => {
    const byName = new Map<string, { name: string; accounts: Map<string, number> }>()
    for (const i of inventory.items) {
      if (i.accountId == null) continue
      if (rowType(i) === 'unset') continue
      const key = normalizeName(displayName(i))
      let e = byName.get(key)
      if (!e) { e = { name: displayName(i), accounts: new Map() }; byName.set(key, e) }
      e.accounts.set(i.accountId, (e.accounts.get(i.accountId) ?? 0) + i.count)
    }
    return [...byName.values()]
      .filter((e) => e.accounts.size >= 2)
      .sort((a, b) => compareJa(a.name, b.name))
    // rowType は commonMap/userMap/defaultTypeId に依存（下記の依存で網羅）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory.items, commonMap, userMap, defaultTypeId])

  const markedCount = inventory.items.filter((i) => i.marked).length
  const newItemRow = inventory.items.find((i) => i.id === newItemRowId) ?? null
  const candidateRow = inventory.items.find((i) => i.id === candidateRowId) ?? null
  const typeDialogRow = inventory.items.find((i) => i.id === typeDialogRowId) ?? null

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
          <h1 className="text-xl font-bold text-white">アイテムボックス</h1>
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
        className="flex flex-col gap-2 sticky z-30 bg-surface/90 backdrop-blur px-4 py-2 rounded-lg"
        style={{ top: headerH }}
      >
        {/* 1段目: アカウント切替＋マークのみ＋サーバ登録対象外 */}
        <div className="flex items-start gap-3">
          {/* 表示切替（アカウントごとのタブ。セレクトボックスからタブ表示へ）。
              アカウントが増えても右上のボタン群は固定したいので、タブ側を flex-1 で残り幅に折り返させる */}
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span className="text-xs text-gray-400 w-8 shrink-0 pt-1.5">表示</span>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
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
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 hover:border-amber-500/70 cursor-pointer text-xs text-amber-200 transition-colors">
              <input type="checkbox" checked={markedOnly} onChange={(e) => setMarkedOnly(e.target.checked)} className="accent-amber-500 w-4 h-4" />
              <span>★ マークのみ ({markedCount})</span>
            </label>
            <button
              onClick={() => setServerExcludedModalOpen(true)}
              className="text-xs px-2 py-1.5 rounded border border-sky-500/40 bg-sky-500/10 hover:border-sky-500/70 text-sky-200 transition-colors"
              title="サーバーに保存しない（端末のみ）アイテムを設定する"
            >
              サーバ登録対象外 ({serverExcludedSet.size})
            </button>
            <button
              onClick={() => setDuplicateModalOpen(true)}
              className="text-xs px-2 py-1.5 rounded border border-violet-500/40 bg-violet-500/10 hover:border-violet-500/70 text-violet-200 transition-colors"
              title="異なる取り込み先で同じ名称のアイテムを所持しているものを確認する（種別「未登録」は対象外）"
            >
              重複を確認 ({duplicates.length})
            </button>
          </div>
        </div>

        {/* 2段目: 表示種別（ジャンル）切替。アカウント切替と同じ単一選択タブ */}
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-400 w-8 shrink-0 pt-1.5">種別</span>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
          {([
            { id: 'all' as DisplayType, label: 'すべて' },
            { id: 'tradeable' as DisplayType, label: '取引可能' },
            ...exclusionTypes.map((t) => ({ id: t.id as DisplayType, label: t.name })),
            // ユーザーごとのカスタム種別（自分専用）
            ...inventory.customTypes.map((t) => ({ id: t.id as DisplayType, label: t.name })),
            { id: 'unset' as DisplayType, label: '未登録' },
          ]).map((tab) => {
            const active = displayType === tab.id
            const count = typeCounts.get(tab.id) ?? 0
            return (
              <button
                key={String(tab.id)}
                type="button"
                onClick={() => selectDisplayType(tab.id)}
                aria-pressed={active}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-primary-500 border-primary-500 text-white'
                    : 'border-surface-border text-gray-300 hover:text-white hover:border-gray-500'
                }`}
              >
                {tab.label} <span className={active ? 'text-white/70' : 'text-gray-500'}>({count})</span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setCustomTypeModalOpen(true)}
            className="text-xs px-3 py-1 rounded-full border border-dashed border-surface-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            title="自分専用のカスタム種別を追加・改名・削除する"
          >
            ⚙ カスタム種別
          </button>
          </div>
        </div>
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
              <th className={`${thCls} px-3 py-3 text-left`}>種別</th>
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
              <tr><td colSpan={filterAccountId === 'all' ? 10 : 9} className="text-center py-12 text-gray-500">
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
                          {row.item!.official_url && (
                            <div className="mt-0.5">
                              <OfficialDbLink url={row.item!.official_url} />
                            </div>
                          )}
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
                          {/* 取引可能以外の種別が割り当てられた行は、登録（候補/新規登録）ボタンを出さない。
                              未設定の行のみ登録を促す。「...」省略名は候補ボタン、完全名は新規登録ボタン。 */}
                          {rowType(row) === 'unset' && (
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
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
                          )}
                        </>
                      )}
                    </td>

                    {/* 種別（表示ジャンル）。どの行もクリックで種別を変更できる。
                        取引可能（登録済みの派生種別）も、種別を割り当てればそちらが優先される。 */}
                    <td className="px-3 py-3">
                      {(() => {
                        const et = rowType(row)
                        if (et === 'tradeable') {
                          return (
                            <button
                              onClick={() => setTypeDialogRowId(row.id)}
                              className="inline-flex items-center gap-1 text-[11px] bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-700/40 text-emerald-300 rounded px-2 py-0.5 whitespace-nowrap transition-colors"
                              title="登録アイテムの既定種別（取引可能）。クリックで種別を設定でき、設定した種別が優先されます"
                            >
                              取引可能
                              <span aria-hidden>✎</span>
                            </button>
                          )
                        }
                        // 未設定 / 共通（管理者）/ ユーザー割当 のいずれもクリックで種別を変更できる。
                        // 共通割当はユーザーが自分用に上書きできる（実効種別はユーザー割当が優先）。
                        const name = normalizeName(row.name)
                        const isUserAssigned = userMap.has(name)
                        const isCommon = !isUserAssigned && et !== 'unset' && commonMap.has(name)
                        const cls =
                          et === 'unset'
                            ? 'bg-surface hover:bg-surface-border border-dashed border-surface-border text-gray-400'
                            : isCommon
                              ? 'bg-surface hover:bg-surface-border border-surface-border text-gray-300'
                              : 'bg-primary-500/10 hover:bg-primary-500/20 border-primary-500/40 text-primary-300'
                        return (
                          <button
                            onClick={() => setTypeDialogRowId(row.id)}
                            className={`inline-flex items-center gap-1 text-[11px] border rounded px-2 py-0.5 whitespace-nowrap transition-colors ${cls}`}
                            title={
                              et === 'unset'
                                ? 'このアイテムの種別を設定'
                                : isCommon
                                  ? '管理者の共通種別。クリックで自分用に変更できます'
                                  : '種別を変更・解除'
                            }
                          >
                            {et === 'unset' ? '未設定' : typeName(et)}
                            {isCommon && <span className="text-[9px] text-gray-500 border border-surface-border rounded px-1 leading-none">共通</span>}
                            <span aria-hidden>✎</span>
                          </button>
                        )
                      })()}
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
                          onClick={() => toggleUserServerExcluded(row.name)}
                          className={`text-xs px-2 py-1 rounded border transition-colors ${
                            isServerExcludedName(row.name)
                              ? 'bg-amber-900/30 border-amber-700/50 text-amber-300'
                              : 'bg-surface hover:bg-surface-border border-surface-border text-gray-400'
                          }`}
                          title={isServerExcludedName(row.name)
                            ? 'サーバ登録対象外（端末のみ保存）。クリックで解除'
                            : 'このアイテムをサーバ登録対象外（端末のみ保存）にする'}
                        >
                          {isServerExcludedName(row.name) ? '🔒 端末のみ' : '端末のみ'}
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto !mt-0">
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto !mt-0" onClick={() => setAccountModalOpen(false)}>
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

      {/* 種別選択ダイアログ（取引可能以外の行の表示種別を割り当て・変更する。共通割当も上書き可） */}
      {typeDialogRow && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto !mt-0" onClick={() => setTypeDialogRowId(null)}>
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-bold text-white">種別を選択</h3>
              <p className="text-xs text-gray-400 mt-1">
                「{typeDialogRow.name}」の表示種別（ジャンル）を選びます。同じ名前のアイテムすべてに適用されます。
                自分専用のカスタム種別も追加できます。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {exclusionTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { assignUserType(typeDialogRow.name, t.id); setTypeDialogRowId(null) }}
                  className="text-xs px-3 py-1.5 rounded-full border border-surface-border text-gray-200 hover:border-primary-500 hover:text-white transition-colors"
                >
                  {t.name}
                </button>
              ))}
              {exclusionTypes.length === 0 && inventory.customTypes.length === 0 && (
                <p className="text-sm text-gray-500">選択できる種別がありません。下からカスタム種別を追加してください。</p>
              )}
            </div>

            {/* カスタム種別（自分専用）。誰でも追加でき、自分のアイテムボックスにだけ表示される。
                保存先がサーバー（DB）のときはカスタム種別もサーバーに保存される。 */}
            <div className="border-t border-surface-border pt-3 space-y-2">
              <p className="text-xs text-gray-400">
                カスタム種別（自分専用）。保存先が「サーバー」の場合はカスタム種別もサーバーに保存されます。
              </p>
              {inventory.customTypes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {inventory.customTypes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { assignUserType(typeDialogRow.name, t.id); setTypeDialogRowId(null) }}
                      className="text-xs px-3 py-1.5 rounded-full border border-primary-500/40 text-primary-300 hover:border-primary-500 hover:text-white transition-colors"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCustomTypeName}
                  onChange={(e) => setNewCustomTypeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createCustomTypeAndAssign(typeDialogRow.name) }}
                  placeholder="新しいカスタム種別名"
                  maxLength={100}
                  className="flex-1 bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                />
                <button
                  onClick={() => createCustomTypeAndAssign(typeDialogRow.name)}
                  disabled={!newCustomTypeName.trim()}
                  className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors whitespace-nowrap"
                >
                  + 追加して割当
                </button>
              </div>
            </div>

            {/* アイテム情報が未登録の行は、ここからアイテム登録もできる（登録すると取引可能になる）。
                行内の登録ボタンと同様、「...」省略名は候補ダイアログ、完全名は新規登録フォームへ。 */}
            {!typeDialogRow.item && (
              <div className="border-t border-surface-border pt-3">
                <p className="text-xs text-gray-400 mb-2">
                  このアイテムのアイテム情報は未登録です。登録すると種別は「取引可能」になり、出品・買取に使えます。
                </p>
                {isTruncatedName(typeDialogRow.name) ? (
                  <button
                    onClick={() => { const id = typeDialogRow.id; setTypeDialogRowId(null); setCandidateRowId(id) }}
                    className="text-xs bg-sky-600/80 hover:bg-sky-600 text-white px-3 py-1.5 rounded transition-colors"
                  >
                    候補から登録
                  </button>
                ) : (
                  <button
                    onClick={() => { const id = typeDialogRow.id; const name = typeDialogRow.name; setTypeDialogRowId(null); openNewItemForm(id, name) }}
                    className="text-xs bg-yellow-600/80 hover:bg-yellow-600 text-white px-3 py-1.5 rounded transition-colors"
                  >
                    + アイテム情報を新規登録
                  </button>
                )}
              </div>
            )}

            {/* 管理者のみ: 全ユーザー共通の新規種別を登録して割り当て */}
            {isAdmin && (
              <div className="flex items-center gap-2 border-t border-surface-border pt-3">
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createTypeAndAssign(typeDialogRow.name) }}
                  placeholder="新しい共通種別名（管理者）"
                  className="flex-1 bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                />
                <button
                  onClick={() => createTypeAndAssign(typeDialogRow.name)}
                  disabled={addingType || !newTypeName.trim()}
                  className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors whitespace-nowrap"
                >
                  {addingType ? '追加中...' : '+ 追加して割当'}
                </button>
              </div>
            )}

            <div className="flex justify-between">
              {/* 既にユーザー割当がある場合は解除も可能 */}
              {userMap.has(normalizeName(typeDialogRow.name)) ? (
                <button onClick={() => { clearUserType(typeDialogRow.name); setTypeDialogRowId(null) }} className="text-sm text-red-400 hover:text-red-300 px-2 py-2">種別を解除</button>
              ) : <span />}
              <button onClick={() => setTypeDialogRowId(null)} className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border transition-colors">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* カスタム種別の管理モーダル（自分専用の表示種別を追加・改名・削除する） */}
      {customTypeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto !mt-0" onClick={() => setCustomTypeModalOpen(false)}>
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">カスタム種別の管理</h3>
              <button onClick={addCustomTypeViaPrompt} className="text-xs bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded transition-colors">+ 追加</button>
            </div>
            <p className="text-xs text-gray-400">
              自分専用の表示種別です。種別タブと種別選択ダイアログに追加され、他のユーザーには表示されません。
              保存先が「サーバー」の場合はカスタム種別もサーバーに保存されます。
              削除すると、その種別を割り当てたアイテム名の割当も解除されます。
            </p>
            {inventory.customTypes.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">カスタム種別はありません。「追加」から登録できます。</p>
            ) : (
              <div className="space-y-1.5">
                {inventory.customTypes.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 bg-surface border border-surface-border rounded px-3 py-2">
                    <span className="flex-1 text-sm text-white truncate">{t.name}</span>
                    <span className="text-xs text-gray-500">{inventory.exclusions.filter((e) => e.custom_type_id === t.id).length}件</span>
                    <button onClick={() => renameCustomType(t.id, t.name)} className="text-xs text-gray-300 hover:text-white px-2">改名</button>
                    <button onClick={() => removeCustomType(t.id, t.name)} className="text-xs text-red-400 hover:text-red-300 px-2">削除</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setCustomTypeModalOpen(false)} className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border transition-colors">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* サーバ登録対象外の設定（保存先がサーバーでも端末のみに保存する） */}
      {serverExcludedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto !mt-0" onClick={() => setServerExcludedModalOpen(false)}>
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-bold text-white">サーバ登録対象外</h3>
              <p className="text-xs text-gray-400 mt-1">
                ここに登録した名前のアイテムは、保存先が「サーバー」でもサーバーには保存せず、この端末（ローカル）にだけ保存します。
                運営に見られたくないアイテム向けの設定です。
              </p>
            </div>

            {/* ユーザー指定分の追加 */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={serverExcludedInput}
                onChange={(e) => setServerExcludedInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && serverExcludedInput.trim()) { toggleUserServerExcluded(serverExcludedInput); setServerExcludedInput('') } }}
                placeholder="アイテム名を入力"
                className="flex-1 bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
              />
              <button
                onClick={() => { if (serverExcludedInput.trim()) { toggleUserServerExcluded(serverExcludedInput); setServerExcludedInput('') } }}
                disabled={!serverExcludedInput.trim()}
                className="text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors whitespace-nowrap"
              >
                + 追加
              </button>
            </div>

            {/* ユーザー指定分の一覧 */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-1.5">自分で指定した対象外（端末のみ・{userServerExcluded.length}件）</h4>
              {userServerExcluded.length === 0 ? (
                <p className="text-xs text-gray-500">指定はありません。上の入力か、一覧の「端末のみ」ボタンから追加できます。</p>
              ) : (
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {[...userServerExcluded].sort((a, b) => compareJa(a, b)).map((name) => (
                    <div key={name} className="flex items-center gap-2 bg-surface border border-surface-border rounded px-3 py-1.5">
                      <span className="flex-1 text-sm text-white truncate">{name}</span>
                      <button onClick={() => toggleUserServerExcluded(name)} className="text-xs text-red-400 hover:text-red-300 px-2">解除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* システム共通分（読み取り専用） */}
            {serverCommonNames.length > 0 && (
              <div className="border-t border-surface-border pt-3">
                <h4 className="text-xs font-semibold text-gray-400 mb-1.5">運営が指定した共通の対象外（{serverCommonNames.length}件）</h4>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {[...serverCommonNames].sort((a, b) => compareJa(a, b)).map((name) => (
                    <span key={name} className="text-[11px] bg-surface border border-surface-border text-gray-300 rounded px-2 py-0.5">{name}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => setServerExcludedModalOpen(false)} className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border transition-colors">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 重複確認（異なる取り込み先で同名の登録アイテムを所持しているものを一覧表示） */}
      {duplicateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto !mt-0" onClick={() => setDuplicateModalOpen(false)}>
          <div className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-lg w-full my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-bold text-white">重複の確認</h3>
              <p className="text-xs text-gray-400 mt-1">
                異なる取り込み先（MoE アカウント）で同じ名称のアイテムを所持しているものを一覧表示します。
                各取り込み先の所持個数を併記します。種別が「未登録」のアイテムは対象外です（取引可能・その他の種別は対象）。
              </p>
            </div>

            {duplicates.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">複数の取り込み先にまたがる重複アイテムはありません。</p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {duplicates.map((d) => (
                  <div key={d.name} className="border border-surface-border rounded-lg p-3">
                    <p className="text-sm text-white font-medium">{d.name}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {[...d.accounts.entries()]
                        .sort((a, b) => compareJa(accountName(a[0]), accountName(b[0])))
                        .map(([accId, cnt]) => (
                          <span key={accId} className="text-[11px] bg-surface border border-surface-border text-gray-200 rounded px-2 py-0.5 whitespace-nowrap">
                            {accountName(accId)} <span className="text-gray-500">×{cnt}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => setDuplicateModalOpen(false)} className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border transition-colors">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 数が減った同名アイテムのうち、どれ（どのステータス）を残すか確認 */}
      {pendingReduction && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto !mt-0" onClick={() => setPendingReduction(null)}>
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
