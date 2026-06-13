import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface DialogOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** 強調表示する警告文（メッセージの下に琥珀色のボックスで表示）。 */
  highlight?: string
  /** 任意のチェックボックス（「今後表示しない」等）。状態は onCheckbox で受け取る。 */
  checkbox?: { label: string; defaultChecked?: boolean }
  /** チェックボックスの最終状態（確認/キャンセルいずれの確定時にも呼ばれる）。 */
  onCheckbox?: (checked: boolean) => void
}

interface DialogState {
  open: boolean
  message: string
  kind: 'confirm' | 'alert'
  options: DialogOptions
  checked: boolean
  resolve: ((v: boolean) => void) | null
}

interface DialogContextValue {
  /** 確認ダイアログ。OK で true、キャンセル/閉じるで false を返す */
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>
  /** 通知ダイアログ。OK で閉じる */
  alert: (message: string, options?: DialogOptions) => Promise<void>
}

const DialogContext = createContext<DialogContextValue | null>(null)

const INITIAL: DialogState = { open: false, message: '', kind: 'confirm', options: {}, checked: false, resolve: null }

/**
 * window.confirm / window.alert の代替。
 * ネイティブダイアログはタブ非アクティブ時や非同期処理後に抑制されることがあるため、
 * 状態駆動のモーダルで確実に表示・操作できるようにする。
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(INITIAL)

  const confirm = useCallback(
    (message: string, options: DialogOptions = {}) =>
      new Promise<boolean>((resolve) => {
        setState({ open: true, message, kind: 'confirm', options, checked: options.checkbox?.defaultChecked ?? false, resolve })
      }),
    []
  )

  const alert = useCallback(
    (message: string, options: DialogOptions = {}) =>
      new Promise<void>((resolve) => {
        setState({ open: true, message, kind: 'alert', options, checked: options.checkbox?.defaultChecked ?? false, resolve: () => resolve() })
      }),
    []
  )

  const close = (result: boolean) => {
    state.options.onCheckbox?.(state.checked)
    state.resolve?.(result)
    setState(INITIAL)
  }

  const { open, message, kind, options, checked } = state

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={() => close(false)}
        >
          <div
            className="bg-surface-card border border-surface-border rounded-lg p-5 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {options.title && <h2 className="text-base font-bold text-white">{options.title}</h2>}
            <p className="text-sm text-gray-300 whitespace-pre-line">{message}</p>
            {options.highlight && (
              <p className="text-sm font-medium text-amber-300 bg-amber-900/30 border border-amber-700/40 rounded px-3 py-2 whitespace-pre-line">
                {options.highlight}
              </p>
            )}
            {options.checkbox && (
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setState((s) => ({ ...s, checked: e.target.checked }))}
                  className="accent-primary-500 w-4 h-4"
                />
                {options.checkbox.label}
              </label>
            )}
            <div className="flex justify-end gap-2">
              {kind === 'confirm' && (
                <button
                  onClick={() => close(false)}
                  className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded border border-surface-border transition-colors"
                >
                  {options.cancelLabel ?? 'キャンセル'}
                </button>
              )}
              <button
                onClick={() => close(true)}
                className={`text-sm text-white px-4 py-2 rounded font-medium transition-colors ${
                  options.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-primary-500 hover:bg-primary-600'
                }`}
              >
                {options.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider')
  return ctx
}
