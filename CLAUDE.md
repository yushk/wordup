# CLAUDE.md — WordUp 英语学习网站

本文件是 Claude Code 在此项目内工作时的项目指引。从项目根目录启动 Claude Code 会自动读取。

## 项目概览

前后端分离的多用户英语学习平台（背单词 SM-2 + 测验 + 分级阅读听力 + 口语跟读）。

- **完整实施计划与开发记录**：`docs/implementation-plan.md`（含架构决策、数据模型、修复过的 bug 清单——修改核心逻辑前先读它）
- **启动/部署/词书导入说明**：`README.md`

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 (组合式 API) + TypeScript + Vite + Element Plus + Pinia + vue-i18n + ECharts |
| 后端 | Node.js + Express + TypeScript + Prisma + Zod |
| 数据库 | PostgreSQL 16（Docker，容器名 `els-postgres`） |
| 鉴权 | bcrypt + JWT（Bearer，30 天） |

## 常用命令

```bash
# 数据库
docker compose up -d                      # 启动 PostgreSQL
cd server && npx prisma migrate dev       # 建表/改表（改 schema.prisma 后）
cd server && npm run seed                 # 种子：ADMIN 账号 + 示例词书 + 文章 + data/wordbooks/ 下开源词书

# 开发（两个终端）
cd server && npm run dev                  # API → http://localhost:3000
cd client && npm run dev                  # 前端 → http://localhost:5173（/api 代理到 3000）

# 质量检查（提交前必跑）
cd server && npm test                     # 15 个单元测试（SM-2 + 出题逻辑）
cd server && npm run typecheck            # tsc --noEmit
cd client && npx vue-tsc --noEmit         # 前端类型检查

# 词书导入
cd server && npm run import:wordbook -- ../data/wordbooks/CET4.json "大学英语四级" CET-4 cet4

# 跑单个测试文件 / 单条用例
cd server && npx vitest run tests/sm2.test.ts
cd server && npx vitest run -t "模糊"
```

根目录 `package.json` 也有便捷脚本：`npm run dev:server` / `dev:client` / `db:up` / `db:migrate` / `seed`。

## 目录结构

```
client/src/
  api/          # axios 封装(http.ts) + 各模块 API；统一响应 {code:0,data}|{code:1,message}
  composables/  # useSpeech(Web Speech TTS) useRecorder(MediaRecorder 录音)
  i18n/         # zh-CN.ts / en.ts —— 改界面文案两边都要改
  router/       # 路由 + 守卫（requiresAuth / requiresAdmin / guestOnly）
  stores/       # Pinia（auth：token 存 localStorage els_token）
  views/        # 页面；admin/ 子目录为管理后台
server/src/
  lib/          # respond.ts（ok/fail/ApiError/validate(Zod)/errorHandler） db.ts(Prisma 单例，勿直接 new PrismaClient)
  middleware/   # auth.ts（requireAuth/requireAdmin/optionalAuth/signToken，req.auth={uid,role}）
  routes/       # auth wordbooks review quiz articles stats admin（挂载见 app.ts）
  services/     # sm2.ts（间隔重复核心算法）quiz.ts（出题）stats.ts（每日统计埋点）
server/prisma/  # schema.prisma + seed.ts
server/scripts/ # import-wordbook.ts（词书导入，被 admin 路由和 seed 共用）
data/wordbooks/ # 开源词书 JSON（git 忽略）
```

## 开发约定

- **核心域逻辑保持纯函数**：`services/sm2.ts` 和 `quiz.ts` 不依赖数据库，路由层负责取存数据
- **SM-2 评分四档**：FORGET=1 / FUZZY=3 / GOOD=4 / EASY=5；状态流转 NEW → LEARNING → REVIEW → MASTERED（≥6 轮且间隔 ≥21 天）
- **改 SM-2 / 出题逻辑必须先跑/补测试**：`server/tests/sm2.test.ts`、`server/tests/quiz.test.ts`，纯函数 TDD
- **后端新增接口**：路由里 `validate({body: zodSchema})` 校验入参，抛 `ApiError` 或 `fail()` 返回；错误信息面向用户用中文
- **前端新增页面**：文案进 `i18n/zh-CN.ts` 和 `en.ts`；路由加 `meta.requiresAuth` 视需要
- **主题样式**：CSS 变量在 `client/src/styles/main.css`（--els-primary #6C5CE7 等），活泼风：圆角卡片、渐变、flip 翻卡动画
- **发音**：一律走 `useSpeech`（浏览器 TTS），无音频文件
- **日期/到期计算**：以「本地时区零点」为一天边界（见 `review.ts` 的 `startOfToday`/`dueDateFrom`），改动要考虑时区
- **DailyStat 埋点**：学习动作发生时调 `services/stats.ts` 的 `addDailyStat()`，upsert 累加

## 数据库

- 连接串在 `server/.env`（git 忽略）：`postgresql://els:els_dev_password@localhost:5432/english_learning`
- `JWT_SECRET` 生产环境必须改
- 核心表：User / WordBook / Word / UserWordBook / UserWord(SM-2 字段) / QuizAttempt / Article / UserArticle(生词本) / DailyStat
- 默认管理员：admin@example.com / admin123456（仅开发用）

## 二期规划（未实现，别当 bug 修）

口语评分 / AI 对话、第三方登录、找回密码、PWA、生词本与复习队列打通。
