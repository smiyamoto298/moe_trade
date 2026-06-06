import { useEffect, useState } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { usersApi } from '../../api/users'
import { useAuth } from '../../contexts/AuthContext'
import type { User, UserRole } from '../../types'
import { SERVER_COLORS } from '../../utils/constants'

const ROLE_LABEL: Record<UserRole, string> = {
  user:   '一般ユーザー',
  editor: '編集者',
  admin:  '管理者',
}

const ROLE_STYLE: Record<UserRole, string> = {
  user:   'bg-surface text-gray-300',
  editor: 'bg-blue-900/40 text-blue-300 border border-blue-700/40',
  admin:  'bg-purple-900/40 text-purple-300 border border-purple-700/40',
}

type Filter = 'all' | 'suspended' | 'duplicate_ip' | 'editor' | 'admin'

// 同一IPを持つuser_idのセットを返す
function getDuplicateIpUserIds(users: User[]): Set<number> {
  const ipMap = new Map<string, number[]>()
  for (const u of users) {
    if (!u.register_ip) continue
    const ids = ipMap.get(u.register_ip) ?? []
    ids.push(u.id)
    ipMap.set(u.register_ip, ids)
  }
  const result = new Set<number>()
  for (const ids of ipMap.values()) {
    if (ids.length > 1) ids.forEach((id) => result.add(id))
  }
  return result
}

export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchUsers = () => {
    setLoading(true)
    usersApi.list().then((r) => setUsers(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { fetchUsers() }, [])

  // 同一IP検出
  const duplicateIpIds = getDuplicateIpUserIds(users)

  // 同一IPのグループ（IP → ユーザーリスト）
  const ipGroups = users.reduce<Map<string, User[]>>((acc, u) => {
    if (!u.register_ip) return acc
    const group = acc.get(u.register_ip) ?? []
    group.push(u)
    acc.set(u.register_ip, group)
    return acc
  }, new Map())

  const [actioningId, setActioningId] = useState<number | null>(null)
  const { run: runGroup, loading: groupLoading } = useAsync()

  const handleRoleChange = async (id: number, role: UserRole) => {
    if (id === me?.id) { alert('自分自身の権限は変更できません'); return }
    if (actioningId) return
    setActioningId(id)
    try {
      const res = await usersApi.updateRole(id, role)
      setUsers((prev) => prev.map((u) => u.id === id ? res.data : u))
    } finally {
      setActioningId(null)
    }
  }

  const handleToggleSuspend = async (user: User) => {
    if (user.id === me?.id) { alert('自分自身は停止できません'); return }
    if (actioningId) return
    const action = user.is_suspended ? '利用停止を解除' : '利用停止に'
    if (!confirm(`「${user.email}」を${action}しますか？`)) return
    setActioningId(user.id)
    try {
      const res = user.is_suspended
        ? await usersApi.unsuspend(user.id)
        : await usersApi.suspend(user.id)
      setUsers((prev) => prev.map((u) => u.id === user.id ? res.data : u))
    } finally {
      setActioningId(null)
    }
  }

  // IPグループ全員を一括解除
  const handleUnsuspendGroup = (ip: string) => runGroup(async () => {
    const group = ipGroups.get(ip) ?? []
    if (!confirm(`IPアドレス ${ip} に紐づく ${group.length} 件のアカウント停止を解除しますか？`)) return
    for (const u of group.filter((u) => u.is_suspended && u.id !== me?.id)) {
      const res = await usersApi.unsuspend(u.id)
      setUsers((prev) => prev.map((x) => x.id === u.id ? res.data : x))
    }
  })

  const counts = {
    suspended:    users.filter((u) => u.is_suspended).length,
    duplicate_ip: duplicateIpIds.size,
    editor:       users.filter((u) => u.role === 'editor').length,
    admin:        users.filter((u) => u.role === 'admin').length,
  }

  const filtered = users.filter((u) => {
    const matchSearch = !search ||
      u.email.includes(search) ||
      (u.register_ip ?? '').includes(search) ||
      u.characters.some((c) => c.character_name.includes(search))
    const matchFilter =
      filter === 'all'          ? true :
      filter === 'suspended'    ? u.is_suspended :
      filter === 'duplicate_ip' ? duplicateIpIds.has(u.id) :
      filter === 'editor'       ? u.role === 'editor' :
      filter === 'admin'        ? u.role === 'admin' : true
    return matchSearch && matchFilter
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <h1 className="text-xl font-bold text-white">ユーザー管理</h1>

      {/* 同一IP警告バナー */}
      {counts.duplicate_ip > 0 && (
        <div className="bg-orange-900/30 border border-orange-600/50 rounded-lg px-4 py-3 text-sm text-orange-300">
          <p className="font-semibold mb-1">⚠ 同一IPからの複数アカウントが検出されています</p>
          <div className="space-y-1 mt-2">
            {[...ipGroups.entries()]
              .filter(([, group]) => group.length > 1)
              .map(([ip, group]) => (
                <div key={ip} className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-orange-400">{ip}</span>
                  <span className="text-orange-300/80">
                    {group.map((u) => u.email).join('、')}
                  </span>
                  {group.some((u) => u.is_suspended) && (
                    <button
                      onClick={() => handleUnsuspendGroup(ip)}
                      disabled={groupLoading}
                      className="ml-auto text-xs bg-orange-900/40 hover:bg-orange-900/70 disabled:opacity-50 border border-orange-600/50 text-orange-300 px-2 py-0.5 rounded transition-colors"
                    >
                      {groupLoading ? '処理中...' : 'グループ全員を解除'}
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* フィルター・検索 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md overflow-hidden border border-surface-border">
          {([
            ['all',          `すべて (${users.length})`],
            ['suspended',    `停止中 (${counts.suspended})`],
            ['duplicate_ip', `同一IP (${counts.duplicate_ip})`],
            ['editor',       `編集者 (${counts.editor})`],
            ['admin',        `管理者 (${counts.admin})`],
          ] as [Filter, string][]).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                filter === f ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="メール / キャラクター名 / IPアドレス"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-72"
        />
      </div>

      {/* テーブル */}
      <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">メールアドレス / IP</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">キャラクター</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">状態</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">権限</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500">読み込み中...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500">ユーザーが見つかりません</td></tr>
            ) : (
              filtered.map((user) => {
                const isMe = user.id === me?.id
                const isDuplicateIp = duplicateIpIds.has(user.id)
                return (
                  <tr
                    key={user.id}
                    className={`transition-colors ${
                      user.is_suspended ? 'opacity-60' : 'hover:bg-surface-border/20'
                    } ${isDuplicateIp ? 'bg-orange-900/5' : ''}`}
                  >
                    {/* メール・IP */}
                    <td className="px-4 py-3">
                      <p className="text-white">{user.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {user.register_ip && (
                          <span className={`text-xs font-mono ${isDuplicateIp ? 'text-orange-400' : 'text-gray-500'}`}>
                            {isDuplicateIp && '⚠ '}{user.register_ip}
                          </span>
                        )}
                        {isMe && <span className="text-xs text-primary-500">（自分）</span>}
                        {!user.email_verified_at && (
                          <span className="text-xs text-yellow-400">未認証</span>
                        )}
                      </div>
                    </td>

                    {/* キャラクター */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.characters?.length === 0 ? (
                          <span className="text-xs text-gray-600">未登録</span>
                        ) : user.characters?.map((c) => (
                          <span key={c.id} className={`text-xs px-2 py-0.5 rounded ${SERVER_COLORS[c.server]}`}>
                            {c.server}: {c.character_name}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* 状態 */}
                    <td className="px-4 py-3">
                      {user.is_suspended ? (
                        <div>
                          <span className="text-xs bg-red-900/40 border border-red-700/40 text-red-300 px-2 py-0.5 rounded">停止中</span>
                          {isDuplicateIp && (
                            <p className="text-xs text-orange-400 mt-0.5">同一IP検出による自動停止</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-400">● 有効</span>
                      )}
                    </td>

                    {/* 権限 */}
                    <td className="px-4 py-3">
                      {isMe ? (
                        <span className={`text-xs px-2 py-1 rounded ${ROLE_STYLE[user.role]}`}>
                          {ROLE_LABEL[user.role]}
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                          className={`text-xs px-2 py-1 rounded border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500 ${ROLE_STYLE[user.role]} bg-transparent`}
                        >
                          <option value="user"   className="bg-surface-card text-gray-200">一般ユーザー</option>
                          <option value="editor" className="bg-surface-card text-gray-200">編集者</option>
                          <option value="admin"  className="bg-surface-card text-gray-200">管理者</option>
                        </select>
                      )}
                    </td>

                    {/* 操作 */}
                    <td className="px-4 py-3 text-right">
                      {!isMe && (
                        <button
                          onClick={() => handleToggleSuspend(user)}
                          disabled={actioningId === user.id}
                          className={`text-xs px-3 py-1 rounded border transition-colors disabled:opacity-50 ${
                            user.is_suspended
                              ? 'border-emerald-700/50 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40'
                              : 'border-red-700/50 bg-red-900/20 text-red-300 hover:bg-red-900/40'
                          }`}
                        >
                          {actioningId === user.id ? '処理中...' : user.is_suspended ? '停止を解除' : '利用停止'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
