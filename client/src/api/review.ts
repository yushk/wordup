import { get, post } from './http'

export interface Definition {
  pos: string
  cn: string
  en?: string
}

export interface StudyCard {
  wordId: number
  userWordId: number | null
  headword: string
  phoneticUs: string | null
  phoneticUk: string | null
  definitions: Definition[]
  exampleSentence: string | null
  exampleTranslation: string | null
  isNew: boolean
}

export interface ReviewOverview {
  joined: boolean
  newDue: number
  reviewDue: number
  /** 当前进度章（1 起） */
  currentChapter: number
}

export interface ChapterInfo {
  chapter: number
  totalWords: number
  learnedWords: number
}

export interface ChaptersResponse {
  joined: boolean
  wordbook?: { id: number; name: string; wordCount: number }
  chapters: ChapterInfo[]
  current: number
}

export type Grade = 'forget' | 'fuzzy' | 'good' | 'easy'

export const reviewApi = {
  overview: () => get<ReviewOverview>('/review/overview'),
  queue: (mode: 'new' | 'review', limit = 20, chapter?: number, wordbookId?: number) =>
    get<StudyCard[]>('/review/queue', {
      mode,
      limit,
      ...(chapter ? { chapter } : {}),
      ...(wordbookId ? { wordbookId } : {}),
    }),
  chapters: (wordbookId?: number) =>
    get<ChaptersResponse>('/review/chapters', wordbookId ? { wordbookId } : undefined),
  /** 游客免登录体验：公开取某章词卡（缺省四级第 1 章，无进度数据） */
  demo: (chapter?: number, wordbookId?: number) =>
    get<StudyCard[]>('/review/demo', {
      ...(chapter ? { chapter } : {}),
      ...(wordbookId ? { wordbookId } : {}),
    }),
  grade: (data: { wordId: number; grade: Grade }) =>
    post<{ status: string; intervalDays: number; dueDate: string }>('/review/grade', data),
}
