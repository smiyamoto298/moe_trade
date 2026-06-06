import { Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import ListingsPage from './pages/ListingsPage'
import ListingDetailPage from './pages/ListingDetailPage'
import NewListingPage from './pages/NewListingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import MyPage from './pages/MyPage'
import BoardPage from './pages/BoardPage'
import BoardThreadPage from './pages/BoardThreadPage'
import AdminItemsPage from './pages/admin/AdminItemsPage'
import AdminItemEditPage from './pages/admin/AdminItemEditPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import { useAuth } from './contexts/AuthContext'
import type { UserRole } from './types'

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
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/listings" replace />} />
          <Route path="/listings" element={<ListingsPage key="equipment" mode="equipment" />} />
          <Route path="/skills" element={<ListingsPage key="skill" mode="skill" />} />
          <Route path="/listings/:id" element={<ListingDetailPage />} />
          <Route
            path="/listings/new"
            element={<PrivateRoute><NewListingPage /></PrivateRoute>}
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
          {/* 管理画面 */}
          <Route
            path="/admin/items"
            element={<RoleRoute roles={['admin', 'editor']}><AdminItemsPage /></RoleRoute>}
          />
          <Route
            path="/admin/items/new"
            element={<RoleRoute roles={['admin', 'editor']}><AdminItemEditPage /></RoleRoute>}
          />
          <Route
            path="/admin/items/:id/edit"
            element={<RoleRoute roles={['admin', 'editor']}><AdminItemEditPage /></RoleRoute>}
          />
          <Route
            path="/admin/users"
            element={<RoleRoute roles={['admin']}><AdminUsersPage /></RoleRoute>}
          />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
