import { get, post } from './http'

export type QuizType = 'en2cn' | 'cn2en' | 'listening' | 'cloze'

export interface QuizQuestion {
  type: QuizType
  wordId: number
  headword: string
  prompt: string
  audioText?: string
  fullSentence?: string
  options: string[]
  answer: string
}

export interface QuizSubmitAnswer {
  wordId: number
  quizType: QuizType
  answer: string
  correctAnswer: string
}

export interface QuizResult {
  correct: number
  total: number
  results: { wordId: number; isCorrect: boolean; headword: string }[]
}

export interface WrongAttempt {
  id: number
  quizType: string
  createdAt: string
  word: { id: number; headword: string; phoneticUs: string | null; definitions: Definition[] }
}

interface Definition {
  pos: string
  cn: string
}

export const quizApi = {
  generate: (type: QuizType | 'mixed', count = 10) =>
    get<QuizQuestion[]>('/quiz/generate', { type, count }),
  submit: (answers: QuizSubmitAnswer[]) => post<QuizResult>('/quiz/submit', { answers }),
  wrong: (limit = 20) => get<WrongAttempt[]>('/quiz/wrong', { limit }),
}
