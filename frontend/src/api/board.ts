import client from './client'
import type { BoardThread, BoardThreadSummary, BoardPost, BoardThreadStatus, Paginated } from '../types'

export const boardApi = {
  listThreads: (page = 1): Promise<{ data: Paginated<BoardThreadSummary> }> =>
    client.get<Paginated<BoardThreadSummary>>('/board/threads', { params: { page } }),

  getThread: (id: number): Promise<{ data: BoardThread }> =>
    client.get<BoardThread>(`/board/threads/${id}`),

  createThread: (title: string, message: string): Promise<{ data: BoardThreadSummary }> =>
    client.post<BoardThreadSummary>('/board/threads', { title, message }),

  postMessage: (threadId: number, message: string): Promise<{ data: BoardPost }> =>
    client.post<BoardPost>(`/board/threads/${threadId}/posts`, { message }),

  // 管理者のみ
  updateStatus: (threadId: number, status: BoardThreadStatus): Promise<{ data: { id: number; status: BoardThreadStatus } }> =>
    client.patch(`/board/threads/${threadId}/status`, { status }),

  deleteThread: (threadId: number): Promise<void> =>
    client.delete(`/board/threads/${threadId}`).then(() => undefined),

  deletePost: (postId: number): Promise<void> =>
    client.delete(`/board/posts/${postId}`).then(() => undefined),
}
