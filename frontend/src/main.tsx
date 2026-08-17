import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { DialogProvider } from './contexts/DialogContext'
import { TourProvider } from './tours/TourContext'
import App from './App'
import { installNumberInputWheelBlocker } from './utils/numberInputWheel'
import { installPromptCapture } from './utils/installPrompt'
import './index.css'

// 数値入力欄のホイール操作による値の増減をサイト全体で無効化する
installNumberInputWheelBlocker()

// beforeinstallprompt は読み込み直後に飛ぶことがあるため、描画前に待ち受けを開始する
installPromptCapture()

/*
 * Service Worker を全ユーザーで登録する。
 * 以前は Web Push を有効にした人だけが登録していたが、Chrome のインストール判定には
 * SW の登録が必須なため、インストールボタンを出すには無条件登録が要る。
 * 通知の購読自体は従来どおり utils/webPush.ts 側でユーザー操作を契機に行う。
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 登録失敗（未対応・プライベートモード等）はサイト機能に影響しないため無視 */
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <DialogProvider>
            <TourProvider>
              <App />
            </TourProvider>
          </DialogProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)
