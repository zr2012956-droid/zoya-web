# Zoya (web)

Voice-to-voice Gemini Live assistant. React + TypeScript + Tailwind v4 + Vite.

    npm install
    cp .env.example .env     # add VITE_GEMINI_API_KEY (or paste the key in the app on first run)
    npm run dev

Needs HTTPS or localhost for the microphone. Open on your phone via the LAN URL over HTTPS (e.g. `vite --host` behind a tunnel).

Structure
- src/lib/AudioStreamer.ts: mic capture (PCM16 16kHz via AudioWorklet), 24kHz playback queue, interrupt, level meters
- src/lib/LiveSession.ts: Gemini Live connection, state machine (disconnected / connecting / listening / speaking), tool calls
- src/lib/tools.ts: openWebsite, searchWeb, getTime
- src/lib/persona.ts: Zoya's system instruction
- src/components/Orb.tsx: canvas waveform

Security: a key in the browser is visible to anyone using the app. For anything public, mint ephemeral tokens on a server.
