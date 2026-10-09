import { get, post, put } from './http'

export interface AdminUser {
  id: number
  email: string
  nickname: string
  role: string
  createdAt: string
  _count: { userWords: number }
}

export interface AdminArticle {
  id: number
  title: string
  level: number
  wordCount: number
  published: boolean
  createdAt: string
}

export const adminApi = {
  users: (page = 1) => get<{ total: number; list: AdminUser[] }>('/admin/users', { page }),
  setRole: (id: number, role: 'USER' | 'ADMIN') => put(`/admin/users/${id}/role`, { role }),
  articles: () => get<AdminArticle[]>('/admin/articles'),
  createArticle: (data: Record<string, unknown>) => post('/admin/articles', data),
  updateArticle: (id: number, data: Record<string, unknown>) => put(`/admin/articles/${id}`, data),
  importWordbook: (form: FormData) =>
    post('/admin/wordbooks/import', form, ) as unknown as Promise<{
      wordbookId: number
      total: number
      inserted: number
      wordCount: number
    }>,
}
