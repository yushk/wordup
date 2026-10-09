import { get, post } from './http'

export interface DailyStatItem {
  date: string
  newWords: number
  reviewedWords: number
  quizCorrect: number
  quizTotal: number
  minutes: number
}

export interface StatsOverview {
  learned: number
  mastered: number
  totalWords: number
  streak: number
  activeDays: number
}

export type LeaderboardType = 'today' | 'streak' | 'total' | 'wpm'

export interface LeaderboardRow {
  rank: number
  nickname: string
  value: number
}

export const statsApi = {
  daily: (days = 30) => get<DailyStatItem[]>('/stats/daily', { days }),
  overview: () => get<StatsOverview>('/stats/overview'),
  /** 上报一次学习会话时长（分钟，累加进当日 DailyStat）；带打字统计时更新最佳 WPM */
  session: (data: { minutes: number; wpm?: number; totalKeys?: number; correctKeys?: number }) =>
    post<null>('/stats/session', data),
  /** 挑战榜单（公开） */
  leaderboard: (type: LeaderboardType) => get<LeaderboardRow[]>('/stats/leaderboard', { type }),
}
