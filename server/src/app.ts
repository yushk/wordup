import express from 'express'
import cors from 'cors'
import { errorHandler } from './lib/respond.js'
import authRoutes from './routes/auth.js'
import wordbookRoutes from './routes/wordbooks.js'
import reviewRoutes from './routes/review.js'
import quizRoutes from './routes/quiz.js'
import articleRoutes from './routes/articles.js'
import statsRoutes from './routes/stats.js'
import adminRoutes from './routes/admin.js'

export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '20mb' })) // 词书导入 JSON 较大

  app.get('/api/health', (_req, res) => {
    res.json({ code: 0, data: { status: 'ok' } })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/wordbooks', wordbookRoutes)
  app.use('/api/review', reviewRoutes)
  app.use('/api/quiz', quizRoutes)
  app.use('/api/articles', articleRoutes)
  app.use('/api/stats', statsRoutes)
  app.use('/api/admin', adminRoutes)

  app.use(errorHandler)
  return app
}
