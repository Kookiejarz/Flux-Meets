# Assembly AI Cloud Caption Setup

This guide explains how to integrate Assembly AI as a second cloud CC (closed caption) option alongside Workers AI.

## Overview

Assembly AI provides high-quality speech-to-text transcription with:
- **Universal-3 Pro**: Real-time streaming transcription model
- **Automatic Language Detection**: Auto-detect transcription language
- **High Accuracy**: Enterprise-grade speech recognition
- **Streaming Support**: Process audio in real-time chunks

## Prerequisites

1. **Assembly AI Account**: Sign up at [https://www.assemblyai.com/dashboard](https://www.assemblyai.com/dashboard)
2. **API Key**: Get your API key from the Assembly AI dashboard
3. **Payment Method**: Set up a credit card for your Assembly AI account

## Configuration

### Step 1: Set Environment Variables

Add the following variables to your Wrangler configuration file (e.g., `wrangler.production.toml`, `wrangler.staging.toml`, or `wrangler.development.toml`):

```toml
# Choose ASR provider: "workers-ai" or "assembly-ai"
ASR_PROVIDER = "assembly-ai"

# Assembly AI configuration
ASSEMBLY_AI_API_KEY = "your_assembly_ai_api_key_here"
ASSEMBLY_AI_ASR_MODEL = "u3-rt-pro"  # Universal-3 Pro streaming model
```

### Step 2: Environment Configuration Per Environment

#### Development (wrangler.development.toml)
```toml
ASR_PROVIDER = "workers-ai"  # Use Workers AI for development (free)
# ASSEMBLY_AI_API_KEY = ""  # Comment out or leave empty
# ASSEMBLY_AI_ASR_MODEL = ""
```

#### Staging (wrangler.staging.toml)
```toml
ASR_PROVIDER = "assembly-ai"  # Test Assembly AI in staging
ASSEMBLY_AI_API_KEY = "your_api_key"
ASSEMBLY_AI_ASR_MODEL = "u3-rt-pro"
```

#### Production (wrangler.production.toml)
```toml
ASR_PROVIDER = "assembly-ai"  # Use Assembly AI in production
ASSEMBLY_AI_API_KEY = "your_api_key"  # Use Cloudflare Secrets
ASSEMBLY_AI_ASR_MODEL = "u3-rt-pro"
```

### Step 3: Use Cloudflare Secrets (Production)

Instead of storing the API key directly in the config file, use Cloudflare Secrets:

```bash
# Set the secret via Wrangler CLI
wrangler secret put ASSEMBLY_AI_API_KEY
# Enter your API key when prompted
```

Then reference it in your config without quotes:
```toml
ASSEMBLY_AI_API_KEY = "your_secret_reference"
```

## User Interface

### Selecting Assembly AI as ASR Source

In the Settings dialog during a meeting:

1. Click **Settings** (gear icon)
2. Under **ASR Source**, select **Assembly AI**
   - **Browser**: Local browser-based transcription
   - **Workers AI**: Cloudflare's speech-to-text (fast, cost-effective)
   - **Assembly AI**: Third-party high-accuracy transcription

The selected provider will be used for real-time captions in the meeting.

## How It Works

### Audio Processing Flow

```
Client (Browser)
    ↓ (audio chunks via WebSocket)
    ↓
Server (Durable Object: ChatRoom)
    ↓ (ASR_PROVIDER determines handler)
    ├─ Workers AI Handler: Direct Cloudflare Workers AI call
    └─ Assembly AI Handler:
        1. Upload audio chunk to Assembly AI
        2. Submit transcription request
        3. Poll for results (max 30 seconds)
        4. On completion, broadcast caption
    ↓
Broadcast Caption Message
    ↓
All Clients (receive and display caption)
```

### Server-Side Implementation

The server automatically selects the appropriate ASR provider based on `ASR_PROVIDER`:

```typescript
const asrProvider = this.env.ASR_PROVIDER || 'workers-ai'

if (asrProvider === 'assembly-ai') {
    await this.handleAssemblyAiAudioChunk(connection, data)
} else {
    await this.handleWorkersAiAudioChunk(connection, data)
}
```

## Pricing Comparison

### Workers AI (Cloudflare)
- **Free tier**: 30 requests/minute
- **Paid**: $0.001 per audio minute
- **Latency**: Sub-500ms globally
- **Language Support**: 99+ languages

### Assembly AI
- **Pricing**: Varies by model (~$0.13 per hour)
- **High Accuracy**: Enterprise-grade (~95% accuracy)
- **Rich Features**: Speaker diarization, entity detection
- **Streaming**: Real-time results
- **Language Support**: 99+ languages

## Available Models

### Assembly AI Speech Models

- **`u3-rt-pro`** (Recommended): Universal-3 Pro - highest accuracy for real-time
  - Best for production use
  - ~95% accuracy
  - Low latency

- **`u3-rt`**: Universal-3 Real-Time
  - Balanced accuracy and speed
  - Streaming available

- **`u3`**: Universal-3 Batch
  - Highest accuracy, but for batch processing

## Troubleshooting

### Assembly AI API Key Not Working

1. Verify API key is correct in dashboard
2. Check if credit card is set up and valid
3. Ensure API key has correct permissions
4. Test with a simple curl request:
   ```bash
   curl -H "Authorization: YOUR_API_KEY" https://api.assemblyai.com/v2/transcript
   ```

### Slow Transcription

- Assembly AI polling has a 30-second timeout
- If audio chunks are very large, consider splitting them
- Check your network connection to Assembly AI servers
- Monitor API limits and rate-limit errors

### No Captions Appearing

1. Verify `ASR_PROVIDER = "assembly-ai"` is set
2. Check browser console for errors
3. Verify audio is being captured and sent to server
4. Check server logs for Assembly AI API errors
5. Ensure `asrSource` is set to "Assembly AI" in Settings

### Language Detection Issues

- Assembly AI auto-detects language (`language_code: 'auto'`)
- For specific language, modify in `ChatRoom.server.ts` line ~490:
  ```typescript
  language_code: 'en'  // or 'zh', 'es', etc.
  ```

## Performance Tuning

### Polling Interval
Default: 1 second with max 30 attempts (30 seconds total)
Adjust in `ChatRoom.server.ts`:
```typescript
await new Promise((resolve) => setTimeout(resolve, 1000)) // 1 second interval
const maxPollAttempts = 30 // Max attempts
```

### Audio Chunk Size
Larger chunks = more processing time but fewer API calls
- Current: Uses WebM buffer from browser
- Consider buffering multiple chunks for batch submission

## Migration from Workers AI

### Step 1: Update Config
```toml
# Change ASR_PROVIDER
ASR_PROVIDER = "assembly-ai"
ASSEMBLY_AI_API_KEY = "your_key"
```

### Step 2: Optional - Keep Workers AI as Fallback
You can implement a fallback mechanism that tries Assembly AI first, then Workers AI on failure. This is not implemented by default but can be added.

### Step 3: Test Gradually
1. Enable in staging environment first
2. Test with real users
3. Monitor accuracy and latency
4. Gradually roll out to production

## Advanced Configuration

### Multiple ASR Providers

To support multiple providers per environment:

1. Update `Env.ts` to accept multiple configurations
2. Modify `handleAudioChunk` to support dynamic provider selection per user
3. Store user preference in connection session

Example:
```typescript
const userProvider = await this.ctx.storage.get<string>(
    `user-asr-provider-${connection.id}`
) || this.env.ASR_PROVIDER
```

### Custom Translation

After Assembly AI transcription, apply custom translation:

```typescript
// Automatic translation is already enabled with:
translate: true

// Modify WORKERS_AI_TRANSLATION_TARGET_LANGS for output languages:
WORKERS_AI_TRANSLATION_TARGET_LANGS = "en,zh,ja"
```

## References

- Assembly AI Docs: https://www.assemblyai.com/docs
- Streaming API: https://www.assemblyai.com/docs/getting-started/transcribe-streaming-audio
- LLM Gateway: https://www.assemblyai.com/docs/llm-gateway/overview
- Model Selection: https://www.assemblyai.com/docs/speech-to-text/universal-streaming

## Support

For Assembly AI support: https://www.assemblyai.com/contact/support
For this application support: Contact your system administrator
