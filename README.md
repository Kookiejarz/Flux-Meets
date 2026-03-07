# Flux Meets 🎬

**Flux Meets** is a next-generation, AI-powered video conferencing platform built on Cloudflare's edge infrastructure. It delivers enterprise-grade real-time communication with end-to-end encryption, intelligent captions, and adaptive quality—all running serverlessly at the edge.

This project is an advanced fork of [Cloudflare/orange](https://github.com/cloudflare/orange), extensively enhanced with AI capabilities, adaptive streaming, and production-ready features.

![A screenshot showing a room in Orange Meets](orange-meets.png)

---

## 🌟 Key Features

### 🤖 AI-Powered Real-Time Captions

- **Cloud-Based Speech Recognition**: Powered by Cloudflare Workers AI (Deepgram Nova-3) or browser SpeechRecognition API
- **Multi-Language Translation**: Real-time translation to English, Chinese, Japanese, Korean, Spanish, French, German via OpenAI or Cloudflare Workers AI
- **Smart Deduplication**: Advanced similarity-based algorithm prevents duplicate captions
- **Intelligent Caption Routing**: Captions automatically follow the speaker's active tile (webcam or screenshare)
- **Draggable Positioning**: Freely position captions anywhere on screen with persistent storage
- **Automatic Language Detection**: Browser language detection with fallback to original transcripts
- **Smooth Animations**: Elegant slide-in effects with auto-fade after 3.5 seconds
- **Caption Filtering**: Filter by language (English, Chinese, All, or Auto-detect)

### 🔒 Enterprise-Grade Security

- **End-to-End Encryption (E2EE)**: MLS (Messaging Layer Security) protocol implementation
- **Insertable Streams API**: Hardware-accelerated encryption/decryption using WebRTC transforms
- **Safety Numbers**: Visual verification of encrypted sessions
- **Zero-Trust Architecture**: Media never touches the server in plaintext when E2EE is enabled
- **VP8 Codec Enforcement**: Optimized for E2EE performance

### 📡 Adaptive Streaming & Quality Control

- **Simulcast Support**: Dual-layer adaptive encoding that scales with user settings
  - High quality (rid 'a'): 80% of configured max bitrate @ user's framerate
  - Low quality (rid 'b'): 35% (max 1.2Mbps) @ 24fps, 2x downscale
  - Dynamically adjusts from default 2.5Mbps up to 8.5Mbps based on settings
- **Automatic Quality Switching**: Server-side bandwidth estimation adapts to network conditions
- **Configurable Encoding**: Per-user settings for bitrate (up to 8.5Mbps), framerate (up to 60fps), resolution (up to 1080p)
- **Screen Share Optimization**: Same adaptive encoding as webcam for consistent quality
- **Data Saver Mode**: Force low-bandwidth mode for mobile or constrained networks
- **Video Denoising**: Real-time noise reduction with MediaPipe Selfie Segmentation

### 💬 Collaboration Tools

- **Real-Time Text Chat**: Slide-out panel with message broadcasting
- **Screen Sharing**: High-quality desktop/tab sharing with caption overlay support
- **Raise Hand**: Non-verbal signaling for turn-taking
- **Audio-Only Mode**: Disable all video for bandwidth conservation
- **Meeting Timer**: Track session duration
- **Participant Management**: Mute controls and device selection

### 🎯 User Experience

- **Glassmorphism UI**: Modern dark theme with translucent elements
- **Responsive Design**: Full mobile and tablet support
- **Persistent Settings**: All preferences saved locally
- **Device Hot-Swap**: Change mic/camera mid-call without reconnecting
- **Background Blur**: Client-side video processing
- **Meeting History**: Persistent room state with database storage

### 🚀 Performance & Reliability

- **Edge-First Architecture**: Deployed globally on Cloudflare's 300+ PoP network
- **Sub-100ms Latency**: WebRTC SFU routing at the edge
- **Automatic Reconnection**: Resilient to network interruptions
- **Media Track Cleanup**: Proper resource management prevents mic/camera leaks
- **High Packet Loss Warnings**: Proactive network quality notifications
- **ICE Connection Monitoring**: Real-time connectivity status

---

## 🏗️ Architecture Overview

Orange Meets leverages a **serverless, edge-native architecture** that combines the best of modern web technologies:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Browser                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Remix UI   │  │   WebRTC     │  │  WebSocket   │           │
│  │   (React)    │  │   Tracks     │  │   (Party)    │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Cloudflare Edge Network                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Remix Server │  │ Calls (SFU)  │  │   Durable    │           │
│  │  (Worker)    │  │   WebRTC     │  │   Objects    │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                   │
│         ▼                 │                 ▼                   │
│  ┌──────────────┐         │         ┌─────────────────┐         │
│  │ Workers AI   │         │         │   D1 Database   │         │
│  │ (Deepgram)   │         │         │  (Room State)   │         │
│  └──────────────┘         │         └─────────────────┘         │
│                           │                                     │
│                           ▼                                     │
│                   ┌──────────────┐                              │
│                   │  TURN/STUN   │                              │
│                   │   Servers    │                              │
│                   └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

---

### Core Components

1. **Remix Framework** (Frontend + SSR)
   - React 18 with Server Components
   - Type-safe loaders and actions
   - Deployed as Cloudflare Worker
   - Global CDN with edge caching

2. **Cloudflare Calls** (WebRTC SFU)
   - Selective Forwarding Unit for media routing
   - Handles RTP packet forwarding at the edge
   - Supports simulcast and codec negotiation
   - TURN/STUN for NAT traversal

3. **Durable Objects** (Signaling + State)
   - Each room = one Durable Object instance
   - Persistent WebSocket connections
   - Message broadcasting (chat, captions, presence)
   - State coordination across participants

4. **PartyTracks** (WebRTC Abstraction)
   - RxJS-based observable streams
   - Automatic track management
   - Transceiver lifecycle handling
   - Clean separation of concerns

5. **Workers AI** (Speech Recognition)
   - Deepgram Nova-3 model for ASR
   - Streaming audio processing
   - Language detection and tagging
   - Falls back to browser SpeechRecognition

6. **D1 Database** (Persistence)
   - SQLite at the edge
   - Meeting history and transcripts
   - Room metadata storage

7. **E2EE Worker** (Encryption)
   - Rust-based MLS implementation (compiled to WASM)
   - Insertable Streams for encryption/decryption
   - Key exchange via MLS protocol

### Data Flow

**Media Path (WebRTC):**
```
Client A → RTCPeerConnection → Cloudflare Calls SFU → Client B
           (with Simulcast)            ↓
                               [Quality Selection]
                                       ↓
                                 Forwarded Track
```

**Signaling Path (WebSocket):**
```
Client → WebSocket → Durable Object → Broadcast → All Clients
                          ↓
                   [Message Types]
                    - chat
                    - caption
                    - userJoined/Left
                    - mute/unmute
                    - raiseHand
                    - e2eeMlsMessage
```

**Caption Path (AI):**

```
Microphone → MediaRecorder → Audio Chunks → Workers AI → Transcript → WebSocket Broadcast
                                              ↓
                                     [Language Detection]
                                              ↓
                                    [Translation (Optional)]
                                              ↓
                                   Tagged Caption [EN]/[ZH]
```

---

## 🚀 Quick Start

### Prerequisites

- **Cloudflare Account** (free tier works)
- **Node.js 18+** and npm
- **Rust toolchain** (optional, for E2EE worker)

### 1. Clone and Install

```bash
git clone https://github.com/Kookiejarz/Flux-Meets.git
cd Flux-Meets
npm install
```

### 2. Configure Cloudflare Services

#### A. Create Cloudflare Calls Application

1. Go to [Cloudflare Calls Dashboard](https://dash.cloudflare.com/?to=/:account/calls)
2. Create a new application
3. Note your `APP_ID` and `APP_SECRET`

#### B. Create D1 Database (Optional)

```bash
npx wrangler d1 create orange-meets-db
```

#### C. Enable Workers AI (Optional)

Workers AI is automatically available in your Cloudflare account. No separate setup needed.

### 3. Environment Configuration

Create a `.dev.vars` file in the project root:

```env
# Required: Cloudflare Calls credentials
CALLS_APP_ID=your_app_id_here
CALLS_APP_SECRET=your_app_secret_here

# Optional: OpenAI for translation and AI assistant
OPENAI_API_TOKEN=sk-...

OPENAI_MODEL_ID=gpt-4o-realtime-preview-2024-12-17
OPENAI_TRANSLATION_MODEL=gpt-4o-mini
```

### 4. Configure Features

Edit `wrangler.production.toml` (or create `wrangler.development.toml`):

```toml
# Video Quality Settings
MAX_WEBCAM_BITRATE = 8500000      # 8.5 Mbps max
MAX_WEBCAM_FRAMERATE = 60         # 60 fps max
MAX_WEBCAM_QUALITY_LEVEL = 1080   # 1080p max

# Enable Simulcast (adaptive quality)
EXPERIMENTAL_SIMULCAST_ENABLED = "true"

# AI Captions (Cloud-based, more accurate)
ENABLE_WORKERS_AI_ASR = "true"
WORKERS_AI_ASR_MODEL = "@cf/deepgram/nova-3"

# Translation (Option 1: OpenAI - Recommended)
USE_OPENAI_TRANSLATION = "true"
OPENAI_TRANSLATION_MODEL = "gpt-4o-mini"

# Translation (Option 2: Workers AI - Free but limited)
ENABLE_WORKERS_AI = "false"
WORKERS_AI_TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b"

# Target languages for translation (comma-separated)
WORKERS_AI_TRANSLATION_TARGET_LANGS = "en,zh"

# Optional: OpenAI Realtime AI Assistant
OPENAI_MODEL_ENDPOINT = ""
```

### 5. Database Migration (If using D1)

```bash
# Local development
npm run db:migrate:local

# Production
npm run db:migrate:production
```

### 6. Build E2EE Worker (Optional)

If you want E2EE support:

```bash
npm run build:e2ee-worker
```

### 7. Run Development Server

```bash
npm run dev
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787) in your browser.

### 8. Production Deployment

```bash
# Login to Cloudflare
npx wrangler login

# Set production secrets
echo "your_secret_here" | npx wrangler secret put CALLS_APP_SECRET
echo "sk-..." | npx wrangler secret put OPENAI_API_TOKEN

# Deploy
npm run deploy
```

---

## ⚙️ Configuration Reference

### Video Encoding Parameters

| Parameter | Default | Max (Production) | Description |
|-----------|---------|------------------|-------------|
| `MAX_WEBCAM_BITRATE` | 2,500,000 | 8,500,000 | Maximum bitrate in bps |
| `MAX_WEBCAM_FRAMERATE` | 24 | 60 | Maximum frames per second |
| `MAX_WEBCAM_QUALITY_LEVEL` | 1080 | 1080 | Maximum resolution height |

### Simulcast Layers (When Enabled)

| Layer | Resolution Scale | Bitrate | Framerate | Use Case |
|-------|-----------------|---------|-----------|----------|
| **rid: 'a'** | 1x (original) | 80% of user setting | User's setting | High quality, good network |
| **rid: 'b'** | 0.5x (2x downscale) | 35% (max 1.2Mbps) | Max 24 fps | Low bandwidth, data saver |

**With 8.5Mbps @ 60fps settings:**
- rid 'a': 6.8 Mbps @ 60fps  
- rid 'b': 1.2 Mbps @ 24fps

**With 2.5Mbps @ 30fps settings:**
- rid 'a': 2.0 Mbps @ 30fps  
- rid 'b': 0.875 Mbps @ 24fps

### AI Caption Models

**Cloudflare Workers AI (Recommended):**
- `@cf/deepgram/nova-3` - Most accurate, supports 37 languages
- Automatic language detection
- Low latency (~200-500ms)

**Browser SpeechRecognition (Fallback):**
- Free, no server cost
- Limited language support
- Privacy-friendly (local processing)
- Higher latency and lower accuracy

### Translation Models

**OpenAI (Best Quality):**
- `gpt-4.1-nano-2025-04-14` - Fast, cost-effective
- `gpt-4o` - Highest quality
- Supports 50+ languages
- Context-aware translation

**Cloudflare Workers AI (Free Tier):**

- `@cf/meta/m2m100-1.2b` - Basic translation
- Limited language pairs
- No context awareness

---

## 🎯 Usage Guide

### Starting a Meeting

1. Navigate to the homepage
2. Enter a room name (or use the random generated name)
3. Grant microphone and camera permissions
4. Click "Join Meeting"

### Caption Controls

- **Enable/Disable**: Click the CC button in the toolbar
- **Language Filter**: Click CC dropdown → Select "English", "Chinese", "All", or "Auto"
- **Reposition**: Drag the caption box to your preferred location
- **Translation**: Automatically appears if configured in `wrangler.toml`

### Quality Settings

1. Click **Settings** (⚙️ icon)
2. Adjust **Video Quality** slider (360p - 1080p)
3. Set **Max Bitrate** (500 kbps - 8.5 Mbps)
4. Set **Max Framerate** (15 - 60 fps)
5. Toggle **Video Denoise** for background blur

### Screen Sharing

1. Click **Share Screen** button
2. Select window/tab/entire screen
3. Captions automatically move to screenshare tile
4. Adaptive encoding continues to work

### Data Saver Mode

- Enable to force low-quality layer (rid 'b')
- Reduces bandwidth by ~60-70%
- Useful for mobile networks or limited data

---

## 🔧 Development

### Project Structure

```
orange/
├── app/
│   ├── components/          # React components
│   │   ├── CaptionDisplay.tsx
│   │   ├── Participant.tsx
│   │   ├── ChatPanel.tsx
│   │   └── ...
│   ├── hooks/              # Custom React hooks
│   │   ├── useUserMedia.ts
│   │   ├── useSpeechToText.ts
│   │   └── ...
│   ├── routes/             # Remix routes
│   │   ├── _room.tsx
│   │   └── ...
│   ├── utils/              # Utilities
│   │   ├── e2ee.ts
│   │   └── ...
│   ├── durableObjects/     # Cloudflare Durable Objects
│   │   └── ChatRoom.server.ts
│   └── types/              # TypeScript types
├── public/                 # Static assets
│   └── e2ee/              # E2EE worker (WASM)
├── rust-mls-worker/        # Rust E2EE implementation
├── migrations/             # D1 database migrations
├── wrangler.*.toml        # Cloudflare configuration
└── package.json
```

### Key Files

- **[app/components/Participant.tsx](app/components/Participant.tsx)** - Caption handling, deduplication, routing
- **[app/routes/_room.tsx](app/routes/_room.tsx)** - Encoding parameters, simulcast configuration
- **[app/durableObjects/ChatRoom.server.ts](app/durableObjects/ChatRoom.server.ts)** - WebSocket message handling, AI caption processing
- **[app/utils/e2ee.ts](app/utils/e2ee.ts)** - E2EE setup and encryption transforms
- **[app/hooks/useUserMedia.ts](app/hooks/useUserMedia.ts)** - Media device management

### Testing

```bash
# Type checking
npm run typecheck

# Unit tests
npm test

# E2E tests
npm run test:e2e

# Linting
npm run lint

# All checks
npm run check
```

### Debugging

**Enable verbose logging:**

Open browser console and look for:
- `[SpeechToText]` - Speech recognition events
- `[Caption]` - Caption processing
- `🛑` - Media track cleanup
- `📬/📨` - E2EE message exchange

**Check Workers AI logs:**

```bash
npx wrangler tail
```

**Inspect D1 Database:**

```bash
npm run db:studio:local
```

---

## 🎯 Advanced Features

### Caption Deduplication Algorithm

Orange Meets implements a sophisticated similarity-based deduplication system:

```typescript
// Normalize text for comparison (remove punctuation, tags, whitespace)
const normalize = (text: string) => 
  text.replace(/\[(EN|ZH|JA|KO|ES|FR|DE)\]/gi, '')
      .replace(/[.,!?;:]/g, '')
      .toLowerCase()
      .trim()

// Check if captions are similar
const isSimilar = (existing: string, incoming: string) => {
  const norm1 = normalize(existing)
  const norm2 = normalize(incoming)
  
  // Incoming is a prefix of existing (ASR convergence)
  if (norm1.startsWith(norm2)) return true
  
  // Existing is contained in incoming (expansion)
  if (norm2.includes(norm1)) return true
  
  return false
}
```

**Convergence Logic:**
- Unfinished captions stay at the bottom (newest position)
- Final captions replace similar unfinished ones
- Maximum 2 captions displayed simultaneously
- Auto-fade after 3.5 seconds

### Caption Routing for Screen Share

When a user shares their screen, captions intelligently route to the screenshare tile:

```typescript
// Extract owner from screenshare ID (removes "_screenshare" suffix)
const ownerUserId = participant.id.replace(/_screenshare$/, '')

// Show captions on screenshare tile if user is sharing
const shouldShowCaptionsOnThisTile = 
  isScreenShare ? user.tracks.screenShareEnabled : !user.tracks.screenShareEnabled
```

### Adaptive Encoding Pipeline

**Webcam Encoding:**
```typescript
// Simulcast: Two quality layers
[
  { rid: 'a', maxBitrate: 1_800_000, maxFramerate: 30 },      // High
  { rid: 'b', maxBitrate: 700_000, maxFramerate: 24, scaleResolutionDownBy: 2 }  // Low
]

// Single-layer: User-configured
[
  { 
    maxBitrate: userSettings.bitrate,
    maxFramerate: userSettings.framerate,
    scaleResolutionDownBy: dynamicScaling
  }
]
```

**Screen Share Encoding:**
- Uses same adaptive parameters as webcam
- Adjusts bitrate based on user settings
- Supports full framerate (up to 60fps if configured)

### Media Device Lifecycle

**Proper Cleanup:**
```typescript
class NativeMediaDevice {
  currentTrack: MediaStreamTrack
  originalTrack: MediaStreamTrack  // Before processing
  sourceStream: MediaStream
  
  stopCurrentTrack() {
    // Stop both processed and original tracks
    this.currentTrack?.stop()
    this.originalTrack?.stop()
    this.sourceStream?.getTracks().forEach(t => t.stop())
  }
}
```

**Prevents:**
- Microphone staying active after leaving meeting
- Camera indicator staying on
- Memory leaks from unreleased tracks

### Speech Recognition Hardening

```typescript
// Guard against restart after unmount
const unmountedRef = useRef(false)
const restartTimerRef = useRef<NodeJS.Timeout>()

useEffect(() => {
  return () => {
    unmountedRef.current = true
    clearTimeout(restartTimerRef.current)
    recognition.stop()
    recognitionRef.current = null  // Prevent reuse
  }
}, [])
```

**Prevents:**
- Speech recognition continuing after leaving room
- Multiple recognition instances
- Event listener leaks

---

## 📊 Performance Metrics

### Latency Targets

| Metric | Target | Typical |
|--------|--------|---------|
| **Glass-to-glass latency** | < 500ms | 200-400ms |
| **Caption generation** | < 1s | 500-800ms |
| **Translation** | < 2s | 1-1.5s |
| **Join time** | < 3s | 1-2s |

### 📈 Bandwidth Usage

| Scenario | Simulcast High | Simulcast Low | Single Layer |
|----------|---------------|---------------|--------------|
| **Video only (8.5Mbps setting)** | 6.8 Mbps | 1.2 Mbps | User-configured |
| **+ Audio** | +128 kbps | +128 kbps | +128 kbps |
| **+ Screen share** | +6.8 Mbps | +1.2 Mbps | +User-configured |
| **Data Saver Mode** | N/A | 1.2 Mbps | Force lowest |

### Scalability

- **Max participants**: Limited by SFU (typically 50-100)
- **Max simultaneous rooms**: Unlimited (Durable Objects auto-scale)
- **Caption throughput**: 1000+ captions/second per Durable Object
- **Database writes**: Batched, async (no blocking)

---

## 🔒 Security Considerations

### E2EE Implementation

**MLS Protocol:**
- Group key agreement protocol
- Forward secrecy (past compromises don't affect future sessions)
- Post-compromise security (future messages secured after key refresh)
- Identity verification via safety numbers

**Encryption Flow:**
```
Raw RTP Packet → Encode → Insertable Stream → Encrypt (Worker) → Encrypted Packet → Network
```

**Key Points:**
- Media never leaves the client in plaintext
- Server only routes encrypted packets
- Safety numbers allow verification of participants
- Requires VP8 codec (for frame-level encryption)

### Privacy Features

- **No server-side recording** (unless explicitly enabled)
- **Ephemeral chat** (not persisted by default)
- **Local caption positioning** (stored in localStorage only)
- **Optional telemetry** (can be disabled)

### API Security

- **CORS configured** for your domain only
- **Rate limiting** on Durable Object writes
- **Input validation** on all WebSocket messages
- **Token-based auth** for Cloudflare Calls API

---

## 🌐 Browser Support

| Browser | Video | Audio | Screen Share | E2EE | Captions |
|---------|-------|-------|--------------|------|----------|
| **Chrome 90+** | ✅ | ✅ | ✅ | ✅ | ✅ (Workers AI + Browser) |
| **Firefox 90+** | ✅ | ✅ | ✅ | ✅ | ✅ (Workers AI + Browser) |
| **Safari 15+** | ✅ | ✅ | ✅ | ✅ | ✅ (Workers AI only) |
| **Edge 90+** | ✅ | ✅ | ✅ | ✅ | ✅ (Workers AI + Browser) |
| **Mobile Safari** | ✅ | ✅ | ❌ | ✅ | ✅ (Workers AI only) |
| **Mobile Chrome** | ✅ | ✅ | ❌ | ✅ | ✅ (Workers AI + Browser) |

**Notes:**
- E2EE requires `RTCRtpScriptTransform` or `createEncodedStreams` support
- Browser captions use Web Speech API (limited languages)
- Mobile screen share not supported by browsers

---

## 🐛 Troubleshooting

### Captions Not Appearing

1. Check if Workers AI is enabled in `wrangler.toml`:
   ```toml
   ENABLE_WORKERS_AI_ASR = "true"
   ```
2. Verify microphone permissions are granted
3. Check browser console for `[SpeechToText]` errors
4. Try toggling CC button off and on

### Video Quality Issues

1. Check network connection (Settings → Connection Indicator)
2. Lower quality settings (Settings → Video Quality)
3. Enable Data Saver Mode
4. Disable simulcast if experiencing issues:
   ```toml
   EXPERIMENTAL_SIMULCAST_ENABLED = "false"
   ```

### E2EE Not Working

1. Ensure E2EE worker is built: `npm run build:e2ee-worker`
2. Check that all participants have compatible browsers
3. Verify safety numbers match across participants
4. Clear browser cache and rejoin

### Microphone Stays Active

- This should be fixed in the current version
- If occurring, check console for `🛑 Stopping` logs
- Hard refresh the page (Cmd+Shift+R / Ctrl+Shift+F5)

### High Latency

1. Check physical location vs. nearest Cloudflare PoP
2. Verify TURN servers are accessible (check network logs)
3. Disable VPN if active
4. Try different network (mobile vs. WiFi)

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines

- Follow existing code style (Prettier + ESLint configured)
- Add TypeScript types for all new code
- Write tests for new features
- Update documentation for user-facing changes
- Run `npm run check` before committing

---

## 📚 Additional Resources

- **[Cloudflare Calls Documentation](https://developers.cloudflare.com/calls/)**
- **[Durable Objects Guide](https://developers.cloudflare.com/durable-objects/)**
- **[Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)**
- **[WebRTC API Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)**
- **[MLS Protocol Spec](https://messaginglayersecurity.rocks/)**

---

## 📝 License

This project is a modified fork of **[Cloudflare Orange](https://github.com/cloudflare/orange)**.

Massive credit to the Cloudflare team for providing the incredible foundation, architecture, and WebRTC abstractions that make this project possible.

All modifications and enhancements are provided under the same license as the original project.

---

## 🎉 Acknowledgments

- **Cloudflare** for the original Orange Meets codebase and infrastructure
- **PartyKit** team for the excellent WebRTC abstractions
- **Deepgram** for the Nova-3 ASR model
- **OpenAI** for GPT models used in translation
- **The WebRTC community** for continuous innovation

---

**Built with ❤️ using Cloudflare's edge platform**

Licensed under the same terms as the original repository (Apache License 2.0).
