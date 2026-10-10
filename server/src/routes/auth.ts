import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { ok, fail, ApiError, validate } from '../lib/respond.js'
import { signToken, requireAuth, getCurrentUser } from '../middleware/auth.js'
import { sendVerificationCode, verifyCode, mailEnabled } from '../services/mailer.js'

const router = Router()

/** POST /api/auth/send-code —— 发送邮箱验证码（找回密码用）
 *  无论邮箱是否注册都返回成功（防枚举）；仅在邮件服务已配置时工作 */
router.post(
  '/send-code',
  validate({ body: z.object({ email: z.string().email('邮箱格式不正确') }) }),
  async (req, res, next) => {
    try {
      const { email } = req.body
      if (!mailEnabled()) throw new ApiError('邮件服务未配置，请联系管理员', 503)
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) {
        // 防邮箱枚举：不提示邮箱不存在，静默成功（也不真发）
        return ok(res, null)
      }
      await sendVerificationCode(email, 'reset')
      return ok(res, null)
    } catch (err) {
      next(err)
    }
  },
)

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

/** POST /api/auth/reset-password —— 验证码校验 + 重置密码 */
router.post(
  '/reset-password',
  validate({
    body: z.object({
      email: z.string().email('邮箱格式不正确'),
      code: z.string().length(6, '验证码为 6 位数字'),
      password: z.string().min(6, '密码至少 6 位').max(64),
    }),
  }),
  async (req, res, next) => {
    try {
      const { email, code, password } = req.body
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) return fail(res, '验证码错误或已过期', 400)
      if (!verifyCode(email, code)) return fail(res, '验证码错误或已过期', 400)
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(password, 10) },
      })
      return ok(res, null)
    } catch (err) {
      next(err)
    }
  },
)

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
