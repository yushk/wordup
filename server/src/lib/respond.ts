import type { NextFunction, Request, Response } from 'express'
import { ZodError, type ZodSchema } from 'zod'

/** 统一成功响应 */
export function ok(res: Response, data: unknown = null) {
  return res.json({ code: 0, data })
}

/** 统一失败响应 */
export function fail(res: Response, message: string, status = 400) {
  return res.status(status).json({ code: 1, message })
}

/** 业务错误：路由中 throw，由 errorHandler 统一捕获 */
export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** Zod 入参校验中间件工厂：校验 body / query / params */
export function validate(schemas: {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body)
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query)
        Object.assign(req.query, parsed)
      }
      if (schemas.params) req.params = schemas.params.parse(req.params)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ApiError(err.issues[0]?.message ?? '参数错误', 400))
      } else {
        next(err)
      }
    }
  }
}

/** 全局错误处理：必须是四参数签名 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ code: 1, message: err.message })
  }
  console.error('[unhandled]', err)
  return res.status(500).json({ code: 1, message: '服务器内部错误' })
}
