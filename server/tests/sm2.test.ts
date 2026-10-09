import { describe, it, expect } from 'vitest'
import { sm2, GRADING } from '../src/services/sm2.js'

/** 构造一个 UserWord 的 SM-2 状态 */
function state(overrides: Partial<Parameters<typeof sm2>[0]> = {}) {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    status: 'NEW' as const,
    ...overrides,
  }
}

describe('sm2 间隔重复算法', () => {
  it('新词首次记忆（评分=认识）→ 1 天后复习', () => {
    const r = sm2(state(), GRADING.GOOD)
    expect(r.repetitions).toBe(1)
    expect(r.intervalDays).toBe(1)
    expect(r.status).toBe('LEARNING')
    expect(r.dueInDays).toBe(1)
  })

  it('第二次复习（评分=认识）→ 6 天间隔', () => {
    const r = sm2(state({ repetitions: 1, intervalDays: 1, easeFactor: 2.5, status: 'LEARNING' }), GRADING.GOOD)
    expect(r.repetitions).toBe(2)
    expect(r.intervalDays).toBe(6)
  })

  it('第三次复习 → 间隔 = 上次间隔 × EF（6×2.5=15）', () => {
    const r = sm2(state({ repetitions: 2, intervalDays: 6, easeFactor: 2.5, status: 'REVIEW' }), GRADING.GOOD)
    expect(r.repetitions).toBe(3)
    expect(r.intervalDays).toBe(15)
  })

  it('评分=模糊（quality=3）间隔增长更慢且 EF 略降', () => {
    const r = sm2(state({ repetitions: 2, intervalDays: 6, easeFactor: 2.5, status: 'REVIEW' }), GRADING.FUZZY)
    expect(r.repetitions).toBe(3)
    expect(r.easeFactor).toBeLessThan(2.5)
    // EF≈2.36，6×2.36≈14.17 → 14
    expect(r.intervalDays).toBe(14)
  })

  it('评分=不认识 → 重置 repetitions，明天重学', () => {
    const r = sm2(state({ repetitions: 3, intervalDays: 15, easeFactor: 2.2, status: 'REVIEW' }), GRADING.FORGET)
    expect(r.repetitions).toBe(0)
    expect(r.intervalDays).toBe(1)
    expect(r.dueInDays).toBe(1)
    expect(r.status).toBe('LEARNING')
    expect(r.easeFactor).toBeLessThan(2.2) // EF 惩罚下降
  })

  it('连续高质量复习 → EF 保持在上限 2.5', () => {
    let s = state()
    for (let i = 0; i < 5; i++) {
      s = { ...s, ...sm2(s, GRADING.EASY), dueInDays: 0 }
    }
    expect(s.easeFactor).toBe(2.5)
  })

  it('EF 永不低于 1.3（钳制）', () => {
    let s = state()
    for (let i = 0; i < 20; i++) {
      s = { ...s, ...sm2(s, GRADING.FORGET), dueInDays: 0 }
    }
    expect(s.easeFactor).toBeGreaterThanOrEqual(1.3)
    expect(s.easeFactor).toBeLessThanOrEqual(2.5)
  })

  it('复习次数达到阈值且间隔较长 → MASTERED', () => {
    const r = sm2(state({ repetitions: 5, intervalDays: 30, easeFactor: 2.5, status: 'REVIEW' }), GRADING.EASY)
    expect(r.status).toBe('MASTERED')
  })

  it('间隔随复习轮次单调递增（ GOOD 链）', () => {
    let s = state()
    const intervals: number[] = []
    for (let i = 0; i < 6; i++) {
      s = { ...s, ...sm2(s, GRADING.GOOD), dueInDays: 0 }
      intervals.push(s.intervalDays)
    }
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1])
    }
  })
})
