# Translation Providers Comparison

## Quick Overview

Three translation providers are now available for real-time caption translation:

| Provider | Quality | Speed | Cost | Free Tier | Best For |
|----------|---------|-------|------|-----------|----------|
| **OpenAI** | ⭐⭐⭐⭐⭐ | 1-2s | $$$$ | Limited | Production with budget |
| **Gemini** | ⭐⭐⭐⭐⭐ | 0.5-1s | $ | **Generous** | **Recommended** |
| **Workers AI** | ⭐⭐⭐ | 0.3-0.5s | Free | Unlimited | Basic needs |

## Configuration

### OpenAI
```toml
TRANSLATION_PROVIDER = "openai"
USE_OPENAI_TRANSLATION = "true"
OPENAI_TRANSLATION_MODEL = "gpt-4.1-nano-2025-04-14"
```

### Gemini (Recommended)
```toml
TRANSLATION_PROVIDER = "gemini"
GEMINI_API_KEY = "your_key"  # Get from https://aistudio.google.com/apikey
GEMINI_TRANSLATION_MODEL = "gemini-2.0-flash-exp"
```

### Workers AI
```toml
TRANSLATION_PROVIDER = "workers-ai"
ENABLE_WORKERS_AI = "true"
WORKERS_AI_TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b"
```

## Recommendations

### Development
✅ **Gemini** - Large free tier (1500 requests/min)

### Production (Small/Medium)
✅ **Gemini** - Best value, excellent quality

### Production (Large Scale)
✅ **OpenAI** or **Gemini** - Depends on budget and requirements

### Budget-Conscious
✅ **Workers AI** - Completely free, acceptable quality

## Setup Guides

- **Gemini**: See [GEMINI_TRANSLATION_SETUP.md](GEMINI_TRANSLATION_SETUP.md)
- **Assembly AI (ASR)**: See [ASSEMBLY_AI_SETUP.md](ASSEMBLY_AI_SETUP.md)
- **General Setup**: See [README.md](README.md)

## Switching Providers

Simply change `TRANSLATION_PROVIDER` in your config:

```bash
# .dev.vars or wrangler.toml
TRANSLATION_PROVIDER=gemini  # or openai, workers-ai
```

No code changes needed! Restart your dev server and you're done.
