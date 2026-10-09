import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { ok, fail, ApiError } from '../lib/respond.js'
import { requireAuth, requireAdmin, getCurrentUser } from '../middleware/auth.js'
import { importWordbookData } from '../../scripts/import-wordbook.ts'

const router = Router()
router.use(requireAuth, requireAdmin)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})

/**
 * POST /api/admin/wordbooks/import —— 上传词书 JSON 导入
 * 格式：[{ headword, phoneticUs?, phoneticUk?, definitions: [{pos, cn, en?}], exampleSentence?, exampleTranslation? }]
 * body: { name, nameEn, level } 由 query 传递，单词列表为 JSON 文件
 */
router.post('/wordbooks/import', upload.single('file'), async (req, res, next) => {
  try {
    await getCurrentUser(req) // 确保 ADMIN
    const { name, nameEn, level } = req.body as { name?: string; nameEn?: string; level?: string }
    if (!name || !level) return fail(res, '缺少 name 或 level 参数')
    if (!req.file) return fail(res, '请上传词书 JSON 文件')

    let words: unknown
    try {
      words = JSON.parse(req.file.buffer.toString('utf-8'))
    } catch {
      return fail(res, 'JSON 解析失败')
    }
    const result = await importWordbookData({ name, nameEn: nameEn ?? name, level }, words as never[])
    return ok(res, result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/admin/users —— 用户列表 */
router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = 20
    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          createdAt: true,
          _count: { select: { userWords: true } },
        },
      }),
    ])
    return ok(res, { total, page, pageSize, list: users })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/admin/users/:id/role —— 改用户角色 */
router.put('/users/:id/role', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const role = (req.body as { role?: string }).role
    if (!Number.isInteger(id) || (role !== 'USER' && role !== 'ADMIN')) {
      throw new ApiError('参数错误')
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, nickname: true, role: true },
    })
    return ok(res, updated)
  } catch (err) {
    next(err)
  }
})

const articleSchema = z.object({
  title: z.string().min(1),
  titleEn: z.string().min(1),
  level: z.number().int().min(1).max(6),
  contentMd: z.string().min(1),
  translationMd: z.string().default(''),
  coverColor: z.string().default('#6C5CE7'),
})

/** POST /api/admin/articles —— 新建文章 */
router.post('/articles', async (req, res, next) => {
  try {
    const parsed = articleSchema.parse(req.body)
    const wordCount = parsed.contentMd.split(/\s+/).filter(Boolean).length
    const article = await prisma.article.create({ data: { ...parsed, wordCount } })
    return ok(res, article)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/admin/articles/:id —— 更新文章 */
router.put('/articles/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) throw new ApiError('参数错误')
    const parsed = articleSchema.partial().parse(req.body)
    const data = { ...parsed }
    if (parsed.contentMd) {
      ;(data as { wordCount?: number }).wordCount = parsed.contentMd.split(/\s+/).filter(Boolean).length
    }
    const article = await prisma.article.update({ where: { id }, data })
    return ok(res, article)
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/admin/articles/:id */
router.delete('/articles/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) throw new ApiError('参数错误')
    await prisma.article.delete({ where: { id } })
    return ok(res)
  } catch (err) {
    next(err)
  }
})

/** GET /api/admin/articles —— 全部文章（含未发布） */
router.get('/articles', async (_req, res, next) => {
  try {
    const articles = await prisma.article.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, level: true, wordCount: true, published: true, createdAt: true },
    })
    return ok(res, articles)
  } catch (err) {
    next(err)
  }
})

export default router
