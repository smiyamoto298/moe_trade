import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Spinner from './components/Spinner'
import Footer from './components/Footer'
import SideBanners from './components/SideBanners'
import TourOverlay from './components/TourOverlay'
import HelpButton from './components/HelpButton'
import ListingsPage from './pages/ListingsPage'
import ListingDetailPage from './pages/ListingDetailPage'
import NewListingPage from './pages/NewListingPage'
import BulkListingPage from './pages/BulkListingPage'
import BuyRequestsPage from './pages/BuyRequestsPage'
import BuyRequestDetailPage from './pages/BuyRequestDetailPage'
import NewBuyRequestPage from './pages/NewBuyRequestPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import MyPage from './pages/MyPage'
import BoardPage from './pages/BoardPage'
import BoardThreadPage from './pages/BoardThreadPage'
import { useAuth } from './contexts/AuthContext'
import type { UserRole } from './types'

// 管理画面は利用者が限られるため遅延読み込みにして、初回バンドルから外す
const AdminItemsPage = lazy(() => import('./pages/admin/AdminItemsPage'))
const AdminItemEditPage = lazy(() => import('./pages/admin/AdminItemEditPage'))
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'))
const AnnouncementsAdminPage = lazy(() => import('./pages/admin/AnnouncementsAdminPage'))
const BonusValueLabelsAdminPage = lazy(() => import('./pages/admin/BonusValueLabelsAdminPage'))
const PromoTweetsPage = lazy(() => import('./pages/admin/PromoTweetsPage'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <>{children}</> : <Navigate to="/auth/login" replace />
}

function RoleRoute({ children, roles }: { children: React.ReactNode; roles: UserRole[] }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    // pb-* はfixedフッターの高さ分の逃げ（著作権表記の折り返し行数が画面幅で変わる）
    <div className="min-h-screen flex flex-col pb-24 sm:pb-20 min-[1150px]:pb-16">
      <Header />
      <main className="flex-1">
        {/* 遅延読み込みルートのチャンク取得中はスピナーを表示 */}
        <Suspense fallback={<Spinner center />}>
        <Routes>
          <Route path="/" element={<Navigate to="/listings" replace />} />
          <Route path="/listings" element={<ListingsPage key="equipment" mode="equipment" />} />
          <Route path="/skills" element={<ListingsPage key="skill" mode="skill" />} />
          <Route path="/assets" element={<ListingsPage key="asset" mode="asset" />} />
          <Route path="/listings/:id" element={<ListingDetailPage />} />
          <Route
            path="/listings/new"
            element={<PrivateRoute><NewListingPage /></PrivateRoute>}
          />
          <Route
            path="/listings/bulk"
            element={<PrivateRoute><BulkListingPage /></PrivateRoute>}
          />
          <Route path="/buy-requests" element={<BuyRequestsPage />} />
          <Route path="/buy-requests/:id" element={<BuyRequestDetailPage />} />
          <Route
            path="/buy-requests/new"
            element={<PrivateRoute><NewBuyRequestPage /></PrivateRoute>}
          />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegisterPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/mypage"
            element={<PrivateRoute><MyPage /></PrivateRoute>}
          />
          {/* 運営掲示板（ログイン必須） */}
          <Route
            path="/board"
            element={<PrivateRoute><BoardPage /></PrivateRoute>}
          />
          <Route
            path="/board/:id"
            element={<PrivateRoute><BoardThreadPage /></PrivateRoute>}
          />
          <Route path="/admin" element={<Navigate to="/admin/items" replace />} />
          {/* アイテム管理：閲覧は全員（ゲスト含む）可。操作はページ内で権限別に制御。 */}
          <Route path="/admin/items" element={<AdminItemsPage />} />
          {/* 追加・編集はログイン必須（権限の細部はページ内・APIで制御） */}
          <Route
            path="/admin/items/new"
            element={<PrivateRoute><AdminItemEditPage /></PrivateRoute>}
          />
          <Route
            path="/admin/items/:id/edit"
            element={<PrivateRoute><AdminItemEditPage /></PrivateRoute>}
          />
          <Route
            path="/admin/users"
            element={<RoleRoute roles={['admin']}><AdminUsersPage /></RoleRoute>}
          />
          <Route
            path="/admin/announcements"
            element={<RoleRoute roles={['admin']}><AnnouncementsAdminPage /></RoleRoute>}
          />
          <Route
            path="/admin/bonus-value-labels"
            element={<RoleRoute roles={['editor', 'admin']}><BonusValueLabelsAdminPage /></RoleRoute>}
          />
          <Route
            path="/admin/promo-tweets"
            element={<RoleRoute roles={['admin']}><PromoTweetsPage /></RoleRoute>}
          />
        </Routes>
        </Suspense>
      </main>
      <Footer />
      <SideBanners />
      <HelpButton />
      <TourOverlay />
    </div>
  )
}
