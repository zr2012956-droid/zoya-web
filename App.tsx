import { useMemo, useRef, useState } from 'react';
import Orb from './components/Orb';
import { AudioStreamer } from './lib/AudioStreamer';
import { LiveSession, type SessionState } from './lib/LiveSession';

const STATUS: Record<SessionState, string> = {
  disconnected: 'जगाने के लिए टैप करो',
  connecting: 'एक सेकंड, आ रही हूँ…',
  listening: "बोलो, मैं सुन रही हूँ",
  speaking: 'ज़ोया बोल रही है',
};

const GLOW: Record<SessionState, string> = {
  disconnected: 'bg-[#5d4f8f]/25',
  connecting: 'bg-[#ffb27a]/30',
  listening: 'bg-[#7a8cff]/35',
  speaking: 'bg-[#ff4f8b]/40',
};

export default function App() {
  const audio = useMemo(() => new AudioStreamer(), []);
  const session = useRef<LiveSession | null>(null);
  const [state, setState] = useState<SessionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(
    () => import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('zoya_key') || '',
  );
  const [draftKey, setDraftKey] = useState('');

  const toggle = () => {
    if (state !== 'disconnected') {
      void session.current?.disconnect();
      return;
    }
    setError(null);
    session.current = new LiveSession(apiKey, audio, setState, setError);
    void session.current.connect();
  };

  const saveKey = () => {
    const k = draftKey.trim();
    if (!k) return;
    localStorage.setItem('zoya_key', k);
    setApiKey(k);
  };

  const active = state !== 'disconnected';

  return (
    <main className="relative flex h-full flex-col items-center justify-between overflow-hidden px-6 py-10">
      <h1 className="text-2xl font-light tracking-[0.3em] text-[#b9b3d1]">zoya</h1>

      {apiKey ? (
        <div className="relative flex h-[360px] w-[360px] max-w-full items-center justify-center">
          <div className={`absolute h-64 w-64 rounded-full blur-3xl transition-colors duration-700 animate-breathe ${GLOW[state]}`} />
          {state === 'listening' && (
            <div className="absolute h-52 w-52 rounded-full border border-[#7a8cff]/50 animate-ping-ring" />
          )}
          <Orb state={state} audio={audio} />
          <button
            onClick={toggle}
            aria-label={active ? 'बातचीत खत्म करो' : 'बातचीत शुरू करो'}
            className="relative z-10 flex h-40 w-40 items-center justify-center rounded-full border border-white/10 bg-[#120b20]/80 shadow-[inset_0_0_40px_rgba(255,255,255,0.04)] backdrop-blur transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff4f8b]"
          >
            <svg viewBox="0 0 24 24" className={`h-14 w-14 transition-colors duration-500 ${active ? 'text-[#ff4f8b]' : 'text-[#b9b3d1]'}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M12 3v8" />
              <path d="M6.3 6.6a8 8 0 1 0 11.4 0" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <label htmlFor="key" className="text-sm text-[#b9b3d1]">शुरू करने के लिए अपनी Gemini API key डालो</label>
          <input
            id="key"
            type="password"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-[#ff4f8b]"
          />
          <button onClick={saveKey} className="rounded-xl bg-[#ff4f8b] px-4 py-3 font-medium text-[#07060d] active:scale-95">
            Key सेव करो
          </button>
        </div>
      )}

      <div className="flex min-h-20 flex-col items-center gap-2 text-center" aria-live="polite">
        <p className="text-lg text-[#f3eefc]">{apiKey ? STATUS[state] : ''}</p>
        {error && <p className="max-w-xs text-sm text-[#ff8fb1]">{error}</p>}
      </div>
    </main>
  );
}
