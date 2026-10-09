import { get, post } from './http'

export interface ArticleBrief {
  id: number
  title: string
  titleEn: string
  level: number
  wordCount: number
  coverColor: string
  createdAt: string
}

export interface ArticleDetail extends ArticleBrief {
  contentMd: string
  translation: string
  savedWords: { word: string; context?: string }[]
}

export interface SavedWordItem {
  word: string
  context?: string
  articleId: number
  articleTitle: string
}

export const articleApi = {
  list: (params: { level?: number; page?: number; pageSize?: number }) =>
    get<{ total: number; list: ArticleBrief[] }>('/articles', params),
  detail: (id: number) => get<ArticleDetail>(`/articles/${id}`),
  saveWord: (articleId: number, data: { word: string; context?: string; remove?: boolean }) =>
    post<{ word: string }[]>(`/articles/${articleId}/words`, data),
  myWords: () => get<SavedWordItem[]>('/articles/mine/words'),
}
