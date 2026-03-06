# Flux Meet

Flux Meet is a modern, high-performance video conferencing application showcasing the power of WebRTC combined with serverless edge computing.

This project is a heavily enhanced and customized fork of [Cloudflare/orange](https://github.com/cloudflare/orange) (originally named "Orange Meets"), demonstrating advanced real-time communication patterns.

![A screenshot showing a room in Flux Meet](orange-meets.png)

## ✨ Features & Enhancements

Flux Meet retains all the core features of the original Orange Meets while introducing significant UI/UX improvements and new collaboration tools:

### New in Flux Meet

- **Modernized UI/UX**: Completely overhauled meeting room interface with a sleek, dark-themed, glassmorphism-inspired design. Rounded participant cells, translucent floating badges, and inner glow effects.
- **Interactive Chat Panel**: A brand-new slide-out text chat panel powered by `framer-motion` for smooth animations.
  - Real-time message broadcasting to all participants.
  - Automatic link parsing and click-to-open functionality using `linkify-react`.
  - Distinct styling for sent vs. received messages with timestamps.
- **Draggable Live Captions (CC)**: AI-generated speech-to-text captions can now be freely dragged around the screen to suit your layout preferences, powered by `@dnd-kit`. Your preferred caption position is remembered across sessions!
- **Improved Mobile Compatibility**: Better touch handling for draggable elements and fluid responsive layouts for varying screen sizes.
- **Enhanced Device Selection**: Fixed known iOS Safari WebRTC issues regarding microphone/camera enumeration and permissions, ensuring a seamless join experience on mobile.

### Core Capabilities (Inherited from Cloudflare Calls)

- **Real-time Video & Audio**: Ultra-low latency communication powered by Cloudflare Calls (WebRTC SFU).
- **End-to-End Encryption (E2EE)**: Optional E2EE support for secure, private conversations.
- **AI Integration**: Invite an OpenAI Realtime Voice AI agent directly into your call for live translation, meeting summarization, or interactive assistance.
- **Screen Sharing**: High-quality screen and tab sharing.
- **Network Resilience**: Simulcast support and adaptive bitrates to handle fluctuating network conditions gracefully.
- **Background Blur**: Client-side video processing for background blurring.

## 🏗️ Architecture & Implementation Principles

Flux Meet is built on a serverless, edge-first architecture:

1. **Remix + Cloudflare Pages**: The application frontend and API routes are built with Remix and deployed globally on Cloudflare Pages, ensuring fast load times anywhere in the world.
2. **Cloudflare Durable Objects**: Acts as the signaling server and room state manager. Each meeting room is backed by a single Durable Object instance, using WebSockets to coordinate peers. It handles:
   - User joins/leaves.
   - Text chat message broadcasting.
   - Live caption broadcasting.
   - Mute/Unmute state synchronization.
3. **Cloudflare Calls (WebRTC)**: The heavy lifting of routing audio and video packets is offloaded to Cloudflare Calls (a serverless SFU - Selective Forwarding Unit). Instead of a peer-to-peer mesh which degrades with many users, every client sends their media tracks once to the Cloudflare edge, which then efficiently distributes them to other participants.
4. **PartyKit (partysocket/partytracks)**: Simplifies the abstraction over WebSockets and WebRTC track management, seamlessly tying React components to edge state.

![Diagram of Architecture](architecture.png)

## 🚀 Getting Started

To build and run Flux Meet yourself, you will need a Cloudflare account.

### 1. Variables & Prerequisites

Go to the [Cloudflare Calls dashboard](https://dash.cloudflare.com/?to=/:account/calls) and create an application.

Create a `.dev.vars` file in the root of the project and add your credentials:

```env
CALLS_APP_ID=<APP_ID_GOES_HERE>
CALLS_APP_SECRET=<SECRET_GOES_HERE>
```

#### Optional variables

- `MAX_WEBCAM_BITRATE` (default `1200000`): Max bitrate for webcam (bps).
- `MAX_WEBCAM_FRAMERATE` (default: `24`): Max FPS.
- `MAX_WEBCAM_QUALITY_LEVEL` (default `1080`): Max resolution height.
- `OPENAI_MODEL_ENDPOINT` & `OPENAI_API_TOKEN`: Enable the AI participant feature.

### 2. Development

```sh
npm install
npm run dev
```

Open up [http://127.0.0.1:8787](http://127.0.0.1:8787) and start chatting!

### 3. Deployment

1. Make sure you've installed `wrangler` and are logged in:
   ```sh
   npx wrangler login
   ```
2. Update `CALLS_APP_ID` in `wrangler.toml` to use your own App ID.
3. Set the secret in Cloudflare:
   ```sh
   npx wrangler secret put CALLS_APP_SECRET
   ```
4. Deploy the application:
   ```sh
   npm run deploy
   ```

## ⚖️ Credits & License

This project is a modified fork of **[Cloudflare Orange](https://github.com/cloudflare/orange)**.
Massive credit to the Cloudflare team for providing the incredible foundation, architecture, and WebRTC abstractions that make this project possible.

Modifications and enhancements (UI overhaul, Chat integration, Draggable Captions) were developed to showcase extending serverless WebRTC apps.

Licensed under the same terms as the original repository (Apache License 2.0).
