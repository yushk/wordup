# 英语学习网站（前后端分离）实施计划

## Context

用户需要一个**公开的、多用户**英语学习网站，覆盖全年龄段学习者（小学→雅思托福）。核心诉求是四大学习模块全做：单词学习、测验练习、阅读听力、口语跟读。经澄清确认的关键决策：

- **架构**：前后端分离 —— Vue 3 SPA（Vite + Element Plus）+ Express REST API + PostgreSQL
- **部署**：自托管服务器，后期再上线（一期先本地/内网跑通）
- **账号**：邮箱+密码注册登录（bcrypt + JWT）
- **界面**：现代活泼风（圆角卡片、明快配色），**中英双语**（vue-i18n）
- **发音**：Web Speech API（浏览器 TTS），零成本
- **词库**：导入 GitHub 开源词书（CET4/6、中高考、考研、雅思托福等）
- **口语**：一期只做发音播放+跟读录音回放，**不做评分**，AI 对话留二期
- **实现**：由 Claude 主导实现，用户在关键节点确认

项目位于 `E:\workspace\github\english-learning-site\`（2026-10-09 由 `C:\Users\Administrator\english-learning-site\` 迁移至 E 盘）。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3（组合式 API）+ Vite + TypeScript + Element Plus + Pinia + Vue Router + vue-i18n + ECharts（学习统计图表）|
| 后端 | Node.js + Express + TypeScript + Prisma ORM + Zod（入参校验）|
| 数据库 | PostgreSQL 16（Docker Compose 提供本地实例）|
| 鉴权 | bcrypt 密码哈希 + JWT（httpOnly cookie 或 Bearer，取实现时更稳妥者）|
| 测试 | 后端 Vitest + Supertest；前端 Vitest + @vue/test-utils |

## 目录结构

```
english-learning-site/
├── client/                  # Vue 3 SPA
│   ├── src/
│   │   ├── api/             # axios 封装 + 各模块 API
│   │   ├── components/      # 通用组件（发音按钮、词卡、进度条…）
│   │   ├── composables/     # useAuth, useSpeech(TTS), useRecorder…
│   │   ├── i18n/            # zh-CN / en 语言包
│   │   ├── router/          # 路由（含登录守卫）
│   │   ├── stores/          # Pinia: auth, learning, stats…
│   │   └── views/           # 页面组件
│   └── vite.config.ts       # dev proxy → server:3000
├── server/
│   ├── prisma/
│   │   ├── schema.prisma    # 数据模型
│   │   └── seed.ts          # 导入开源词书种子数据
│   ├── src/
│   │   ├── middleware/      # auth(JWT), errorHandler, validate(Zod)
│   │   ├── routes/          # auth, wordbooks, words, review, quiz, articles, stats, admin
│   │   ├── services/        # sm2.ts（间隔重复核心算法）, quiz.ts（出题）…
│   │   └── app.ts / index.ts
│   └── scripts/
│       └── import-wordbook.ts   # 词书 JSON 批量导入 CLI
├── data/
│   └── wordbooks/           # 下载的开源词书 JSON（git 忽略大文件可选）
├── docker-compose.yml       # PostgreSQL + (可选) 应用
└── README.md
```

## 数据模型（Prisma schema 要点）

- **User**：id, email(唯一), passwordHash, nickname, role(USER/ADMIN), createdAt
- **WordBook**：id, name, nameEn, level(小学/初中/高中/CET4/CET6/考研/雅思/托福…), wordCount
- **Word**：id, wordbookId, headword, phoneticUs/phoneticUk, definitions(JSON: 词性+中英释义), exampleSentence, exampleTranslation, rank(词序)
  - 复合主键或唯一约束 (wordbookId, headword)
- **UserWordBook**：userId + wordbookId，用户选择的词书、每日新词数设置
- **UserWord**：userId, wordId, status(NEW/LEARNING/REVIEW/MASTERED), easeFactor, intervalDays, repetitions, dueDate, lastReviewedAt —— SM-2 调度字段
- **QuizAttempt**：userId, wordId, quizType, isCorrect, createdAt —— 错题分析依据
- **Article**：id, title, titleEn, level(1-6 级), contentMd, translationMd, wordCount
- **ArticleWord**（可选，文章生词表）
- **DailyStat**：userId, date, newWords, reviewedWords, quizCorrect, quizTotal, minutes —— 打卡与图表数据

## 核心算法

**SM-2 间隔重复**（server/src/services/sm2.ts）：
- 输入：当前 UserWord 状态 + 本次评分 quality(0-5)
- 输出：更新后的 easeFactor/intervalDays/repetitions/dueDate/status
- 规则：quality<3 重置 repetitions；interval 按 1→6→round(prevEF×interval) 递增；EF 范围钳制 [1.3, 2.5]
- 独立纯函数，100% 单元测试覆盖

**出题逻辑**（server/src/services/quiz.ts）：
- 四种题型：en2cn（英译中选择）、cn2en、listening（听音拼写）、cloze（例句填空）
- 干扰项从同词书随机抽取 3 个；listening 用 TTS 前端播放 headword；cloze 将例句中目标词替换为下划线

## API 设计（REST，前缀 /api）

- `POST /auth/register|login|logout|me`
- `GET /wordbooks`，`POST /user/wordbooks`（选词书+设置每日新词数）
- `GET /review/today`（今日待学新词+到期复习）、`POST /review/:userWordId`（提交评分，走 SM-2）
- `GET /quiz/generate?type=&count=`，`POST /quiz/submit`（批量判分+记录+错题入复习队列）
- `GET /articles?level=`，`GET /articles/:id`
- `GET /stats/daily?from=&to=`，`GET /stats/overview`
- `POST /admin/wordbooks/import`（上传 JSON 导入）、`GET /admin/users`
- 统一响应：`{ code: 0, data }` / `{ code: 1, message }`；Zod 校验失败返回 400

## 前端页面

| 路由 | 页面 |
|---|---|
| `/` | 落地页：产品介绍+词书展示（未登录）/ 学习中心（已登录）|
| `/login` `/register` | 登录注册 |
| `/study` | 今日学习：新词卡片流+复习卡片流（认识/模糊/不认识三键评分）|
| `/wordbooks` | 词书广场：选择词书、查看进度 |
| `/quiz` | 测验：选题型→答题（即时反馈）→结果页（错题重练）|
| `/reading` `/reading/:id` | 文章列表（按级筛选）/ 阅读页：点词查义+加生词本+TTS 逐句朗读 |
| `/speaking` | 口语：选词/例句→播放发音→跟读录音回放对比 |
| `/stats` | 学习中心：打卡日历、折线图（ECharts）、连续天数 |
| `/admin/*` | 管理后台：词书导入、文章管理、用户列表（仅 ADMIN 角色）|

**设计风格**：现代活泼 —— 主色取活力色（如 #6C5CE7 紫 / #00B894 绿渐变），圆角卡片、大按钮、微动效（卡片翻转）、中文默认可切英文。

**通用组件**：SpeakButton（TTS 发音，美/英切换）、WordCard（翻转卡片）、ProgressRing、EmptyState。

**composables**：`useSpeech`（封装 speechSynthesis，取 en-US/en-GB 声音）、`useRecorder`（MediaRecorder 录音+回放）、`useAuth`。

## 词书数据导入

1. 从 GitHub 开源词库（kajweb/dict 等 ECDICT/扇贝格式 JSON）下载 CET4/CET6/中考/高考/考研/雅思/托福词书到 `data/wordbooks/`
2. 写 `server/scripts/import-wordbook.ts`：清洗字段（headword/音标/释义/例句），映射到 Word 表，幂等（已存在跳过）
3. `prisma/seed.ts` 调用导入脚本完成首次种子
4. 下载失败的词书用小规模手工示例数据兜底，保证流程可演示

## 实施步骤（里程碑）

1. **脚手架**：monorepo 结构、Vite+Vue3 client、Express+TS server、docker-compose 起 PostgreSQL、Prisma schema+首次迁移、ESLint+Prettier
2. **认证**：注册/登录/登出/me API + JWT 中间件 + 前端登录注册页 + 路由守卫 + axios 拦截器（401 跳登录）
3. **i18n + 布局**：vue-i18n 双语包、顶部导航布局、主题样式系统（活泼风设计 tokens）
4. **词书与导入**：词书 API + 词书广场页 + 导入脚本 + 种子数据
5. **单词学习模块**：今日学习 API（新词+到期复习）+ SM-2 服务（先写测试）+ 学习卡片流页面（评分三键、TTS 发音、进度条）
6. **测验模块**：出题服务（干扰项抽取，先写测试）+ 四题型答题页 + 结果页 + 错题入队
7. **阅读听力**：文章 API + 列表页 + 阅读页（点词查义、生词本、TTS 逐句朗读控制条）
8. **口语跟读**：录音 composable + 跟读对比页
9. **学习统计**：DailyStat 记录（在各学习动作中埋点）+ 统计 API + ECharts 图表页 + 打卡日历
10. **管理后台**：admin 守卫（role=ADMIN）+ 词书 JSON 上传导入 + 用户列表
11. **收尾**：README（本地启动/生产部署 Nginx 反代示例）、端到端手工验证清单

每步完成标准：类型检查通过、相关测试通过、前端页面可操作。

## 测试策略

- **SM-2 算法**：全分支单测（首次记忆/复习/遗忘/EF 钳制/到期日计算）
- **出题逻辑**：题型生成、干扰项不重复、cloze 替换正确
- **API**：Supertest 测 auth 流、review 提交流（内存 SQLite 或测试库）
- **前端**：stores（auth/learning 状态机）、WordCard 组件渲染

## 验证方式

1. `docker compose up -d` 起 PostgreSQL → `npm run seed` 导入词书
2. `npm run dev`（server:3000 + client:5173）
3. 手工端到端：注册→选词书→学 10 个新词（评分）→明日到期验证（可用 SQL 改 dueDate 模拟）→测验四题型→阅读点词→录音跟读→统计图表有数据→admin 导入词书
4. `npm test` 全绿

## 一期明确不做（防蔓延）

- 口语评分/AI 对话（二期）
- 第三方登录、忘记密码邮件流程（二期）
- 移动 App、离线 PWA（二期）
- 付费/会员体系

---

## 实施结果（2026-10-09 完成）

全部 11 个里程碑按计划完成，附加记录：

- **测试**：15 个单元测试全过（SM-2 算法 9 个 + 出题逻辑 6 个）；前后端 TypeScript 检查零错误；前端生产构建成功
- **端到端浏览器验证**：注册→登录→选词书→学习评分→测验四题型→阅读点词收藏→统计图表→admin 导入词书→中英切换，全流程通过
- **开发中修复的 bug**：
  1. 阅读页句尾带标点的词（如 `garden.`）不可点击 → 分词逻辑改为拆出词干与标点
  2. 点词弹层模板中直接引用 `window` 导致渲染报错 → 提取为 `popupLeft()` 方法
  3. 文章详情 API 响应丢失 `id` 字段（解构误剔除）→ 保留 `id`
  4. 统计页 ECharts 在 DOM 未挂载时初始化 → 加 `nextTick`
  5. 测验选项释义带词性前缀导致断言不匹配 → 统一为纯释义
- **默认管理员**：`admin@example.com` / `admin123456`（种子数据创建）
- **二期规划**（见 README）：口语评分 / AI 对话、第三方登录、PWA、生词本与复习队列打通
