import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/db.js'
import { ApiError } from '../lib/respond.js'

export interface JwtPayload {
  uid: number
  role: string
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: JwtPayload
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET ?? 'dev-secret', {
    expiresIn: '30d',
  })
}

/** 要求登录；解析失败返回 401 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) return next(new ApiError('请先登录', 401))
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret') as JwtPayload
    next()
  } catch {
    next(new ApiError('登录已过期，请重新登录', 401))
  }
}

/** 要求 ADMIN 角色（须在 requireAuth 之后挂载） */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== 'ADMIN') {
    return next(new ApiError('无权限访问', 403))
  }
  next()
}

/** 可选登录：有合法 token 就挂上 auth，没有也放行（公开接口用） */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (token) {
    try {
      req.auth = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret') as JwtPayload
    } catch {
      /* token 无效时按未登录处理 */
    }
  }
  next()
}

/** 从登录态取用户，用户必须存在 */
export async function getCurrentUser(req: Request) {
  if (!req.auth) throw new ApiError('请先登录', 401)
  const user = await prisma.user.findUnique({ where: { id: req.auth.uid } })
  if (!user) throw new ApiError('用户不存在', 401)
  return user
}
