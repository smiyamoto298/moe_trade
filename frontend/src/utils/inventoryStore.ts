import type { InventoryData, InventoryStorageMode } from '../types'
import { inventoryApi, type InventorySnapshot, type InventoryPutPayload } from '../api/inventory'
import { emptyInventory } from './inventory'

// 所有アイテム台帳のストレージアダプタ。
// 保存先（ローカルストレージ / DB）を差し替えても UI 側は同じ InventoryData を扱う。

export const STORAGE_MODE_KEY = 'moe_inventory_mode'
export const LOCAL_DATA_KEY = 'moe_inventory:v1'
// 「除外リストに追加」時の確認ダイアログを今後表示しないかどうか（端末ごとの設定）
export const SKIP_EXCLUDE_CONFIRM_KEY = 'moe_inventory_skip_exclude_confirm'
// ユーザーが「適用する共通除外の種別」として選んだ種別ID（端末ごとの設定）。
// 未設定（null）は「全種別を適用」（既定）。
export const APPLIED_EXCLUSION_TYPES_KEY = 'moe_inventory_applied_exclusion_types'
// 既定種別「その他」のうち、ユーザーが個別にOFFにした共通除外アイテム名（端末ごとの設定）。
// 既定は空＝その他のアイテムは全適用（オプトアウト方式）。
export const DISABLED_COMMON_NAMES_KEY = 'moe_inventory_disabled_common_names'

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

/** 適用する共通除外の種別ID。未設定（null）は「全種別を適用」（既定）。 */
export function getAppliedExclusionTypeIds(): number[] | null {
  try {
    const raw = localStorage.getItem(APPLIED_EXCLUSION_TYPES_KEY)
    if (raw == null) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === 'number') : null
  } catch {
    return null
  }
}

/** 適用する種別IDを保存する。null を渡すと「全種別を適用」（既定）に戻す。 */
export function setAppliedExclusionTypeIds(ids: number[] | null): void {
  try {
    if (ids == null) localStorage.removeItem(APPLIED_EXCLUSION_TYPES_KEY)
    else localStorage.setItem(APPLIED_EXCLUSION_TYPES_KEY, JSON.stringify(ids))
  } catch {
    /* noop */
  }
}

/** その他（既定種別）のうち個別にOFFにした共通除外アイテム名。既定は空（全適用）。 */
export function getDisabledCommonNames(): string[] {
  try {
    const raw = localStorage.getItem(DISABLED_COMMON_NAMES_KEY)
    if (raw == null) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** その他で個別OFFにした共通除外アイテム名を保存する。 */
export function setDisabledCommonNames(names: string[]): void {
  try {
    if (names.length === 0) localStorage.removeItem(DISABLED_COMMON_NAMES_KEY)
    else localStorage.setItem(DISABLED_COMMON_NAMES_KEY, JSON.stringify(names))
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
      exclusions: parsed.exclusions ?? [],
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

// ---- DB スナップショット ⇔ クライアント表現の変換 --------------------------

export function snapshotToInventory(s: InventorySnapshot): InventoryData {
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
    exclusions: s.exclusions,
  }
}

export function inventoryToPayload(d: InventoryData): InventoryPutPayload {
  return {
    // アカウントはクライアントの id を key として送る（サーバーが新IDへ対応づける）
    accounts: d.accounts.map((a, i) => ({ key: a.id, name: a.name, sort_order: i })),
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
    exclusions: d.exclusions,
  }
}

// ---- 公開 API ---------------------------------------------------------------

/** 指定した保存先から台帳を読み込む。 */
export async function loadInventory(mode: InventoryStorageMode): Promise<InventoryData> {
  if (mode === 'db') {
    const res = await inventoryApi.get()
    return snapshotToInventory(res.data)
  }
  return loadLocal()
}

/**
 * 初期ロード。保存先モードはサーバー（ユーザー単位）を正とする。
 *
 * これまでモードは端末の localStorage だけにあり、ある端末で「サーバー（DB）」を選んでも
 * 別端末では既定の local 表示に戻ってしまっていた。サーバーのスナップショットに含まれる
 * storage_mode を参照し、db なら DB の内容を、local ならこの端末の内容を返す。
 * サーバー到達不可時のみ端末キャッシュ（localStorage）のモードにフォールバックする。
 */
export async function loadInitialInventory(): Promise<{ mode: InventoryStorageMode; data: InventoryData }> {
  try {
    const res = await inventoryApi.get()
    const mode: InventoryStorageMode = res.data.storage_mode === 'db' ? 'db' : 'local'
    setStorageMode(mode) // 端末キャッシュも揃えておく（オフライン時のフォールバック用）
    return { mode, data: mode === 'db' ? snapshotToInventory(res.data) : loadLocal() }
  } catch {
    const mode = getStorageMode()
    return { mode, data: mode === 'db' ? emptyInventory() : loadLocal() }
  }
}

/** 保存先モードをサーバー（ユーザー単位）と端末キャッシュの両方へ記録する。 */
export async function persistStorageMode(mode: InventoryStorageMode): Promise<void> {
  setStorageMode(mode)
  await inventoryApi.setMode(mode)
}

/** 指定した保存先へ台帳を保存する。 */
export async function saveInventory(mode: InventoryStorageMode, data: InventoryData): Promise<void> {
  if (mode === 'db') {
    await inventoryApi.replace(inventoryToPayload(data))
    return
  }
  saveLocal(data)
}
