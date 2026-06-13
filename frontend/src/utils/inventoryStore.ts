import type { InventoryData, InventoryStorageMode } from '../types'
import { inventoryApi, type InventorySnapshot, type InventoryPutPayload } from '../api/inventory'
import { emptyInventory } from './inventory'

// 所有アイテム台帳のストレージアダプタ。
// 保存先（ローカルストレージ / DB）を差し替えても UI 側は同じ InventoryData を扱う。

export const STORAGE_MODE_KEY = 'moe_inventory_mode'
export const LOCAL_DATA_KEY = 'moe_inventory:v1'
// 「除外リストに追加」時の確認ダイアログを今後表示しないかどうか（端末ごとの設定）
export const SKIP_EXCLUDE_CONFIRM_KEY = 'moe_inventory_skip_exclude_confirm'

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
      items: parsed.items ?? [],
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

/** 指定した保存先へ台帳を保存する。 */
export async function saveInventory(mode: InventoryStorageMode, data: InventoryData): Promise<void> {
  if (mode === 'db') {
    await inventoryApi.replace(inventoryToPayload(data))
    return
  }
  saveLocal(data)
}
