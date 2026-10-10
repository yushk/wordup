import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { ok, validate } from '../lib/respond.js'
import { requireAuth, getCurrentUser } from '../middleware/auth.js'
import { addDailyStat } from '../services/stats.js'

const router = Router()

/** GET /api/stats/leaderboard?type=today|streak|total|wpm —— 挑战榜单（公开，前 10 名，不含管理员） */
router.get(
  '/leaderboard',
  validate({ query: z.object({ type: z.enum(['today', 'streak', 'total', 'wpm']).default('today') }) }),
  async (req, res, next) => {
    try {
      const type = (req.query as unknown as { type: 'today' | 'streak' | 'total' | 'wpm' }).type
      let rows: { nickname: string; value: number }[] = []

      if (type === 'today') {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const stats = await prisma.dailyStat.findMany({
          where: { date: { gte: start }, user: { role: 'USER' } },
          include: { user: { select: { nickname: true } } },
          take: 200,
        })
        rows = stats
          .map((s) => ({ nickname: s.user.nickname, value: s.newWords + s.reviewedWords }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 10)
      } else if (type === 'total') {
        const grouped = await prisma.userWord.groupBy({
          by: ['userId'],
          where: { repetitions: { gt: 0 }, user: { role: 'USER' } },
          _count: { _all: true },
        })
        const userIds = grouped.map((g) => g.userId)
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nickname: true },
        })
        const nameById = new Map(users.map((u) => [u.id, u.nickname]))
        rows = grouped
          .map((g) => ({ nickname: nameById.get(g.userId) ?? '?', value: g._count._all }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10)
      } else if (type === 'wpm') {
        const stats = await prisma.typingStat.findMany({
          where: { bestWpm: { gt: 0 }, user: { role: 'USER' } },
          include: { user: { select: { nickname: true } } },
          orderBy: { bestWpm: 'desc' },
          take: 10,
        })
        rows = stats.map((s) => ({ nickname: s.user.nickname, value: s.bestWpm }))
      } else {
        // streak：所有普通用户的连续打卡天数
        const stats = await prisma.dailyStat.findMany({
          where: {
            OR: [{ newWords: { gt: 0 } }, { reviewedWords: { gt: 0 } }, { quizTotal: { gt: 0 } }],
            user: { role: 'USER' },
          },
          select: { userId: true, date: true },
        })
        const byUser = new Map<number, Set<string>>()
        for (const s of stats) {
          if (!byUser.has(s.userId)) byUser.set(s.userId, new Set())
          byUser.get(s.userId)!.add(s.date.toISOString().slice(0, 10))
        }
        const users = await prisma.user.findMany({
          where: { id: { in: [...byUser.keys()] } },
          select: { id: true, nickname: true },
        })
        const nameById = new Map(users.map((u) => [u.id, u.nickname]))
        const todayStr = new Date().toISOString().slice(0, 10)
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toISOString().slice(0, 10)
        rows = [...byUser.entries()]
          .map(([userId, days]) => {
            // 从今天（或昨天）往前数连续天数；今天没学不打断连续
            let streak = 0
            const startStr = days.has(todayStr) ? todayStr : yesterdayStr
            const cur = new Date(startStr + 'T00:00:00Z')
            while (days.has(cur.toISOString().slice(0, 10))) {
              streak++
              cur.setDate(cur.getDate() - 1)
            }
            return { nickname: nameById.get(userId) ?? '?', value: streak }
          })
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 10)
      }

      return ok(res, rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, value: r.value })))
    } catch (err) {
      next(err)
    }
  },
)

router.use(requireAuth)

/** GET /api/stats/daily?days=30 —— 近 N 天每日统计（缺的天补零） */
router.get(
  '/daily',
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }),
  async (req, res, next) => {
    try {
      const user = await getCurrentUser(req)
      const days = (req.query as unknown as { days: number }).days
      const from = new Date()
      from.setHours(0, 0, 0, 0)
      from.setDate(from.getDate() - (days - 1))

      const stats = await prisma.dailyStat.findMany({
        where: { userId: user.id, date: { gte: from } },
        orderBy: { date: 'asc' },
      })
      const byDate = new Map(stats.map((s) => [s.date.toISOString().slice(0, 10), s]))

      const series = Array.from({ length: days }, (_, i) => {
        const d = new Date(from)
        d.setDate(d.getDate() + i)
        const key = d.toISOString().slice(0, 10)
        const s = byDate.get(key)
        return {
          date: key,
          newWords: s?.newWords ?? 0,
          reviewedWords: s?.reviewedWords ?? 0,
          quizCorrect: s?.quizCorrect ?? 0,
          quizTotal: s?.quizTotal ?? 0,
          minutes: s?.minutes ?? 0,
        }
      })
      return ok(res, series)
    } catch (err) {
      next(err)
    }
  },
)

/** GET /api/stats/overview —— 总览：总词数/已学/掌握、连续打卡天数 */
router.get('/overview', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    const links = await prisma.userWordBook.findMany({ where: { userId: user.id } })
    const bookIds = links.map((l) => l.wordbookId)

    const [learned, mastered, totalWords, stats] = await Promise.all([
      prisma.userWord.count({
        where: { userId: user.id, word: { wordbookId: { in: bookIds } }, repetitions: { gt: 0 } },
      }),
      prisma.userWord.count({
        where: { userId: user.id, word: { wordbookId: { in: bookIds } }, status: 'MASTERED' },
      }),
      prisma.word.count({ where: { wordbookId: { in: bookIds } } }),
      prisma.dailyStat.findMany({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        take: 400,
      }),
    ])

    // 连续打卡：从今天（或昨天）往前数有学习记录（new+review+quiz>0）的天数
    let streak = 0
    const active = new Set(
      stats
        .filter((s) => s.newWords + s.reviewedWords + s.quizTotal > 0)
        .map((s) => s.date.toISOString().slice(0, 10)),
    )
    const cursor = new Date()
    cursor.setHours(0, 0, 0, 0)
    // 今天没学不打断连续（从昨天起算）
    if (!active.has(cursor.toISOString().slice(0, 10))) {
      cursor.setDate(cursor.getDate() - 1)
    }
    while (active.has(cursor.toISOString().slice(0, 10))) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }

    return ok(res, { learned, mastered, totalWords, streak, activeDays: active.size })
  } catch (err) {
    next(err)
  }
})

/** POST /api/stats/session —— 上报一次学习会话（时长分钟 + 可选打字统计，可多次累加） */
router.post(
  '/session',
  validate({
    body: z.object({
      minutes: z.number().int().min(0).max(600),
      wpm: z.number().int().min(0).max(400).optional(),
      totalKeys: z.number().int().min(0).optional(),
      correctKeys: z.number().int().min(0).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const user = await getCurrentUser(req)
      const { minutes, wpm, totalKeys, correctKeys } = req.body as {
        minutes: number
        wpm?: number
        totalKeys?: number
        correctKeys?: number
      }
      if (minutes > 0) {
        await addDailyStat(user.id, { minutes })
      }
      if (wpm !== undefined && totalKeys !== undefined && correctKeys !== undefined) {
        // upsert 打字统计：键数累加；bestWpm = max(旧, 新)（Prisma 无原子 max，读后写）
        const existing = await prisma.typingStat.findUnique({ where: { userId: user.id } })
        if (!existing) {
          await prisma.typingStat.create({
            data: { userId: user.id, bestWpm: wpm, totalKeys, correctKeys },
          })
        } else {
          await prisma.typingStat.update({
            where: { userId: user.id },
            data: {
              bestWpm: Math.max(existing.bestWpm, wpm),
              totalKeys: { increment: totalKeys },
              correctKeys: { increment: correctKeys },
            },
          })
        }
      }
      return ok(res, null)
    } catch (err) {
      next(err)
    }
  },
)


export default router
