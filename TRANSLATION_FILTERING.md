# Translation Language Filtering - 翻译语言过滤机制

> **🎉 新功能：动态语言池**  
> 系统现在支持**根据房间内用户的浏览器语言自动翻译**！无需手动配置，支持任意语言组合。  
> 详细说明请查看 [DYNAMIC_LANGUAGE_POOL.md](DYNAMIC_LANGUAGE_POOL.md)

## 工作原理

### 服务器端（Server-Side）

**✨ 新：动态语言池（推荐）**
服务器自动检测房间内用户的语言需求，只翻译这些语言：
```
用户A (浏览器: zh-CN) → 语言池: {zh}
用户B (浏览器: ja-JP) → 语言池: {zh, ja}
用户C (浏览器: en-US) → 语言池: {zh, ja, en}
    ↓
翻译成 {zh, ja, en} ← 自动适应用户需求
```

**传统：固定语言配置（降级方案）**
如果房间内没有用户（冷启动），使用配置的默认语言：
```toml
WORKERS_AI_TRANSLATION_TARGET_LANGS = "en,zh"
```

所有翻译版本都会广播给所有客户端，格式：
```
原文: "Hello world"
翻译1: "[EN] Hello world"
翻译2: "[ZH] 你好世界"
```

### 客户端（Client-Side）
每个用户根据自己的 `displayCaptionLanguage` 设置过滤显示：

| 设置 | 显示内容 | 说明 |
|------|----------|------|
| `all` | 原文 + [EN] + [ZH] | 显示所有语言 |
| `en` | 原文 + [EN] | 只显示英文字幕 |
| `zh` | 原文 + [ZH] | 只显示中文字幕 |
| `original` | 原文（无翻译标签） | 只显示原始语音 |
| `auto` | 自动选择 | 根据浏览器语言自动选择 en 或 zh |

## 为什么这样设计？

### ✅ 优点
1. **🌍 真正的国际化** - 支持任意语言组合（中文、英文、日文、韩文、西班牙文等）
2. **🤖 零配置** - 自动识别用户浏览器语言
3. **💰 成本优化** - 只翻译房间内需要的语言
4. **⚡ 智能清理** - 用户离开后自动移除不再需要的语言
5. **🎯 用户自主选择** - 每个人通过 `displayCaptionLanguage` 过滤显示
6. **🚀 快速切换** - 用户可随时改变显示语言，无需重新翻译

### 🎯 最佳实践
- **动态语言池（新）**：自动支持所有用户的语言需求
- **降级配置**：`en,zh` 作为冷启动默认值
- **成本可控**：通常 3-5 种语言，合理范围内

### 📊 成本对比

**场景1：2人中英会议**
- 动态语言池：2 次 API 调用（en, zh）
- 固定配置：2 次 API 调用（en, zh）
- **成本相同**

**场景2：5人多国会议（中、日、韩、英）**
- 动态语言池：4 次 API 调用（zh, ja, ko, en）
- 固定配置：2 次 API 调用（en, zh）—— **但日韩用户看不懂！**
- **动态方案更贵，但实现真正的国际化**

**场景3：10人单语言会议（全是中文用户）**
- 动态语言池：1 次 API 调用（zh）
- 固定配置：2 次 API 调用（en, zh）
- **动态方案更省钱！**

## 用户体验流程

**✨ 动态语言池流程：**
```
用户1 (浏览器语言: zh-CN)
  ↓ 连接时自动发送语言到服务器
  ↓ 服务器添加 'zh' 到语言池
  ↓ displayCaptionLanguage: auto
  ↓ 自动选择显示中文
  ↓ 看到: 原文 + [ZH] 翻译

用户2 (浏览器语言: en-US)
  ↓ 连接时自动发送语言到服务器
  ↓ 服务器添加 'en' 到语言池
  ↓ displayCaptionLanguage: auto
  ↓ 自动选择显示英文
  ↓ 看到: 原文 + [EN] 翻译

用户3 (浏览器语言: ja-JP)
  ↓ 连接时自动发送语言到服务器
  ↓ 服务器添加 'ja' 到语言池
  ↓ displayCaptionLanguage: auto
  ↓ 自动选择显示日文
  ↓ 看到: 原文 + [JA] 翻译

服务器翻译逻辑：
  ↓ 查询语言池: {zh, en, ja}
  ↓ 翻译成这3种语言
  ↓ 广播: 原文 + [EN] + [ZH] + [JA]
  ↓ 每个客户端根据设置过滤显示
```

**手动选择：**
```
用户4 (手动选择: all)
  ↓ displayCaptionLanguage: all
  ↓ 看到: 原文 + [EN] + [ZH] + [JA]  （所有翻译）
```

## 实现细节

### 客户端过滤逻辑
```typescript
// app/components/Participant.tsx
const shouldDisplayCaption = (text: string): boolean => {
  const langMatch = text.match(/^\[([A-Z]{2})\]\s/)
  
  if (displayCaptionLanguage === 'all') return true
  if (displayCaptionLanguage === 'original') return !langMatch
  
  if (displayCaptionLanguage === 'auto') {
    // 根据浏览器语言自动选择
    const browserLang = navigator.language.includes('zh') ? 'zh' : 'en'
    return !langMatch || langMatch[1].toLowerCase() === browserLang
  }
  
  return !langMatch || langMatch[1].toLowerCase() === displayCaptionLanguage
}
```

### 服务器端翻译逻辑
```typescript
// app/durableObjects/ChatRoom.server.ts
const targetLangs = ['en', 'zh']  // 从配置读取

for (const lang of targetLangs) {
  const translatedText = await translate(originalText, lang)
  
  // 广播带语言标签的翻译
  broadcastMessage({
    type: 'caption',
    text: `[${lang.toUpperCase()}] ${translatedText}`,
    isFinal: true
  })
}
```

## 配置示例

### 推荐配置（动态语言池）
```toml
TRANSLATION_PROVIDER = "gemini"
# 可选：降级默认语言（冷启动时使用）
WORKERS_AI_TRANSLATION_TARGET_LANGS = "en,zh"
```
✅ **零配置** - 系统自动根据用户浏览器语言翻译  
✅ **国际化** - 支持任意语言组合  
✅ **成本优化** - 只翻译需要的语言

### 传统配置（固定语言）
如果想强制翻译特定语言（忽略用户语言），可修改代码：
```typescript
// 不推荐：硬编码固定语言
getTargetLanguages(): string[] {
  return ['en', 'zh']  // 始终翻译这2种
}
```

### 关闭翻译
```toml
TRANSLATION_PROVIDER = "none"  # 或留空
```

## 实现状态

### ✅ 已实现：动态语言池（推荐）
**工作方式：根据房间内用户浏览器语言自动翻译**

**优点**：
- ✅ 支持任意语言组合
- ✅ 零配置，自动适应
- ✅ 成本可控（只翻译需要的语言）
- ✅ 智能清理（用户离开后释放资源）

**代码实现：**
```typescript
// 客户端自动发送语言
onOpen: () => {
  websocket.send({ type: 'setLanguage', language: navigator.language })
}

// 服务器维护语言池
roomLanguages: Set<string> = new Set()
getTargetLanguages() { return Array.from(this.roomLanguages) }
```

**详细文档：** [DYNAMIC_LANGUAGE_POOL.md](DYNAMIC_LANGUAGE_POOL.md)

---

### 未来优化方向

#### 可选方案1: 用户手动选择翻译语言
允许用户在UI中选择"我需要看英文和日文翻译"。

**优点**：精确控制，避免不需要的翻译  
**缺点**：需要额外UI，用户体验复杂  
**实现难度：** 中等

#### 可选方案2: 客户端翻译
在客户端直接调用翻译 API。

**优点**：每个用户独立控制  
**缺点**：需要暴露 API key，或使用代理服务；每个用户单独翻译（成本高）  
**实现难度：** 困难

#### 可选方案3: 语言数量限制
限制房间最多支持N种语言（例如5种），避免极端场景成本失控。

**优点**：成本可控  
**缺点**：部分用户可能看不到母语翻译  
**实现难度：** 简单

## 总结

**✨ 当前方案（动态语言池）：**
```
说话 → ASR识别 → 原文字幕
         ↓
   查询房间语言池
         ↓
  翻译成 {用户需要的语言}
         ↓
   广播所有版本
         ↓
   客户端根据设置过滤
         ↓
   用户看到需要的语言
```

**核心优势：**
- 🌍 **真正的国际化** - 自动支持任意语言组合
- 🤖 **零配置** - 系统自动识别用户语言
- 💰 **成本优化** - 只翻译房间内需要的语言
- ⚡ **智能管理** - 用户离开后自动清理
- 🎯 **用户友好** - 每个人看自己需要的语言

**配置建议：**
- 开发环境：`TRANSLATION_PROVIDER = "gemini"` （免费额度大）
- 生产环境：`TRANSLATION_PROVIDER = "openai"` 或 `"gemini"`
- 降级配置：`WORKERS_AI_TRANSLATION_TARGET_LANGS = "en,zh"` （冷启动时使用）

**详细文档：** [DYNAMIC_LANGUAGE_POOL.md](DYNAMIC_LANGUAGE_POOL.md)
