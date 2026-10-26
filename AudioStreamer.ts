/**
 * Everything audio: mic capture (PCM16 @ 16kHz) and gapless playback (PCM16 @ 24kHz).
 * Knows nothing about Gemini. Must be started from a user gesture.
 */
const IN_RATE = 16000;
const OUT_RATE = 24000;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export class AudioStreamer {
  onPlaybackEnded?: () => void;

  private inCtx?: AudioContext;
  private outCtx?: AudioContext;
  private stream?: MediaStream;
  private micNode?: AudioWorkletNode;
  private inAnalyser?: AnalyserNode;
  private outAnalyser?: AnalyserNode;
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private scratch = new Uint8Array(256);

  async start(onChunk: (base64Pcm: string) => void): Promise<void> {
    // Create both contexts inside the user gesture so playback isn't blocked.
    this.outCtx = new AudioContext({ sampleRate: OUT_RATE });
    this.outAnalyser = this.outCtx.createAnalyser();
    this.outAnalyser.fftSize = 256;
    this.outAnalyser.connect(this.outCtx.destination);
    await this.outCtx.resume();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    this.inCtx = new AudioContext({ sampleRate: IN_RATE });
    await this.inCtx.audioWorklet.addModule('/pcm-processor.js');
    const src = this.inCtx.createMediaStreamSource(this.stream);
    this.inAnalyser = this.inCtx.createAnalyser();
    this.inAnalyser.fftSize = 256;
    this.micNode = new AudioWorkletNode(this.inCtx, 'pcm-processor');
    this.micNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onChunk(bytesToB64(new Uint8Array(e.data)));
    src.connect(this.inAnalyser);
    src.connect(this.micNode); // worklet has no output; no need to connect to destination
    await this.inCtx.resume();
  }

  playPcm(base64Pcm: string): void {
    const ctx = this.outCtx;
    if (!ctx || !this.outAnalyser) return;
    const bytes = b64ToBytes(base64Pcm);
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const buffer = ctx.createBuffer(1, pcm.length, OUT_RATE);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outAnalyser);
    const startAt = Math.max(ctx.currentTime + 0.02, this.nextTime);
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) this.onPlaybackEnded?.();
    };
  }

  /** Barge-in: drop everything queued so Zoya stops talking immediately. */
  interrupt(): void {
    const pending = [...this.sources];
    this.sources.clear();
    for (const s of pending) {
      s.onended = null;
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.nextTime = 0;
  }

  isPlaying(): boolean {
    return this.sources.size > 0;
  }

  /** 0..1 loudness of the mic ('in') or Zoya's voice ('out'). */
  getLevel(kind: 'in' | 'out'): number {
    const node = kind === 'in' ? this.inAnalyser : this.outAnalyser;
    if (!node) return 0;
    node.getByteTimeDomainData(this.scratch);
    let sum = 0;
    for (let i = 0; i < this.scratch.length; i++) {
      const v = (this.scratch[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.scratch.length);
  }

  async stop(): Promise<void> {
    this.interrupt();
    this.micNode?.port.close();
    this.micNode?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await Promise.allSettled([this.inCtx?.close(), this.outCtx?.close()]);
    this.micNode = this.stream = this.inCtx = this.outCtx = this.inAnalyser = this.outAnalyser = undefined;
  }
}
