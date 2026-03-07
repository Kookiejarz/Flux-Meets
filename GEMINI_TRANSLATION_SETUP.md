# Gemini Translation Setup Guide

## 概述

Gemini 是 Google 提供的强大 AI 模型，现已集成为第三个字幕翻译选项：

1. **OpenAI** - 质量好，成本较高
2. **Gemini** - 质量好，免费额度大，推荐
3. **Workers AI** - 免费但质量一般

## 为什么选择 Gemini？

### 优势
- ✅ **免费额度大**: 每分钟最高 1500 次请求（免费层）
- ✅ **质量优秀**: 与 OpenAI GPT-4 相当的翻译质量
- ✅ **多语言支持**: 支持 100+ 语言
- ✅ **快速响应**: gemini-2.0-flash-exp 极速模型
- ✅ **简单配置**: 只需一个 API key

### 定价
- **免费层**: 
  - 每分钟 1500 次请求 (gemini-2.0-flash-exp)
  - 每分钟 15 次请求 (gemini-1.5-pro)
  - 每天 1500 次请求
- **付费层**: 
  - 按使用量计费
  - 价格通常低于 OpenAI

## 快速配置

### 步骤 1: 获取 API Key

1. 访问 [Google AI Studio](https://aistudio.google.com/apikey)
2. 登录你的 Google 账户
3. 点击 **Get API key** 或 **Create API key**
4. 复制生成的 API key

### 步骤 2: 配置环境变量

#### 开发环境 (`.dev.vars`)
```bash
# 翻译提供商
TRANSLATION_PROVIDER=gemini

# Gemini API 配置
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_TRANSLATION_MODEL=gemini-2.0-flash-exp
```

#### 生产环境 (`wrangler.production.toml`)
```toml
# 翻译提供商选择
TRANSLATION_PROVIDER = "gemini"

# Gemini 配置
# 使用 Cloudflare Secrets 存储 API key（推荐）
```

#### 使用 Cloudflare Secrets (生产推荐)
```bash
# 设置 secret
echo "your_gemini_api_key_here" | wrangler secret put GEMINI_API_KEY --env production

# 在 wrangler.production.toml 中配置
TRANSLATION_PROVIDER = "gemini"
GEMINI_TRANSLATION_MODEL = "gemini-2.0-flash-exp"
```

### 步骤 3: 重启开发服务器

```bash
npm run dev
```

## 可用模型

### Gemini 2.0 (推荐)
- **gemini-2.0-flash-exp** (推荐)
  - 最快的模型
  - 免费额度最高（1500 req/min）
  - 适合实时翻译
  - 质量：⭐⭐⭐⭐⭐

### Gemini 1.5
- **gemini-1.5-flash**
  - 快速且高效
  - 性价比高
  - 质量：⭐⭐⭐⭐

- **gemini-1.5-pro**
  - 最高质量
  - 成本较高
  - 免费额度较低（15 req/min）
  - 质量：⭐⭐⭐⭐⭐

## 配置示例

### 开发环境 - 使用 Gemini
```bash
# .dev.vars
TRANSLATION_PROVIDER=gemini
GEMINI_API_KEY=AIzaSy...your_key_here
GEMINI_TRANSLATION_MODEL=gemini-2.0-flash-exp
WORKERS_AI_TRANSLATION_TARGET_LANGS=en,zh
```

### 生产环境 - 切换到 Gemini
```toml
# wrangler.production.toml
[vars]
TRANSLATION_PROVIDER = "gemini"
GEMINI_TRANSLATION_MODEL = "gemini-2.0-flash-exp"
WORKERS_AI_TRANSLATION_TARGET_LANGS = "en,zh,ja,ko"

# 使用 Cloudflare Secret 存储 GEMINI_API_KEY
```

### 混合配置 - 保留多个选项
```toml
# 可以配置多个提供商，通过 TRANSLATION_PROVIDER 切换
TRANSLATION_PROVIDER = "gemini"

# OpenAI (备用)
# USE_OPENAI_TRANSLATION = "false"
# OPENAI_TRANSLATION_MODEL = "gpt-4o-mini"

# Gemini (当前使用)
# GEMINI_API_KEY 通过 secret 设置
GEMINI_TRANSLATION_MODEL = "gemini-2.0-flash-exp"

# Workers AI (备用)
ENABLE_WORKERS_AI = "false"
```

## 翻译流程

### 工作原理
```
字幕文本 (原始语言)
    ↓
Gemini API
    ↓
翻译文本 (目标语言)
    ↓
广播到所有客户端
    ↓
显示为 [EN] 或 [ZH] 标签
```

### API 调用示例
```typescript
// ChatRoom.server.ts 自动处理
// 发送到 Gemini:
{
  "contents": [{
    "parts": [{
      "text": "Translate to English: 你好世界"
    }]
  }],
  "generationConfig": {
    "temperature": 0.3,
    "maxOutputTokens": 200
  }
}

// Gemini 返回:
{
  "candidates": [{
    "content": {
      "parts": [{
        "text": "Hello World"
      }]
    }
  }]
}
```

## 支持的语言

翻译目标语言在 `WORKERS_AI_TRANSLATION_TARGET_LANGS` 中配置：

```toml
WORKERS_AI_TRANSLATION_TARGET_LANGS = "en,zh,ja,ko,es,fr,de"
```

### 常用语言代码
- `en` - English (英语)
- `zh` - Chinese (中文)
- `ja` - Japanese (日语)
- `ko` - Korean (韩语)
- `es` - Spanish (西班牙语)
- `fr` - French (法语)
- `de` - German (德语)
- `ru` - Russian (俄语)
- `ar` - Arabic (阿拉伯语)
- `pt` - Portuguese (葡萄牙语)

## 性能对比

| 提供商 | 质量 | 速度 | 成本 | 免费额度 |
|--------|------|------|------|----------|
| OpenAI | ⭐⭐⭐⭐⭐ | 1-2s | 高 | 少 |
| Gemini | ⭐⭐⭐⭐⭐ | 0.5-1s | 低 | **大** |
| Workers AI | ⭐⭐⭐ | 0.3-0.5s | 免费 | 无限 |

**推荐**: 
- 开发环境: **Gemini** (免费额度大)
- 生产环境: **Gemini** 或 **OpenAI** (取决于预算)

## 故障排除

### API Key 无效
```bash
# 确认 API key 格式正确
# Gemini API key 格式: AIzaSy...
echo $GEMINI_API_KEY
```

### 翻译不显示
1. 检查 `TRANSLATION_PROVIDER=gemini` 是否正确设置
2. 确认 `GEMINI_API_KEY` 已配置
3. 查看浏览器控制台和服务器日志
4. 确认目标语言在 `WORKERS_AI_TRANSLATION_TARGET_LANGS` 中

### 超出配额
```json
// 错误信息
{
  "error": {
    "code": 429,
    "message": "Resource has been exhausted"
  }
}
```

**解决方案**:
- 切换到 `gemini-1.5-flash` (更高配额)
- 升级到付费层
- 临时切换到 OpenAI 或 Workers AI

### 翻译质量不佳
- 尝试更高级模型: `gemini-1.5-pro`
- 调整 `temperature` 参数 (默认 0.3)
- 优化提示词 (在 ChatRoom.server.ts 中)

## 切换提供商

### 从 OpenAI 切换到 Gemini
```bash
# 更新 .dev.vars 或 wrangler.toml
TRANSLATION_PROVIDER=gemini
# USE_OPENAI_TRANSLATION=false  # 可选，向后兼容

# 添加 Gemini 配置
GEMINI_API_KEY=your_key
GEMINI_TRANSLATION_MODEL=gemini-2.0-flash-exp

# 重启服务
npm run dev
```

### 从 Workers AI 切换到 Gemini
```bash
# 更新配置
TRANSLATION_PROVIDER=gemini
ENABLE_WORKERS_AI=false

# 添加 Gemini 配置
GEMINI_API_KEY=your_key
GEMINI_TRANSLATION_MODEL=gemini-2.0-flash-exp
```

## 监控和日志

### 查看翻译日志
服务器端会自动记录：
```typescript
console.log('Translation provider:', translationProvider)
console.error('Translation error:', error)
```

### 监控 API 使用量
访问 [Google AI Studio](https://aistudio.google.com/) 查看：
- API 调用次数
- 配额使用情况
- 错误率

## 最佳实践

1. **开发环境**: 使用 Gemini (免费额度大)
2. **生产环境**: 
   - 小型应用: Gemini
   - 大型应用: 根据使用量选择 Gemini 或 OpenAI
3. **备份方案**: 配置多个提供商，可快速切换
4. **安全性**: 生产环境使用 Cloudflare Secrets 存储 API key
5. **监控**: 定期检查配额使用情况

## 资源链接

- [Google AI Studio](https://aistudio.google.com/)
- [Gemini API 文档](https://ai.google.dev/docs)
- [定价说明](https://ai.google.dev/pricing)
- [Gemini 模型对比](https://ai.google.dev/models/gemini)

## 支持

- Gemini 问题: [Google AI Support](https://ai.google.dev/support)
- 应用问题: 联系系统管理员
