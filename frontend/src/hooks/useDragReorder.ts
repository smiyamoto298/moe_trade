import { useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react'

/**
 * ドラッグ＆ドロップによる並び替えの共通ロジック。
 *
 * ドラッグ元インデックスは ref で同期管理する。state だけだと dragover の
 * 高速連続発火に state 更新が追いつかず、古い値で並べ替えて「掴んだものと別の行が動く」
 * 不具合が起きるため。
 *
 * 使い方:
 *   const { dragIdx, onDragStart, onDragOver, onDrop } = useDragReorder(setItems, async (items) => {
 *     const ids = items.map((x) => x.id)
 *     await api.reorder(ids)
 *   })
 *   <div onDragOver={onDragOver(idx)} onDrop={onDrop} className={dragIdx === idx ? '...' : '...'}>
 *     <span draggable onDragStart={() => onDragStart(idx)} onDragEnd={onDrop}>⠿</span>
 *   </div>
 *
 * @param setItems  並び替え対象リストの setState
 * @param persist   ドロップ確定時に呼ばれる保存処理（並び替え後のリストを受け取る）
 */
export function useDragReorder<T>(
  setItems: Dispatch<SetStateAction<T[]>>,
  persist: (items: T[]) => void | Promise<void>,
) {
  // スタイリング用（ハイライト表示）。並べ替え判定には使わない。
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const dragIdxRef = useRef<number | null>(null)
  const orderDirty = useRef(false)
  // 最新の並び順（ドロップ時の保存に使用）
  const latestRef = useRef<T[]>([])

  const onDragStart = (idx: number) => {
    dragIdxRef.current = idx
    setDragIdx(idx)
  }

  const onDragOver = (idx: number) => (e: DragEvent) => {
    e.preventDefault()
    const from = dragIdxRef.current
    if (from === null || from === idx) return
    setItems((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(idx, 0, moved)
      latestRef.current = next
      return next
    })
    dragIdxRef.current = idx
    setDragIdx(idx)
    orderDirty.current = true
  }

  const onDrop = () => {
    dragIdxRef.current = null
    setDragIdx(null)
    if (!orderDirty.current) return
    orderDirty.current = false
    void persist(latestRef.current)
  }

  return { dragIdx, onDragStart, onDragOver, onDrop }
}
