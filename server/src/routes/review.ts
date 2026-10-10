import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { ok, fail, ApiError, validate } from '../lib/respond.js'
import { requireAuth, getCurrentUser } from '../middleware/auth.js'
import { sm2, GRADING } from '../services/sm2.js'
import { addDailyStat } from '../services/stats.js'

const router = Router()

/** GET /api/review/demo?chapter=&wordbookId= —— 游客免登录体验（公开）
 *  返回指定章的词卡（缺省四级第 1 章），无用户进度数据 */
router.get(
  '/demo',
  validate({
    query: z.object({
      chapter: z.coerce.number().int().min(1).optional(),
      wordbookId: z.coerce.number().int().positive().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { chapter, wordbookId } = req.query as unknown as { chapter?: number; wordbookId?: number }
      let bookId = wordbookId
      if (!bookId) {
        const cet4 = await prisma.wordBook.findUnique({ where: { level: 'cet4' } })
        bookId = cet4?.id ?? (await prisma.wordBook.findFirst({ orderBy: { sortOrder: 'asc' } }))?.id
      }
      if (!bookId) throw new ApiError('暂无词书数据', 404)
      const ch = chapter ?? 1
      const rankStart = (ch - 1) * CHAPTER_SIZE
      const words = await prisma.word.findMany({
        where: { wordbookId: bookId, rank: { gte: rankStart, lt: rankStart + CHAPTER_SIZE } },
        orderBy: { rank: 'asc' },
        take: CHAPTER_SIZE,
      })
      return ok(
        res,
        words.map((w) => ({
          wordId: w.id,
          userWordId: null,
          headword: w.headword,
          phoneticUs: w.phoneticUs,
          phoneticUk: w.phoneticUk,
          definitions: w.definitions,
          exampleSentence: w.exampleSentence,
          exampleTranslation: w.exampleTranslation,
          isNew: true,
        })),
      )
    } catch (err) {
      next(err)
    }
  },
)

router.use(requireAuth)

/** 今天零点（本地时区） */
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86400_000)
}

/** 到今天的零点比较，interval 天后的"当天"到期 */
function dueDateFrom(days: number): Date {
  return addDays(startOfToday(), days)
}

/** 每章词数（与前端约定一致） */
const CHAPTER_SIZE = 20

/** 用户的已加入词书列表，主词书在前 */
async function myWordbooks(userId: number) {
  return prisma.userWordBook.findMany({
    where: { userId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    include: { wordbook: { select: { id: true, name: true, wordCount: true } } },
  })
}

/**
 * 主词书内第一个未学完的章号（1 起）。
 * 未学完 = 该 rank 区间内还有 repetitions=0 的词。
 */
async function currentChapter(userId: number, wordbookId: number): Promise<number> {
  const learned = await prisma.userWord.findMany({
    where: { userId, word: { wordbookId }, repetitions: { gt: 0 } },
    select: { word: { select: { rank: true } } },
  })
  const total = await prisma.word.count({ where: { wordbookId } })
  if (learned.length === 0 || total === 0) return 1
  // 按章聚合已学数，找第一个不满的章
  const learnedByChapter = new Map<number, number>()
  for (const lw of learned) {
    const ch = Math.floor(lw.word.rank / CHAPTER_SIZE) + 1
    learnedByChapter.set(ch, (learnedByChapter.get(ch) ?? 0) + 1)
  }
  const maxChapter = Math.max(1, Math.ceil(total / CHAPTER_SIZE))
  for (let ch = 1; ch <= maxChapter; ch++) {
    if ((learnedByChapter.get(ch) ?? 0) < CHAPTER_SIZE) return ch
  }
  return maxChapter
}

/** GET /api/review/chapters?wordbookId= —— 词书章节列表（章号、词数、已学数、当前进度章）
 *  不传 wordbookId 时用主词书 */
router.get(
  '/chapters',
  validate({ query: z.object({ wordbookId: z.coerce.number().int().positive().optional() }) }),
  async (req, res, next) => {
    try {
      const user = await getCurrentUser(req)
      const wordbookIdParam = (req.query as unknown as { wordbookId?: number }).wordbookId
      const links = await myWordbooks(user.id)
      let wordbook: { id: number; name: string; wordCount: number }
      let wordbookId: number
      if (wordbookIdParam) {
        // 任意词书（可未加入，直接选了学）
        const book = await prisma.wordBook.findUnique({ where: { id: wordbookIdParam } })
        if (!book) throw new ApiError('词书不存在', 404)
        wordbook = { id: book.id, name: book.name, wordCount: book.wordCount }
        wordbookId = book.id
      } else {
        if (links.length === 0 || !links[0].isPrimary) {
          return ok(res, { joined: false, chapters: [], current: 1 })
        }
        wordbook = links[0].wordbook
        wordbookId = links[0].wordbookId
      }
      const [total, learned] = await Promise.all([
      prisma.word.count({ where: { wordbookId } }),
      prisma.userWord.findMany({
        where: { userId: user.id, word: { wordbookId }, repetitions: { gt: 0 } },
        select: { word: { select: { rank: true } } },
      }),
    ])
    const learnedByChapter = new Map<number, number>()
    for (const lw of learned) {
      const ch = Math.floor(lw.word.rank / CHAPTER_SIZE) + 1
      learnedByChapter.set(ch, (learnedByChapter.get(ch) ?? 0) + 1)
    }
    const maxChapter = Math.max(1, Math.ceil(total / CHAPTER_SIZE))
    const chapters = Array.from({ length: maxChapter }, (_, i) => {
      const ch = i + 1
      // 最后一章词数可能不足 CHAPTER_SIZE
      const wordsInChapter = ch === maxChapter ? total - (maxChapter - 1) * CHAPTER_SIZE : CHAPTER_SIZE
      return { chapter: ch, totalWords: wordsInChapter, learnedWords: learnedByChapter.get(ch) ?? 0 }
    })
    // 当前进度章：第一个未学完的
    let current = maxChapter
    for (const c of chapters) {
      if (c.learnedWords < c.totalWords) {
        current = c.chapter
        break
      }
    }
    return ok(res, { joined: true, wordbook, chapters, current })
  } catch (err) {
    next(err)
  }
})

/** GET /api/review/overview —— 今日任务概览（当前章新词数 + 到期复习数） */
router.get('/overview', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    const links = await myWordbooks(user.id)
    if (links.length === 0 || !links[0].isPrimary) {
      return ok(res, { joined: false, newDue: 0, reviewDue: 0, currentChapter: 1 })
    }
    const bookIds = links.map((l) => l.wordbookId)
    const primary = links[0]
    const today = startOfToday()
    // 新词：主词书当前进度章内未学过的词数（章节制，无每日额度）
    const current = await currentChapter(user.id, primary.wordbookId)
    const chapterStart = (current - 1) * CHAPTER_SIZE
    const newDue = await prisma.word.count({
      where: {
        wordbookId: primary.wordbookId,
        rank: { gte: chapterStart, lt: chapterStart + CHAPTER_SIZE },
        userWords: { none: { userId: user.id, repetitions: { gt: 0 } } },
      },
    })
    const reviewDue = await prisma.userWord.count({
      where: {
        userId: user.id,
        word: { wordbookId: { in: bookIds } },
        status: { in: ['LEARNING', 'REVIEW'] },
        dueDate: { lte: addDays(today, 1) }, // 今天之内到期（含 dueDate 为今天任意时刻）
        repetitions: { gt: 0 },
      },
    })
    return ok(res, { joined: true, newDue, reviewDue, currentChapter: current })
  } catch (err) {
    next(err)
  }
})

/** GET /api/review/queue?mode=new|review&chapter=N&wordbookId=M —— 取一批学习卡片
 *  新词：从主词书（或 wordbookId 指定词书）取；chapter 指定则取该章全部词（支持重刷），缺省取当前进度章 */
router.get(
  '/queue',
  validate({
    query: z.object({
      mode: z.enum(['new', 'review']),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      chapter: z.coerce.number().int().min(1).optional(),
      wordbookId: z.coerce.number().int().positive().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const user = await getCurrentUser(req)
      const { mode, limit, chapter, wordbookId } = req.query as unknown as {
        mode: 'new' | 'review'
        limit: number
        chapter?: number
        wordbookId?: number
      }
      const links = await prisma.userWordBook.findMany({ where: { userId: user.id } })
      if (links.length === 0 && !wordbookId) throw new ApiError('请先选择词书', 400)
      const primary = links.find((l) => l.isPrimary) ?? links[0]
      const today = startOfToday()
      const tomorrow = addDays(today, 1)

      let where
      if (mode === 'new') {
        // 目标语书：指定优先，否则主词书
        const targetBookId = wordbookId ?? primary?.wordbookId
        if (!targetBookId) throw new ApiError('参数错误', 400)
        // 章节：指定的章或当前进度章；该章全部词（含学过的，可重刷）
        const ch = chapter ?? (await currentChapter(user.id, targetBookId))
        const rankStart = (ch - 1) * CHAPTER_SIZE
        where = {
          wordbookId: targetBookId,
          rank: { gte: rankStart, lt: rankStart + CHAPTER_SIZE },
        }
      } else {
        // 复习：SM-2 到期队列（所有已加入词书）
        where = {
          wordbookId: { in: links.map((l) => l.wordbookId) },
          userWords: {
            some: {
              userId: user.id,
              status: { in: ['LEARNING', 'REVIEW'] },
              dueDate: { lte: tomorrow },
              repetitions: { gt: 0 },
            },
          },
        }
      }

      const words = await prisma.word.findMany({
        where,
        orderBy: { rank: 'asc' },
        take: limit,
        include: { userWords: { where: { userId: user.id }, take: 1 } },
      })

      return ok(
        res,
        words.map((w) => ({
          wordId: w.id,
          userWordId: w.userWords[0]?.id ?? null,
          headword: w.headword,
          phoneticUs: w.phoneticUs,
          phoneticUk: w.phoneticUk,
          definitions: w.definitions,
          exampleSentence: w.exampleSentence,
          exampleTranslation: w.exampleTranslation,
          isNew: w.userWords.length === 0 || w.userWords[0].repetitions === 0,
        })),
      )
    } catch (err) {
      next(err)
    }
  },
)

const gradeSchema = z.object({
  wordId: z.number().int().positive(),
  grade: z.enum(['forget', 'fuzzy', 'good', 'easy']),
})

/** POST /api/review/grade —— 提交一次评分，走 SM-2 更新进度 */
router.post('/grade', validate({ body: gradeSchema }), async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    const { wordId, grade } = req.body
    const word = await prisma.word.findUnique({ where: { id: wordId } })
    if (!word) return fail(res, '单词不存在', 404)

    const quality = GRADING[grade.toUpperCase() as keyof typeof GRADING]
    if (quality === undefined) throw new ApiError('评分参数错误')

    let uw = await prisma.userWord.findUnique({
      where: { userId_wordId: { userId: user.id, wordId } },
    })
    const isNew = !uw || uw.repetitions === 0
    if (!uw) {
      uw = await prisma.userWord.create({
        data: { userId: user.id, wordId, status: 'LEARNING' },
      })
    }

    const result = sm2(
      {
        easeFactor: uw.easeFactor,
        intervalDays: uw.intervalDays,
        repetitions: uw.repetitions,
        status: uw.status as 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED',
      },
      quality,
    )

    const updated = await prisma.userWord.update({
      where: { id: uw.id },
      data: {
        easeFactor: result.easeFactor,
        intervalDays: result.intervalDays,
        repetitions: result.repetitions,
        status: result.status,
        dueDate: dueDateFrom(result.dueInDays),
        lastReviewedAt: new Date(),
      },
    })

    // 埋点：新学 or 复习
    await addDailyStat(user.id, isNew ? { newWords: 1 } : { reviewedWords: 1 })

    return ok(res, {
      userWordId: updated.id,
      status: updated.status,
      intervalDays: updated.intervalDays,
      dueDate: updated.dueDate,
    })
  } catch (err) {
    next(err)
  }
})

export default router
