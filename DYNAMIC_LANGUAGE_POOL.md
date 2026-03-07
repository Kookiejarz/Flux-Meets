# 动态语言池 - Dynamic Language Pool

## 概述

动态语言池功能允许系统根据房间内用户的实际语言需求，自动调整翻译目标语言，实现真正的国际化支持。

## 工作原理

### 1. 用户加入流程
```
用户打开网页
    ↓
检测浏览器语言 (navigator.language)
    ↓
WebSocket 连接建立
    ↓
发送 { type: 'setLanguage', language: 'zh-CN' }
    ↓
服务器添加到语言池
```

### 2. 语言池管理
```typescript
// 服务器维护两个数据结构
roomLanguages: Set<string>           // 房间内所有需要的语言 {'en', 'zh', 'ja'}
userLanguageMap: Map<userId, lang>   // 用户到语言的映射
```

### 3. 智能翻译
```
说话 → ASR识别 → 原文字幕
         ↓
    查询动态语言池
         ↓
   翻译成 {'en', 'zh', 'ja'}  ← 仅翻译房间内需要的语言
         ↓
   广播所有版本
         ↓
   客户端过滤显示
```

### 4. 用户离开清理
```
用户离开
    ↓
from userLanguageMap remove user
    ↓
检查是否还有其他用户需要该语言
    ↓
if no → from roomLanguages remove language
```

## 优势对比

### 传统方案（固定 en,zh）
- ❌ 只支持中英文
- ❌ 日语、韩语、西班牙语用户无法获得翻译
- ✅ 成本固定（2次API调用）

### 动态语言池
- ✅ 支持任意语言组合
- ✅ 真正的国际化
- ✅ 成本随需扩展（3-5种语言，合理范围）
- ✅ 无需配置，自动适应

## 支持的语言

系统会自动识别浏览器语言代码（取前两位），例如：

| 浏览器语言 | 提取代码 | 翻译目标 |
|-----------|---------|---------|
| `zh-CN` | `zh` | 中文 |
| `en-US` | `en` | 英文 |
| `ja-JP` | `ja` | 日语 |
| `ko-KR` | `ko` | 韩语 |
| `es-ES` | `es` | 西班牙语 |
| `fr-FR` | `fr` | 法语 |
| `de-DE` | `de` | 德语 |
| `pt-BR` | `pt` | 葡萄牙语 |
| `it-IT` | `it` | 意大利语 |
| `ru-RU` | `ru` | 俄语 |

## 实现细节

### 客户端
```typescript
// app/hooks/useRoom.ts
onOpen: () => {
  // 获取浏览器语言
  const browserLanguage = navigator.language || 'en'
  
  // 发送到服务器
  websocket.send(
    JSON.stringify({ 
      type: 'setLanguage', 
      language: browserLanguage 
    })
  )
}
```

### 服务器端
```typescript
// app/durableObjects/ChatRoom.server.ts

// 1. 添加用户语言
addUserLanguage(userId: string, language: string) {
  const langCode = language.toLowerCase().split('-')[0]
  this.userLanguageMap.set(userId, langCode)
  this.roomLanguages.add(langCode)
}

// 2. 获取翻译目标语言
getTargetLanguages(): string[] {
  if (this.roomLanguages.size > 0) {
    return Array.from(this.roomLanguages)  // 动态语言池
  }
  return ['en', 'zh']  // 降级到默认配置
}

// 3. 移除用户语言
removeUserLanguage(userId: string) {
  const userLang = this.userLanguageMap.get(userId)
  if (userLang) {
    this.userLanguageMap.delete(userId)
    
    // 检查是否还有其他用户需要这个语言
    const stillNeeded = Array.from(this.userLanguageMap.values()).includes(userLang)
    if (!stillNeeded) {
      this.roomLanguages.delete(userLang)  // 清理不再需要的语言
    }
  }
}
```

### 翻译逻辑
```typescript
// 使用动态语言池
const targetLangs = this.getTargetLanguages()

for (const lang of targetLangs) {
  const translatedText = await translate(originalText, lang)
  this.broadcastMessage({
    type: 'caption',
    userId: connection.id,
    text: `[${lang.toUpperCase()}] ${translatedText}`,
    isFinal: true,
  })
}
```

## 使用场景示例

### 场景1：中英会议
```
用户A (浏览器: zh-CN)  →  语言池: {zh}
    ↓
用户B (浏览器: en-US)  →  语言池: {zh, en}
    ↓
说话: "Hello world"
    ↓
翻译成: [EN] Hello world
       [ZH] 你好世界
    ↓
成本: 2次 API 调用
```

### 场景2：多国会议
```
用户A (浏览器: zh-CN)  →  语言池: {zh}
用户B (浏览器: ja-JP)  →  语言池: {zh, ja}
用户C (浏览器: ko-KR)  →  语言池: {zh, ja, ko}
用户D (浏览器: en-US)  →  语言池: {zh, ja, ko, en}
    ↓
说话: "こんにちは"
    ↓
翻译成: [EN] Hello
       [ZH] 你好
       [JA] こんにちは
       [KO] 안녕하세요
    ↓
成本: 4次 API 调用
```

### 场景3：用户离开优化
```
初始: 用户A(zh), 用户B(ja), 用户C(ja)
语言池: {zh, ja}
    ↓
用户B 离开 (ja 还有 C 在用)
语言池: {zh, ja}  ← 不变
    ↓
用户C 离开 (ja 没人用了)
语言池: {zh}  ← 自动清理
    ↓
节省成本: 每次翻译少1次 API 调用
```

## 成本分析

### 翻译成本计算
```
成本 = 字幕数量 × 语言种类 × API单价
```

### 实际场景预估
| 房间人数 | 平均语言种类 | 每分钟字幕 | 每分钟成本 |
|---------|------------|-----------|-----------|
| 2-3人 | 2种 (en,zh) | 60条 | 120次调用 |
| 5-8人 | 3种 (en,zh,ja) | 60条 | 180次调用 |
| 10+人 | 4种 | 60条 | 240次调用 |

### 成本对比
**OpenAI (gpt-5-nano)**: $0.02 / 1M tokens  
**Gemini (gemini-2.0-flash)**: 免费额度 1500次/天

对于大多数场景，使用 Gemini 完全免费！

## 配置说明

### 默认行为（推荐）
无需任何配置，系统自动根据用户浏览器语言翻译。

```toml
# wrangler.toml
TRANSLATION_PROVIDER = "gemini"  # 推荐使用 Gemini（免费额度大）
```

### 降级配置
如果房间内没有用户（冷启动），会使用默认语言：

```toml
WORKERS_AI_TRANSLATION_TARGET_LANGS = "en,zh"  # 降级默认值
```

### 强制固定语言（不推荐）
如果想始终翻译特定语言（忽略用户语言），可以修改代码：

```typescript
// 不推荐：硬编码固定语言
getTargetLanguages(): string[] {
  return ['en', 'zh', 'ja']  // 始终翻译这3种
}
```

## 调试和监控

### 查看日志
```javascript
// 用户语言添加日志
{
  eventName: 'userLanguageAdded',
  userId: 'abc123',
  language: 'ja',
  roomLanguages: ['en', 'zh', 'ja']
}

// 语言移除日志
{
  eventName: 'languageRemovedFromRoom',
  language: 'ja',
  roomLanguages: ['en', 'zh']
}
```

### 测试不同语言
在浏览器开发者工具中模拟不同语言：

```javascript
// Chrome DevTools → Console
Object.defineProperty(navigator, 'language', {
  get: () => 'ja-JP'  // 模拟日语浏览器
})
```

或者修改浏览器语言设置：
- Chrome: `chrome://settings/languages`
- Firefox: `about:preferences#general` → Languages
- Safari: 系统偏好设置 → Language & Region

## FAQ

### Q: 如果房间内有10个人都说不同语言？
A: 系统会翻译所有10种语言。成本会增加，但这是极端场景。实际情况中，通常3-5种语言已经足够。

### Q: 可以限制最多支持几种语言吗？
A: 可以修改 `getTargetLanguages()` 添加限制：
```typescript
getTargetLanguages(): string[] {
  const languages = Array.from(this.roomLanguages)
  return languages.slice(0, 5)  // 最多5种
}
```

### Q: 如何关闭动态语言池，使用固定语言？
A: 修改 `getTargetLanguages()` 直接返回固定列表：
```typescript
getTargetLanguages(): string[] {
  return ['en', 'zh']  // 固定中英文
}
```

### Q: 用户可以手动选择翻译语言吗？
A: 客户端的 `displayCaptionLanguage` 设置决定显示哪种语言：
- `all`: 显示所有翻译
- `en`: 只显示英文
- `zh`: 只显示中文
- `auto`: 根据浏览器语言自动选择

### Q: 性能影响？
A: 语言池使用 `Set` 和 `Map`，查询和更新都是 O(1) 操作，性能开销可忽略。

## 总结

动态语言池是真正的国际化解决方案：
- ✅ **零配置** - 自动识别用户语言
- ✅ **智能优化** - 只翻译需要的语言
- ✅ **成本可控** - 根据实际需求扩展
- ✅ **自动清理** - 用户离开后释放资源
- ✅ **全球支持** - 支持任意语言组合

相比固定 `en,zh` 的方案，动态语言池让您的应用真正面向全球用户！
