import { PrismaClient } from '@prisma/client'
import { singleton } from './singleton.js'

/** 全局共享的 Prisma 实例（dev 热重载下防连接泄漏） */
export const prisma = singleton('prisma', () => new PrismaClient())
