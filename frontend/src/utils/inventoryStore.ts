import type { CustomType, CustomTypeId, InventoryData, InventoryStorageMode, OwnedItem, UserTypeAssignment } from '../types'
import { inventoryApi, type InventorySnapshot, type InventoryPutPayload } from '../api/inventory'
import { emptyInventory, isCustomTypeId, normalizeName } from './inventory'

// 所有アイテム台帳のストレージアダプタ。
// 保存先（ローカルストレージ / DB）を差し替えても UI 側は同じ InventoryData を扱う。

export const STORAGE_MODE_KEY = 'moe_inventory_mode'
export const LOCAL_DATA_KEY = 'moe_inventory:v1'
// 「対象外種別の付与」時などの確認ダイアログを今後表示しないかどうか（端末ごとの設定）
export const SKIP_EXCLUDE_CONFIRM_KEY = 'moe_inventory_skip_exclude_confirm'
// 現在選択中の表示種別タブ（端末ごと）。'all' | 'tradeable' | 'unset' | type_id(number)。既定は取引可能。
export const DISPLAY_TYPE_KEY = 'moe_inventory_display_type'
// ユーザー指定の「サーバ登録対象外」アイテム名（端末ごと・サーバーには送らない）。
export const SERVER_EXCLUDED_KEY = 'moe_inventory_server_excluded'
// DBモード時に、サーバ登録対象外のためサーバーへ送らずローカルにだけ保持するアイテム（分割保存）。
export const LOCAL_DB_SPLIT_KEY = 'moe_inventory:db-local:v1'

export type DisplayType = 'all' | 'tradeable' | 'unset' | number | CustomTypeId

export function getSkipExcludeConfirm(): boolean {
  try {
    return localStorage.getItem(SKIP_EXCLUDE_CONFIRM_KEY) === '1'
  } catch {
    return false
  }
}

export function setSkipExcludeConfirm(skip: boolean): void {
  try {
    if (skip) localStorage.setItem(SKIP_EXCLUDE_CONFIRM_KEY, '1')
    else localStorage.removeItem(SKIP_EXCLUDE_CONFIRM_KEY)
  } catch {
    /* noop */
  }
}

/** 現在選択中の表示種別タブ。未設定（既定）は 'tradeable'（取引可能のみ表示）。 */
export function getDisplayType(): DisplayType {
  try {
    const raw = localStorage.getItem(DISPLAY_TYPE_KEY)
    if (raw == null) return 'tradeable'
    if (raw === 'all' || raw === 'tradeable' || raw === 'unset') return raw
    if (isCustomTypeId(raw)) return raw
    const n = Number(raw)
    return Number.isFinite(n) ? n : 'tradeable'
  } catch {
    return 'tradeable'
  }
}

export function setDisplayType(t: DisplayType): void {
  try {
    localStorage.setItem(DISPLAY_TYPE_KEY, String(t))
  } catch {
    /* noop */
  }
}

/** ユーザー指定の「サーバ登録対象外」名（端末ローカル。サーバーには送らない）。 */
export function getServerExcludedNames(): string[] {
  try {
    const raw = localStorage.getItem(SERVER_EXCLUDED_KEY)
    if (raw == null) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function setServerExcludedNames(names: string[]): void {
  try {
    if (names.length === 0) localStorage.removeItem(SERVER_EXCLUDED_KEY)
    else localStorage.setItem(SERVER_EXCLUDED_KEY, JSON.stringify(names))
  } catch {
    /* noop */
  }
}

/** 現在の保存先（デフォルトはローカルストレージ）。 */
export function getStorageMode(): InventoryStorageMode {
  try {
    return localStorage.getItem(STORAGE_MODE_KEY) === 'db' ? 'db' : 'local'
  } catch {
    return 'local'
  }
}

export function setStorageMode(mode: InventoryStorageMode): void {
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode)
  } catch {
    /* noop */
  }
}

// ---- 後方互換: exclusions（種別割当）の正規化 -------------------------------

/** 旧形式（文字列配列）／新形式（{name,exclusion_type_id,custom_type_id}）どちらも UserTypeAssignment[] に正規化する。 */
function normalizeExclusions(raw: unknown): UserTypeAssignment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((e): UserTypeAssignment | null => {
      if (typeof e === 'string') return { name: e, exclusion_type_id: null }
      if (e && typeof e === 'object' && typeof (e as { name?: unknown }).name === 'string') {
        const t = (e as { exclusion_type_id?: unknown }).exclusion_type_id
        const c = (e as { custom_type_id?: unknown }).custom_type_id
        return {
          name: (e as { name: string }).name,
          exclusion_type_id: typeof t === 'number' ? t : null,
          custom_type_id: isCustomTypeId(c) ? c : null,
        }
      }
      return null
    })
    .filter((v): v is UserTypeAssignment => v !== null)
}

/** ローカル保存のカスタム種別を正規化する（id は `ct_` プレフィックス付き文字列のみ有効）。 */
function normalizeCustomTypes(raw: unknown): CustomType[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((e): CustomType | null => {
      if (e && typeof e === 'object'
        && isCustomTypeId((e as { id?: unknown }).id)
        && typeof (e as { name?: unknown }).name === 'string') {
        return { id: (e as { id: CustomTypeId }).id, name: (e as { name: string }).name }
      }
      return null
    })
    .filter((v): v is CustomType => v !== null)
}

// ---- ローカルストレージ実装 -------------------------------------------------

function loadLocal(): InventoryData {
  try {
    const raw = localStorage.getItem(LOCAL_DATA_KEY)
    if (!raw) return emptyInventory()
    const parsed = JSON.parse(raw) as Partial<InventoryData>
    return {
      accounts: parsed.accounts ?? [],
      // 旧データには note が無いため空文字で補う
      items: (parsed.items ?? []).map((it) => ({ ...it, note: it.note ?? '' })),
      exclusions: normalizeExclusions(parsed.exclusions),
      customTypes: normalizeCustomTypes(parsed.customTypes),
    }
  } catch {
    return emptyInventory()
  }
}

function saveLocal(data: InventoryData): void {
  try {
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data))
  } catch {
    /* noop（容量超過など） */
  }
}

// ---- DBモードの分割保存（サーバ登録対象外をローカルにだけ持つ） --------------

// 分割保存する行は、DB再保存でアカウントIDが振り直されても復元できるよう
// アカウント「名」を併せて持つ（読込時に名前で現在のアカウントへ対応づける）。
type SplitItem = OwnedItem & { _accountName: string | null }

function loadLocalSplit(): SplitItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_DB_SPLIT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SplitItem[]).map((it) => ({ ...it, note: it.note ?? '' })) : []
  } catch {
    return []
  }
}

function saveLocalSplit(items: SplitItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(LOCAL_DB_SPLIT_KEY)
    else localStorage.setItem(LOCAL_DB_SPLIT_KEY, JSON.stringify(items))
  } catch {
    /* noop */
  }
}

function clearLocalSplit(): void {
  try {
    localStorage.removeItem(LOCAL_DB_SPLIT_KEY)
  } catch {
    /* noop */
  }
}

// ---- DB スナップショット ⇔ クライアント表現の変換 --------------------------

export function snapshotToInventory(s: InventorySnapshot): InventoryData {
  // カスタム種別はサーバー id を `ct_${id}` にしてクライアント表現へ（保存時は key として送り返す）
  const customTypes: CustomType[] = (s.custom_types ?? []).map((t) => ({ id: `ct_${t.id}` as CustomTypeId, name: t.name }))
  const customIds = new Set(customTypes.map((t) => t.id))
  return {
    accounts: s.accounts.map((a) => ({ id: String(a.id), name: a.name })),
    items: s.items.map((it) => ({
      id: String(it.id),
      accountId: it.moe_account_id != null ? String(it.moe_account_id) : null,
      no: it.no ?? '',
      name: it.name,
      category: it.category ?? '',
      count: it.count,
      itemId: it.item_id,
      item: it.item,
      worn: it.is_worn,
      dyed: it.is_dyed,
      marked: it.is_marked,
      note: it.note ?? '',
    })),
    // サーバーの custom_type_id（number）は `ct_${id}` に変換してから正規化する
    // （存在しないカスタム種別への参照は null に落とす）
    exclusions: normalizeExclusions(
      (Array.isArray(s.exclusions) ? (s.exclusions as unknown[]) : []).map((e) => {
        const c = e && typeof e === 'object' ? (e as { custom_type_id?: unknown }).custom_type_id : null
        if (typeof c !== 'number') return e
        const cid = `ct_${c}` as CustomTypeId
        return { ...(e as object), custom_type_id: customIds.has(cid) ? cid : null }
      })
    ),
    customTypes,
  }
}

export function inventoryToPayload(d: InventoryData): InventoryPutPayload {
  return {
    // アカウント・カスタム種別はクライアントの id を key として送る（サーバーがIDへ対応づける）
    accounts: d.accounts.map((a, i) => ({ key: a.id, name: a.name, sort_order: i })),
    custom_types: d.customTypes.map((t, i) => ({ key: t.id, name: t.name, sort_order: i })),
    items: d.items.map((it, i) => ({
      account_key: it.accountId,
      item_id: it.itemId,
      no: it.no,
      name: it.name,
      category: it.category,
      count: it.count,
      is_worn: it.worn,
      is_dyed: it.dyed,
      is_marked: it.marked,
      note: it.note ?? '',
      sort_order: i,
    })),
    exclusions: d.exclusions.map((e) => ({
      name: e.name,
      exclusion_type_id: e.exclusion_type_id,
      custom_type_key: e.custom_type_id ?? null,
    })),
  }
}

// ---- サーバ登録対象外の分割ヘルパー ----------------------------------------

/** 名前がサーバ登録対象外集合に含まれるか（正規化して判定）。 */
function isServerExcluded(name: string, set: Set<string>): boolean {
  return set.has(normalizeName(name))
}

// ---- 公開 API ---------------------------------------------------------------

/**
 * 指定した保存先から台帳を読み込む。
 * DBモードでは、サーバ登録対象外のためローカルにだけ保持していた行（分割保存）をマージして返す。
 */
export async function loadInventory(mode: InventoryStorageMode): Promise<InventoryData> {
  if (mode === 'db') {
    const res = await inventoryApi.get()
    return mergeSplitInto(snapshotToInventory(res.data))
  }
  return loadLocal()
}

/** DBスナップショットへ、ローカル分割保存の対象外行をマージする（アカウント名で現在のアカウントに対応づけ）。 */
function mergeSplitInto(inv: InventoryData): InventoryData {
  const split = loadLocalSplit()
  if (split.length === 0) return inv
  const idByName = new Map(inv.accounts.map((a) => [a.name, a.id]))
  const merged = split.map(({ _accountName, ...it }) => ({
    ...it,
    accountId: _accountName != null ? (idByName.get(_accountName) ?? null) : null,
  }))
  return { ...inv, items: [...inv.items, ...merged] }
}

/**
 * 初期ロード。保存先モードはサーバー（ユーザー単位）を正とする。
 * DBモードのときはローカル分割保存分もマージして返す。
 */
export async function loadInitialInventory(): Promise<{ mode: InventoryStorageMode; data: InventoryData }> {
  try {
    const res = await inventoryApi.get()
    const mode: InventoryStorageMode = res.data.storage_mode === 'db' ? 'db' : 'local'
    setStorageMode(mode) // 端末キャッシュも揃えておく（オフライン時のフォールバック用）
    return { mode, data: mode === 'db' ? mergeSplitInto(snapshotToInventory(res.data)) : loadLocal() }
  } catch {
    const mode = getStorageMode()
    return { mode, data: mode === 'db' ? mergeSplitInto(emptyInventory()) : loadLocal() }
  }
}

/** 保存先モードをサーバー（ユーザー単位）と端末キャッシュの両方へ記録する。 */
export async function persistStorageMode(mode: InventoryStorageMode): Promise<void> {
  setStorageMode(mode)
  await inventoryApi.setMode(mode)
}

/**
 * 指定した保存先へ台帳を保存する。
 *
 * DBモードでは、サーバ登録対象外（serverExcluded）に一致する行はサーバーへ送らず、
 * 端末ローカル（分割保存）にだけ保持する。残りはサーバーへ全置換で送る。
 * localモードはすべて端末ローカルへ保存する（分割は不要なのでクリアする）。
 */
export async function saveInventory(
  mode: InventoryStorageMode,
  data: InventoryData,
  serverExcluded: Set<string> = new Set(),
): Promise<void> {
  if (mode === 'db') {
    const nameById = new Map(data.accounts.map((a) => [a.id, a.name]))
    const dbItems: OwnedItem[] = []
    const splitItems: SplitItem[] = []
    for (const it of data.items) {
      if (isServerExcluded(it.name, serverExcluded)) {
        splitItems.push({ ...it, _accountName: it.accountId != null ? (nameById.get(it.accountId) ?? null) : null })
      } else {
        dbItems.push(it)
      }
    }
    await inventoryApi.replace(inventoryToPayload({ ...data, items: dbItems }))
    saveLocalSplit(splitItems)
    return
  }
  // local: すべて端末へ。分割保存は使わないのでクリアする。
  saveLocal(data)
  clearLocalSplit()
}
