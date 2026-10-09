import { get, post, put, del } from './http'

export interface Wordbook {
  id: number
  name: string
  nameEn: string
  level: string
  wordCount: number
  sortOrder: number
}

export interface MyWordbook {
  id: number
  isPrimary: boolean
  dailyNewNum: number
  wordbook: Wordbook
  learned: number
  mastered: number
}

export const wordbookApi = {
  list: () => get<Wordbook[]>('/wordbooks'),
  mine: () => get<MyWordbook[]>('/wordbooks/mine'),
  join: (data: { wordbookId: number; dailyNewNum: number }) =>
    post<{ id: number }>('/wordbooks/join', data),
  setPrimary: (wordbookId: number) => put('/wordbooks/primary', { wordbookId }),
  leave: (wordbookId: number) => del(`/wordbooks/${wordbookId}/leave`),
}
