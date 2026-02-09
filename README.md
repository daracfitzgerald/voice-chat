# Voice Chat (Gemini Live)

Real-time voice conversation interface using Google's Gemini Live API. Talk to an AI assistant that knows about Dara's system, can execute commands via the voice bridge relay, and speaks results back.

Built from Google's `live-api-web-console` starter, customised with system context, function declarations, and bridge integration.

## Live

https://voice.darafitzgerald.co.uk (password-protected)

## Features

- Real-time voice conversation with Gemini 2.5 Flash
- System context (USER.md, MEMORY.md, SOUL.md) embedded in system prompt
- 6 function declarations for OpenClaw integration (create_task, run_batch, check_status, search, build, send_message)
- Voice bridge relay for executing OpenClaw commands
- Dark theme, mobile-friendly
- Transcript download

## Tech Stack

- React + TypeScript
- Gemini Live API (`gemini-2.5-flash-native-audio-latest`)
- Deployed on Vercel

## Development

```bash
npm install
npm run dev
```

Set `REACT_APP_GEMINI_API_KEY` in environment.

## Known Issues

- Gemini disconnects after ~30-60s idle or ~10-15 min session
- Auto-reconnect removed (caused glitches) - needs reimplementation
- Background tab throttling can cause disconnects
