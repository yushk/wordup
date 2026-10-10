import nodemailer, { type Transporter } from 'nodemailer'
import { singleton } from '../lib/singleton.js'

/**
 * 邮件服务：阿里云 SMTP 发送验证码
 *
 * 环境变量（未配置时 sendCode 返回未启用错误）：
 *   SMTP_HOST=smtpdm.aliyun.com
 *   SMTP_PORT=465
 *   SMTP_USER=发信地址（如 no-reply@mail.wordup.xin）
 *   SMTP_PASS=SMTP 密码
 *   SMTP_FROM=显示名 <发信地址>（可选，缺省用 SMTP_USER）
 */

let mailer: Transporter | null = null

/** SMTP 是否已配置 */
export function mailEnabled(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

function getMailer(): Transporter {
  return singleton('mailer', () =>
    nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: Number(process.env.SMTP_PORT ?? 465) === 465, // 465 走 SSL，其他（如 587）STARTTLS
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    }),
  )
}

// ===== 验证码存储（内存，重启清空；生产多实例需换 Redis——当前单实例部署够用） =====

interface CodeEntry {
  code: string
  expiresAt: number
  sentAt: number // 上次发送时间（限频）
  tries: number // 已尝试次数（防爆破）
}

/** email 小写归一 → 验证码条目 */
const codeStore = new Map<string, CodeEntry>()

const CODE_TTL_MS = 10 * 60 * 1000 // 验证码 10 分钟有效
const RESEND_INTERVAL_MS = 60 * 1000 // 同一邮箱 60s 内只能发一次
const MAX_TRIES = 5 // 验证码最多试 5 次

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/** 定期清理过期条目（防内存缓慢增长） */
function cleanup() {
  const now = Date.now()
  for (const [email, e] of codeStore) {
    if (e.expiresAt < now && now - e.sentAt > CODE_TTL_MS) codeStore.delete(email)
  }
}

/** 发送验证码到指定邮箱。抛 ApiError 风格错误（message 中文）。 */
export async function sendVerificationCode(email: string, purpose: 'reset' | 'register' = 'reset'): Promise<void> {
  if (!mailEnabled()) throw new Error('邮件服务未配置')
  const key = email.toLowerCase()
  const now = Date.now()

  // 限频：60s 一条
  const existing = codeStore.get(key)
  if (existing && now - existing.sentAt < RESEND_INTERVAL_MS) {
    const wait = Math.ceil((RESEND_INTERVAL_MS - (now - existing.sentAt)) / 1000)
    throw new Error(`发送太频繁，请 ${wait} 秒后再试`)
  }

  const code = randomCode()
  const subject = purpose === 'reset' ? 'WordUp 找回密码验证码' : 'WordUp 邮箱验证码'
  const html = `
  <div style="max-width:480px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,'PingFang SC',sans-serif;color:#2d3436">
    <h2 style="color:#6C5CE7;margin-bottom:6px">WordUp</h2>
    <p style="color:#636e72;font-size:14px;margin-top:0">您的验证码是：</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#6C5CE7;background:rgba(108,92,231,.08);border-radius:12px;padding:14px 0;text-align:center;margin:14px 0">${code}</div>
    <p style="color:#636e72;font-size:13px">${CODE_TTL_MS / 60000} 分钟内有效。若非本人操作请忽略此邮件。</p>
  </div>`

  await getMailer().sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER!,
    to: email,
    subject,
    html,
  })

  codeStore.set(key, { code, expiresAt: now + CODE_TTL_MS, sentAt: now, tries: 0 })
  cleanup()
}

/** 校验验证码（成功即失效，一次性）。 */
export function verifyCode(email: string, code: string): boolean {
  const key = email.toLowerCase()
  const entry = codeStore.get(key)
  if (!entry) return false
  if (Date.now() > entry.expiresAt) {
    codeStore.delete(key)
    return false
  }
  entry.tries++
  if (entry.tries > MAX_TRIES) {
    codeStore.delete(key) // 试太多次作废，需重新发送
    return false
  }
  if (entry.code !== code.trim()) return false
  codeStore.delete(key) // 验证成功一次性消费
  return true
}
