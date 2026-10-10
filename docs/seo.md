# WordUp SEO 指南

已完成的站内优化（`client/index.html` + `client/public/`）：

- **TDK**：标题「WordUp · 打字背单词 - 英语学习网站（SM-2 记忆算法）」+ description + keywords
- **Open Graph / Twitter Card**：微信/QQ/微博/推特分享卡（og-image.png 1200×630）
- **结构化数据**：WebApplication JSON-LD（搜索富摘要）
- **robots.txt**：允许全站、禁 /admin 和 /api、指向 sitemap
- **sitemap.xml**：首页/学单词/阅读/注册/登录
- **动态 title**：每个路由独立页面标题（router afterEach）
- **theme-color**：浏览器主题色 #6C5CE7

## 上线后提交收录（按顺序）

### 1. 百度站长平台（国内流量主要来源）

1. 访问 https://ziyuan.baidu.com → 添加网站 `https://wordup.xin`
2. 选「HTML 标签验证」，拿到 `content` 码
3. 编辑 `client/index.html`，取消 `baidu-site-verification` 那行注释并填入验证码
4. 重新构建部署，回平台点「完成验证」
5. 左侧「普通收录」→ sitemap 提交 `https://wordup.xin/sitemap.xml`

### 2. Google Search Console（海外/技术人群）

1. https://search.google.com/search-console → 添加资源 `https://wordup.xin`
2. 同样 HTML 标签验证（`google-site-verification`），部署后验证
3. 「站点地图」提交 sitemap.xml

### 3. 必应站长（可选）

https://www.bing.com/webmasters → 同上（`msvalidate.01`）

## 分享卡调试

- 微信：用「草料」等工具生成二维码，手机微信扫码打开分享验证 og-image 生效
- 腾讯官方调试：https://connect.qq.com/tools/webmaster 一次可刷新 QQ/微信缓存

## 后续可选增强（暂未做）

- 预渲染/SSR（vite-ssg）：让首页文字内容进 HTML——工具站收益有限，流量起来再考虑
- 每篇阅读文章独立 meta（需要服务端渲染，阅读内容目前 API 拉取）
- 友情链接/外链：SEO 权重的主要来源，可在 V2EX、少数派等社区自然引流
