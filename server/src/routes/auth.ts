import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { ok, fail, ApiError, validate } from '../lib/respond.js'
import { signToken, requireAuth, getCurrentUser } from '../middleware/auth.js'

const router = Router()

const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 位').max(64),
  nickname: z.string().min(1, '昵称不能为空').max(24, '昵称最多 24 字符'),
})

/** POST /api/auth/register */
router.post('/register', validate({ body: registerSchema }), async (req, res, next) => {
  try {
    const { email, password, nickname } = req.body
    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return fail(res, '该邮箱已注册')
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { email, passwordHash, nickname },
    })
    const token = signToken({ uid: user.id, role: user.role })
    return ok(res, {
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, role: user.role },
    })
  } catch (err) {
    next(err)
  }
})

const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '请输入密码'),
})

/** POST /api/auth/login */
router.post('/login', validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return fail(res, '邮箱或密码错误', 401)
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return fail(res, '邮箱或密码错误', 401)
    const token = signToken({ uid: user.id, role: user.role })
    return ok(res, {
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, role: user.role },
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/auth/me */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await getCurrentUser(req)
    return ok(res, {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
    })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/auth/profile —— 改昵称 */
router.put(
  '/profile',
  requireAuth,
  validate({ body: z.object({ nickname: z.string().min(1).max(24) }) }),
  async (req, res, next) => {
    try {
      const user = await getCurrentUser(req)
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { nickname: req.body.nickname },
      })
      return ok(res, {
        id: updated.id,
        email: updated.email,
        nickname: updated.nickname,
        role: updated.role,
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
