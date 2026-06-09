import client from './client'
import type { BoardThread, BoardThreadSummary, BoardPost, BoardThreadStatus, Paginated } from '../types'

// multipart/form-data 用のヘッダー（axios が boundary を自動付与する）
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

export const boardApi = {
  listThreads: (page = 1): Promise<{ data: Paginated<BoardThreadSummary> }> =>
    client.get<Paginated<BoardThreadSummary>>('/board/threads', { params: { page } }),

  getThread: (id: number): Promise<{ data: BoardThread }> =>
    client.get<BoardThread>(`/board/threads/${id}`),

  createThread: (title: string, message: string, image?: File | null, adminOnly = false): Promise<{ data: BoardThreadSummary }> => {
    const fd = new FormData()
    fd.append('title', title)
    fd.append('message', message)
    if (image) fd.append('image', image)
    if (adminOnly) fd.append('admin_only', '1')
    return client.post<BoardThreadSummary>('/board/threads', fd, MULTIPART)
  },

  postMessage: (threadId: number, message: string, image?: File | null): Promise<{ data: BoardPost }> => {
    const fd = new FormData()
    if (message) fd.append('message', message)
    if (image) fd.append('image', image)
    return client.post<BoardPost>(`/board/threads/${threadId}/posts`, fd, MULTIPART)
  },

  // 自分の投稿のみ編集可能。multipart の PUT は PHP が解釈できないため POST + method spoofing で送る。
  updatePost: (
    postId: number,
    message: string,
    opts?: { image?: File | null; removeImage?: boolean },
  ): Promise<{ data: BoardPost }> => {
    const fd = new FormData()
    fd.append('_method', 'PUT')
    fd.append('message', message)
    if (opts?.image) fd.append('image', opts.image)
    if (opts?.removeImage) fd.append('remove_image', '1')
    return client.post<BoardPost>(`/board/posts/${postId}`, fd, MULTIPART)
  },

  // 管理者のみ
  updateStatus: (threadId: number, status: BoardThreadStatus): Promise<{ data: { id: number; status: BoardThreadStatus } }> =>
    client.patch(`/board/threads/${threadId}/status`, { status }),

  // 管理者のみ：スレッドの公開範囲を変更（true=管理者限定 / false=全員に公開）
  updateVisibility: (threadId: number, adminOnly: boolean): Promise<{ data: { id: number; admin_only: boolean } }> =>
    client.patch(`/board/threads/${threadId}/visibility`, { admin_only: adminOnly }),

  deleteThread: (threadId: number): Promise<void> =>
    client.delete(`/board/threads/${threadId}`).then(() => undefined),

  deletePost: (postId: number): Promise<void> =>
    client.delete(`/board/posts/${postId}`).then(() => undefined),
}
