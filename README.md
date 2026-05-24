# 🐘 大象账本 (Mammoth)

AI 驱动的记账应用，支持文字 / 语音自动解析记账，支持多人共享账本。

**技术栈**：Go + Gin（后端）× React Native + Expo（iOS 前端）

---

## 目录结构

```
daxiang/
├── backend/          # Go 后端服务
│   ├── handlers/     # API 路由处理器
│   ├── middleware/   # JWT 鉴权中间件
│   ├── models/       # 数据库模型
│   └── main.go       # 入口文件
├── frontend/         # React Native 前端（Expo）
│   ├── app/          # 页面（Expo Router）
│   ├── components/   # 通用组件
│   ├── store/        # 状态管理（Zustand）
│   └── lib/          # 工具函数
├── start_backend.sh  # 一键启动后端
└── start_frontend.sh # 一键启动前端
```

---

## 环境要求

| 工具 | 版本 |
|------|------|
| Go | 1.21+ |
| Node.js | 18+ |
| Xcode | 15+（iOS 模拟器） |

---

## 环境变量配置

在 `backend/` 目录下创建 `.env` 文件：

```bash
cp backend/.env.example backend/.env
```

然后填入你自己的 Key：

```env
# 火山引擎 Ark 大模型（豆包）
ARK_API_KEY=你的_ARK_API_KEY
ARK_API_BASE=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seed-2-0-mini-260428

# 火山引擎豆包语音识别（ASR）
BYTEDANCE_ASR_KEY=你的_ASR_KEY
BYTEDANCE_ASR_RESOURCE_ID=volc.bigasr.sauc.duration
BYTEDANCE_ASR_ACCESS_KEY=你的_ASR_ACCESS_KEY
BYTEDANCE_ASR_WS_URL=wss://openspeech.bytedance.com/api/v3/sauc/bigmodel

# JWT 签名密钥（自定义一个复杂字符串）
JWT_SECRET=your-secret-here

# 后端端口（默认 8080）
PORT=8080
```

> **如何获取 Key？**
> - ARK / ASR Key：前往 [火山引擎控制台](https://console.volcengine.com/) 申请

---

## 启动项目

### 方式一：一键脚本（推荐）

**启动后端**
```bash
./start_backend.sh
```

**启动前端**（新开一个终端窗口）
```bash
./start_frontend.sh
```

---

### 方式二：手动启动

**后端**
```bash
cd backend
cp .env.example .env   # 填好环境变量
go mod tidy
go run main.go
# 服务运行在 http://localhost:8080
```

**前端**
```bash
cd frontend
npm install
npx expo run:ios       # iOS 模拟器
# 或
npx expo start         # 扫码用真机
```

---

## API 接口

后端默认运行在 `http://localhost:8080`，主要接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| GET  | `/api/books` | 获取账本列表 |
| POST | `/api/records/batch` | 批量创建记录 |
| POST | `/api/ai/parse` | AI 文字解析记账 |
| POST | `/api/ai/parse-voice` | AI 语音解析记账 |
| GET  | `/api/report/summary` | 报表汇总 |

> 除注册/登录外，所有接口需在请求头携带 JWT Token：
> ```
> Authorization: Bearer <token>
> ```

---

## 功能特性

- 📝 **文字记账** — 输入自然语言，AI 自动解析金额、分类
- 🎤 **语音记账** — 实时语音识别 + AI 解析，边说边记
- 📚 **共享账本** — 邀请家人/朋友共同记账
- 📊 **报表统计** — 按日/月汇总收支情况
- 🔐 **JWT 鉴权** — 安全的用户认证体系
