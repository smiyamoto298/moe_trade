import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface DialogOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface DialogState {
  open: boolean
  message: string
  kind: 'confirm' | 'alert'
  options: DialogOptions
  resolve: ((v: boolean) => void) | null
}

interface DialogContextValue {
  /** 確認ダイアログ。OK で true、キャンセル/閉じるで false を返す */
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>
  /** 通知ダイアログ。OK で閉じる */
  alert: (message: string, options?: DialogOptions) => Promise<void>
}

const DialogContext = createContext<DialogContextValue | null>(null)

const INITIAL: DialogState = { open: false, message: '', kind: 'confirm', options: {}, resolve: null }

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
        setState({ open: true, message, kind: 'confirm', options, resolve })
      }),
    []
  )

  const alert = useCallback(
    (message: string, options: DialogOptions = {}) =>
      new Promise<void>((resolve) => {
        setState({ open: true, message, kind: 'alert', options, resolve: () => resolve() })
      }),
    []
  )

  const close = (result: boolean) => {
    state.resolve?.(result)
    setState(INITIAL)
  }

  const { open, message, kind, options } = state

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
