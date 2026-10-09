import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { ok, fail, ApiError, validate } from '../lib/respond.js'
import { requireAuth, getCurrentUser } from '../middleware/auth.js'

const router = Router()

/** GET /api/articles?level=1-6 —— 文章列表（公开，按级筛选） */
router.get(
  '/',
  validate({
    query: z.object({
      level: z.coerce.number().int().min(1).max(6).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
    }),
  }),
  async (req, res, next) => {
    try {
      const { level, page, pageSize } = req.query as unknown as {
        level?: number
        page: number
        pageSize: number
      }
      const where = { published: true, ...(level ? { level } : {}) }
      const [total, articles] = await Promise.all([
        prisma.article.count({ where }),
        prisma.article.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            title: true,
            titleEn: true,
            level: true,
            wordCount: true,
            coverColor: true,
            createdAt: true,
          },
        }),
      ])
      return ok(res, { total, page, pageSize, list: articles })
    } catch (err) {
      next(err)
    }
  },
)

/** GET /api/articles/:id —— 文章详情（含我的生词本，登录可选） */
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) throw new ApiError('参数错误')
    const article = await prisma.article.findUnique({ where: { id } })
    if (!article || !article.published) return fail(res, '文章不存在', 404)

    let savedWords: unknown[] = []
    const header = req.headers.authorization
    if (header?.startsWith('Bearer ')) {
      // 有 token 就顺带取生词本（token 无效忽略）
      try {
        const jwt = (await import('jsonwebtoken')).default
        const payload = jwt.verify(
          header.slice(7),
          process.env.JWT_SECRET ?? 'dev-secret',
        ) as { uid: number }
        const ua = await prisma.userArticle.findUnique({
          where: { userId_articleId: { userId: payload.uid, articleId: id } },
        })
        if (ua) savedWords = ua.savedWords as unknown[]
      } catch {
        /* 未登录态 */
      }
    }

    const { translationMd, ...rest } = article
    return ok(res, {
      ...rest,
      translation: translationMd,
      savedWords,
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/articles/:id/words —— 保存/移除生词 */
router.post(
  '/:id/words',
  requireAuth,
  validate({
    body: z.object({
      word: z.string().min(1).max(64),
      context: z.string().max(500).optional(),
      remove: z.boolean().default(false),
    }),
  }),
  async (req, res, next) => {
    try {
      const user = await getCurrentUser(req)
      const articleId = Number(req.params.id)
      if (!Number.isInteger(articleId)) throw new ApiError('参数错误')
      const article = await prisma.article.findUnique({ where: { id: articleId } })
      if (!article) return fail(res, '文章不存在', 404)

      const { word, context, remove } = req.body
      let ua = await prisma.userArticle.findUnique({
        where: { userId_articleId: { userId: user.id, articleId } },
      })
      if (!ua) {
        ua = await prisma.userArticle.create({
          data: { userId: user.id, articleId, savedWords: [] },
        })
      }
      const words = ua.savedWords as { word: string; context?: string }[]
      let updated: { word: string; context?: string }[]
      if (remove) {
        updated = words.filter((w) => w.word !== word)
      } else {
        if (words.some((w) => w.word === word)) return ok(res, words)
        updated = [...words, { word, context }]
      }
      const saved = await prisma.userArticle.update({
        where: { id: ua.id },
        data: { savedWords: updated, readAt: new Date() },
      })
      return ok(res, saved.savedWords)
    } catch (err) {
      next(err)
    }
  },
)

/** GET /api/articles/mine/words —— 我收藏的所有生词 */
router.get('/mine/words', requireAuth, async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    const uas = await prisma.userArticle.findMany({
      where: { userId: user.id },
      include: { article: { select: { id: true, title: true } } },
      orderBy: { readAt: 'desc' },
    })
    const result = uas.flatMap((ua) =>
      (ua.savedWords as { word: string; context?: string }[]).map((w) => ({
        ...w,
        articleId: ua.article.id,
        articleTitle: ua.article.title,
      })),
    )
    return ok(res, result)
  } catch (err) {
    next(err)
  }
})

export default router
