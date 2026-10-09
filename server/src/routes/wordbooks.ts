import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { ok, fail, ApiError, validate } from '../lib/respond.js'
import { requireAuth, getCurrentUser } from '../middleware/auth.js'

const router = Router()

/** GET /api/wordbooks —— 所有词书（公开） */
router.get('/', async (_req, res, next) => {
  try {
    const books = await prisma.wordBook.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, nameEn: true, level: true, wordCount: true, sortOrder: true },
    })
    return ok(res, books)
  } catch (err) {
    next(err)
  }
})

/** GET /api/wordbooks/mine —— 我加入的词书及进度 */
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    const mine = await prisma.userWordBook.findMany({
      where: { userId: user.id },
      include: {
        wordbook: { select: { id: true, name: true, nameEn: true, level: true, wordCount: true } },
      },
    })
    // 统计每本词书的学习进度
    const result = await Promise.all(
      mine.map(async (m) => {
        const [learned, mastered] = await Promise.all([
          prisma.userWord.count({
            where: { userId: user.id, word: { wordbookId: m.wordbookId }, repetitions: { gt: 0 } },
          }),
          prisma.userWord.count({
            where: { userId: user.id, word: { wordbookId: m.wordbookId }, status: 'MASTERED' },
          }),
        ])
        return {
          id: m.id,
          isPrimary: m.isPrimary,
          dailyNewNum: m.dailyNewNum,
          wordbook: m.wordbook,
          learned,
          mastered,
        }
      }),
    )
    return ok(res, result)
  } catch (err) {
    next(err)
  }
})

const joinSchema = z.object({
  wordbookId: z.number().int().positive(),
  dailyNewNum: z.number().int().min(5).max(100).default(10),
})

/** POST /api/wordbooks/join —— 选择词书（首本自动设为主词书） */
router.post('/join', requireAuth, validate({ body: joinSchema }), async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    const { wordbookId, dailyNewNum } = req.body
    const book = await prisma.wordBook.findUnique({ where: { id: wordbookId } })
    if (!book) return fail(res, '词书不存在', 404)
    const count = await prisma.userWordBook.count({ where: { userId: user.id } })
    const existing = await prisma.userWordBook.findUnique({
      where: { userId_wordbookId: { userId: user.id, wordbookId } },
    })
    if (existing) {
      const updated = await prisma.userWordBook.update({
        where: { id: existing.id },
        data: { dailyNewNum },
      })
      return ok(res, updated)
    }
    const created = await prisma.userWordBook.create({
      data: { userId: user.id, wordbookId, dailyNewNum, isPrimary: count === 0 },
    })
    return ok(res, created)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/wordbooks/primary —— 切换主词书 */
router.put(
  '/primary',
  requireAuth,
  validate({ body: z.object({ wordbookId: z.number().int().positive() }) }),
  async (req, res, next) => {
    try {
      const user = await getCurrentUser(req)
      const link = await prisma.userWordBook.findUnique({
        where: { userId_wordbookId: { userId: user.id, wordbookId: req.body.wordbookId } },
      })
      if (!link) return fail(res, '你未加入该词书')
      await prisma.$transaction([
        prisma.userWordBook.updateMany({ where: { userId: user.id }, data: { isPrimary: false } }),
        prisma.userWordBook.update({ where: { id: link.id }, data: { isPrimary: true } }),
      ])
      return ok(res, { wordbookId: req.body.wordbookId })
    } catch (err) {
      next(err)
    }
  },
)

/** DELETE /api/wordbooks/:id/leave —— 退出词书（保留 UserWord 记录） */
router.delete('/:id/leave', requireAuth, async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    const wordbookId = Number(req.params.id)
    if (!Number.isInteger(wordbookId)) throw new ApiError('参数错误')
    const link = await prisma.userWordBook.findUnique({
      where: { userId_wordbookId: { userId: user.id, wordbookId } },
    })
    if (!link) return fail(res, '你未加入该词书')
    await prisma.userWordBook.delete({ where: { id: link.id } })
    // 若退的是主词书，把剩余第一本设为主
    if (link.isPrimary) {
      const rest = await prisma.userWordBook.findFirst({ where: { userId: user.id } })
      if (rest) {
        await prisma.userWordBook.update({ where: { id: rest.id }, data: { isPrimary: true } })
      }
    }
    return ok(res)
  } catch (err) {
    next(err)
  }
})

export default router
