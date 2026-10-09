import { prisma } from '../lib/db.js'

/** 今日日期（本地时区零点，DB Date 类型） */
function todayDate(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * 累加每日统计（upsert）。deltas 中值为 0 的键跳过。
 */
export async function addDailyStat(
  userId: number,
  deltas: Partial<{
    newWords: number
    reviewedWords: number
    quizCorrect: number
    quizTotal: number
    minutes: number
  }>,
) {
  const date = todayDate()
  return prisma.dailyStat.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...deltas },
    update: {
      newWords: { increment: deltas.newWords ?? 0 },
      reviewedWords: { increment: deltas.reviewedWords ?? 0 },
      quizCorrect: { increment: deltas.quizCorrect ?? 0 },
      quizTotal: { increment: deltas.quizTotal ?? 0 },
      minutes: { increment: deltas.minutes ?? 0 },
    },
  })
}
