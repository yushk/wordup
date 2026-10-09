/**
 * SM-2 间隔重复算法（SuperMemo-2 改良版，Anki 同源）
 *
 * 三键评分映射 quality：
 *   不认识 FORGET → 1
 *   模糊   FUZZY   → 3
 *   认识   GOOD    → 4
 *   秒懂   EASY    → 5
 */

export const GRADING = {
  FORGET: 1,
  FUZZY: 3,
  GOOD: 4,
  EASY: 5,
} as const

export type Grading = (typeof GRADING)[keyof typeof GRADING]

export interface Sm2State {
  easeFactor: number
  intervalDays: number
  repetitions: number
  status: 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED'
}

export interface Sm2Result extends Sm2State {
  /** 距今天数后到期（用于调用方计算 dueDate） */
  dueInDays: number
}

const MIN_EF = 1.3
const MAX_EF = 2.5
/** 复习轮次达到该值且间隔 ≥ 21 天视为掌握 */
const MASTER_REPS = 6
const MASTER_INTERVAL = 21

/**
 * 计算一次复习后的新调度状态。纯函数，无副作用。
 */
export function sm2(state: Sm2State, quality: Grading): Sm2Result {
  let { easeFactor, intervalDays, repetitions } = state

  // EF 调整公式（SM-2 原版）
  easeFactor =
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  easeFactor = Math.max(MIN_EF, Math.min(MAX_EF, easeFactor))

  if (quality < 3) {
    // 遗忘：重置，明天再来
    repetitions = 0
    intervalDays = 1
  } else {
    repetitions += 1
    if (repetitions === 1) {
      intervalDays = 1
    } else if (repetitions === 2) {
      intervalDays = 6
    } else {
      intervalDays = Math.round(intervalDays * easeFactor)
    }
    // 间隔至少为 1 天
    intervalDays = Math.max(1, intervalDays)
  }

  const status: Sm2State['status'] =
    repetitions >= MASTER_REPS && intervalDays >= MASTER_INTERVAL
      ? 'MASTERED'
      : repetitions >= 2
        ? 'REVIEW'
        : 'LEARNING'

  return { easeFactor, intervalDays, repetitions, status, dueInDays: intervalDays }
}
