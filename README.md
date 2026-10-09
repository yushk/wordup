# WordUp · 英语学习网站

前后端分离的多用户英语学习平台：**背单词（SM-2 间隔重复）+ 测验 + 分级阅读听力 + 口语跟读**。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + Pinia + vue-i18n（中英双语）+ ECharts |
| 后端 | Node.js + Express + TypeScript + Prisma + Zod |
| 数据库 | PostgreSQL 16（Docker） |
| 鉴权 | bcrypt + JWT |
| 发音 | Web Speech API（浏览器 TTS，零成本） |

## 快速开始

### 前置要求

- Node.js 20+
- Docker（跑 PostgreSQL）

### 1. 启动数据库

```bash
docker compose up -d
```

### 2. 启动后端（端口 3000）

```bash
cd server
npm install
cp .env .env.local   # 或直接编辑 .env（开发用默认值即可）
npx prisma migrate dev   # 建表
npm run seed             # 导入示例词书 + 文章 + ADMIN 账号
npm run dev
```

### 3. 启动前端（端口 5173，代理 /api → 3000）

```bash
cd client
npm install
npm run dev
```

访问 http://localhost:5173

### 默认账号

| 账号 | 邮箱 | 密码 |
|---|---|---|
| 管理员 | admin@example.com | admin123456 |

## 功能

- **学单词**：选词书 → 每日新词卡片流（翻卡 + 四档评分）→ SM-2 算法自动安排复习
- **测验**：看词选义 / 看义选词 / 听音选义 / 例句填空 + 混合模式，错题自动进入复习队列
- **阅读听力**：分级文章、点词查义加入生词本、整篇 TTS 朗读、中英对照
- **口语跟读**：美/英音标准发音 + 麦克风录音回放对比（无评分，AI 对话二期）
- **学习统计**：连续打卡、30 天学习曲线图（ECharts）、打卡日历
- **管理后台**（/admin）：词书 JSON 上传导入、文章管理、用户管理
- **中英双语**：右上角一键切换

## 导入开源词书

词书 JSON 放到 `data/wordbooks/`，支持以下文件名（seed 自动导入）：
`CET4.json` `CET6.json` `zhongkao.json` `gaokao.json` `kaoyan.json` `IELTS.json` `TOEFL.json` `xiaoxue.json`

或通过管理后台上传，或在命令行导入：

```bash
cd server
npm run import:wordbook -- ../data/wordbooks/CET4.json "大学英语四级" CET-4 cet4
```

支持两种 JSON 格式：

```jsonc
// 标准格式
[{ "headword": "apple", "phoneticUs": "ˈæpl",
   "definitions": [{ "pos": "n.", "cn": "苹果" }],
   "exampleSentence": "An apple a day...", "exampleTranslation": "一天一苹果..." }]

// 扇贝/kajweb 格式（自动转换）
[{ "word": "apple", "usphone": "ˈæpl", "trans": ["n. 苹果"] }]
```

推荐词书来源：GitHub 上的开源词库（如 kajweb/dict、skywind3000/ECDICT 导出）。

## 测试

```bash
cd server && npm test    # SM-2 算法 + 出题逻辑（15 个测试）
```

## 生产部署（Nginx 示例）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /var/www/els-client;   # client 目录 npm run build 的产物
        try_files $uri $uri/ /index.html;
    }

    # API 反代
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

后端生产运行：

```bash
cd server
npm run build && npm start   # 记得改 .env 中的 JWT_SECRET
```

## 二期规划（未实现）

- 口语评分 / AI 对话（接入 LLM + STT）
- 第三方登录（微信/Google）、找回密码
- PWA / 移动端 App
- 生词本与学习流程打通（收藏词自动入复习队列）

## 项目结构

```
english-learning-site/
├── client/            # Vue 3 SPA
│   └── src/
│       ├── api/       # axios 封装 + 各模块 API
│       ├── composables/  # useSpeech(TTS) useRecorder(录音)
│       ├── i18n/       # zh-CN / en 语言包
│       ├── router/     # 路由 + 登录/admin 守卫
│       ├── stores/     # Pinia
│       └── views/      # 页面（含 admin/）
├── server/
│   ├── prisma/         # schema + seed
│   ├── scripts/        # 词书导入 CLI
│   └── src/
│       ├── middleware/  # JWT / admin 守卫
│       ├── routes/      # auth wordbooks review quiz articles stats admin
│       └── services/    # sm2.ts（间隔重复）quiz.ts（出题）stats.ts
├── data/wordbooks/    # 开源词书 JSON（git 忽略）
└── docker-compose.yml # PostgreSQL 16
```
