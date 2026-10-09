import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { ok, fail, ApiError, validate } from '../lib/respond.js'
import { requireAuth, getCurrentUser } from '../middleware/auth.js'
import { buildQuizQuestion, sampleN, type QuizWord, type QuizType } from '../services/quiz.js'
import { addDailyStat } from '../services/stats.js'
import { sm2, GRADING } from '../services/sm2.js'

const router = Router()
router.use(requireAuth)

const QUIZ_TYPES: QuizType[] = ['en2cn', 'cn2en', 'listening', 'cloze']

/**
 * GET /api/quiz/generate?type=en2cn|cn2en|listening|cloze|mixed&count=10
 * 从用户已学词书中出题（优先已学过的词，不足时从词书补新词）
 */
router.get(
  '/generate',
  validate({
    query: z.object({
      type: z.enum(['en2cn', 'cn2en', 'listening', 'cloze', 'mixed']).default('mixed'),
      count: z.coerce.number().int().min(1).max(30).default(10),
    }),
  }),
  async (req, res, next) => {
    try {
      const user = await getCurrentUser(req)
      const { type, count } = req.query as unknown as {
        type: QuizType | 'mixed'
        count: number
      }
      const links = await prisma.userWordBook.findMany({ where: { userId: user.id } })
      if (links.length === 0) throw new ApiError('请先选择词书')
      const bookIds = links.map((l) => l.wordbookId)

      // 优先考已学过的词；不够再用词书前部的词补
      const learnedWords = await prisma.word.findMany({
        where: {
          wordbookId: { in: bookIds },
          userWords: { some: { userId: user.id, repetitions: { gt: 0 } } },
        },
        take: count * 2,
      })
      let pool = sampleN(learnedWords, count)
      if (pool.length < count) {
        const extra = await prisma.word.findMany({
          where: {
            wordbookId: { in: bookIds },
            id: { notIn: pool.map((w) => w.id) },
          },
          orderBy: { rank: 'asc' },
          take: (count - pool.length) * 2,
        })
        pool = [...pool, ...sampleN(extra, count - pool.length)]
      }
      if (pool.length === 0) throw new ApiError('词书中没有可用单词')

      // 干扰项池：每本词书随机抽词
      const distractorPool = await prisma.word.findMany({
        where: { wordbookId: { in: bookIds }, id: { notIn: pool.map((w) => w.id) } },
        take: 200,
      })

      const questions = pool.map((word) => {
        const t: QuizType = type === 'mixed' ? QUIZ_TYPES[Math.floor(Math.random() * 4)] : type
        const distractors = sampleN(distractorPool, 3) as unknown as QuizWord[]
        return buildQuizQuestion(word as unknown as QuizWord, distractors, t)
      })

      return ok(res, questions)
    } catch (err) {
      next(err)
    }
  },
)

const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        wordId: z.number().int().positive(),
        quizType: z.enum(['en2cn', 'cn2en', 'listening', 'cloze']),
        answer: z.string(),
        correctAnswer: z.string(),
      }),
    )
    .min(1)
    .max(30),
})

/**
 * POST /api/quiz/submit —— 批量判分。
 * 服务端不重算题目（题目已下发），仅记录 + 错词以 FORGET 语义入复习队列。
 */
router.post('/submit', validate({ body: submitSchema }), async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    const { answers } = req.body

    let correct = 0
    const results: { wordId: number; isCorrect: boolean; headword: string }[] = []

    for (const a of answers) {
      const isCorrect = normalize(a.answer) === normalize(a.correctAnswer)
      if (isCorrect) correct++
      const word = await prisma.word.findUnique({ where: { id: a.wordId } })
      if (!word) continue

      // 确保 UserWord 存在
      let uw = await prisma.userWord.findUnique({
        where: { userId_wordId: { userId: user.id, wordId: a.wordId } },
      })
      if (!uw) {
        uw = await prisma.userWord.create({
          data: { userId: user.id, wordId: a.wordId, status: 'LEARNING' },
        })
      }

      await prisma.quizAttempt.create({
        data: {
          userId: user.id,
          wordId: a.wordId,
          quizType: a.quizType,
          isCorrect,
          userWordId: uw.id,
        },
      })

      // 错词：以低质量评分入/更新复习调度（下次优先复习）
      if (!isCorrect) {
        const result = sm2(
          {
            easeFactor: uw.easeFactor,
            intervalDays: uw.intervalDays,
            repetitions: uw.repetitions,
            status: uw.status as 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED',
          },
          GRADING.FORGET,
        )
        const due = new Date()
        due.setHours(0, 0, 0, 0)
        due.setDate(due.getDate() + result.dueInDays)
        await prisma.userWord.update({
          where: { id: uw.id },
          data: {
            easeFactor: result.easeFactor,
            intervalDays: result.intervalDays,
            repetitions: result.repetitions,
            status: result.status,
            dueDate: due,
            lastReviewedAt: new Date(),
          },
        })
      }

      results.push({ wordId: a.wordId, isCorrect, headword: word.headword })
    }

    await addDailyStat(user.id, {
      quizCorrect: correct,
      quizTotal: answers.length,
    })

    return ok(res, { correct, total: answers.length, results })
  } catch (err) {
    next(err)
  }
})

/** GET /api/quiz/wrong?limit=20 —— 最近错题 */
router.get(
  '/wrong',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }) }),
  async (req, res, next) => {
    try {
      const user = await getCurrentUser(req)
      const wrong = await prisma.quizAttempt.findMany({
        where: { userId: user.id, isCorrect: false },
        orderBy: { createdAt: 'desc' },
        take: (req.query as unknown as { limit: number }).limit,
        include: {
          word: {
            select: { id: true, headword: true, phoneticUs: true, definitions: true },
          },
        },
      })
      return ok(res, wrong)
    } catch (err) {
      next(err)
    }
  },
)

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

export default router
