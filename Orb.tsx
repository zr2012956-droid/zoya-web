import { useEffect, useRef } from 'react';
import type { AudioStreamer } from '../lib/AudioStreamer';
import type { SessionState } from '../lib/LiveSession';

const COLORS: Record<SessionState, string> = {
  disconnected: '#5d4f8f',
  connecting: '#ffb27a',
  listening: '#7a8cff',
  speaking: '#ff4f8b',
};

const SIZE = 360;
const BARS = 72;
const R0 = 118;

/** Radial waveform that reacts to mic level (listening) or Zoya's voice (speaking). */
export default function Orb({ state, audio }: { state: SessionState; audio: AudioStreamer }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let t = 0;
    let level = 0;

    const draw = () => {
      t += 0.016;
      const kind = state === 'speaking' ? 'out' : state === 'listening' ? 'in' : null;
      const raw = kind ? audio.getLevel(kind) : 0;
      level += (Math.min(1, raw * 6) - level) * 0.25;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLORS[state];
      ctx.shadowColor = COLORS[state];
      ctx.shadowBlur = state === 'disconnected' ? 0 : 12;

      const pulse = state === 'connecting' ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const wobble = 0.5 + 0.5 * Math.sin(i * 0.9 + t * (reduce ? 0 : 6));
        const idle = state === 'disconnected' ? 0.04 : 0.1 + 0.05 * Math.sin(i * 0.5 + t * 2);
        const amp = idle + level * wobble + pulse * 0.25 * wobble;
        const len = 5 + amp * 62;
        const x0 = SIZE / 2 + Math.cos(a) * R0;
        const y0 = SIZE / 2 + Math.sin(a) * R0;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [state, audio]);

  return <canvas ref={ref} style={{ width: SIZE, height: SIZE }} className="pointer-events-none absolute" aria-hidden />;
}
