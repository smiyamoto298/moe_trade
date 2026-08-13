import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { DialogProvider } from './contexts/DialogContext'
import { TourProvider } from './tours/TourContext'
import App from './App'
import { installNumberInputWheelBlocker } from './utils/numberInputWheel'
import './index.css'

// 数値入力欄のホイール操作による値の増減をサイト全体で無効化する
installNumberInputWheelBlocker()

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
