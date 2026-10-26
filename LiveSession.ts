import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { AudioStreamer } from './AudioStreamer';
import { ZOYA_SYSTEM_INSTRUCTION } from './persona';
import { functionDeclarations, runTool } from './tools';

export type SessionState = 'disconnected' | 'connecting' | 'listening' | 'speaking';

const MODEL = 'gemini-3.1-flash-live-preview';
// Forces Hindi speech output. If the API rejects it on connect, delete this line and the languageCode below;
// the system prompt alone still makes Zoya speak Hindi.
const LANGUAGE_CODE = 'hi-IN';

/**
 * Owns the Gemini Live connection and the state machine.
 * Audio in/out only: responseModalities is AUDIO and no text is ever sent or rendered.
 */
export class LiveSession {
  private session: Session | null = null;
  private active = false;
  private turnDone = true;

  constructor(
    private apiKey: string,
    private audio: AudioStreamer,
    private onState: (s: SessionState) => void,
    private onError: (message: string) => void,
  ) {
    this.audio.onPlaybackEnded = () => {
      if (this.active && this.turnDone) this.setState('listening');
    };
  }

  async connect(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.turnDone = true;
    this.setState('connecting');
    try {
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      this.session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: ZOYA_SYSTEM_INSTRUCTION,
          speechConfig: { languageCode: LANGUAGE_CODE, voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          tools: [{ functionDeclarations }],
        },
        callbacks: {
          onmessage: (m) => this.handle(m),
          onerror: (e) => this.fail(e.message || 'Connection error.'),
          onclose: () => void this.teardown(),
        },
      });
      if (!this.active) { this.session.close(); return; } // user cancelled while connecting

      await this.audio.start((b64) =>
        this.session?.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } }),
      );
      if (this.active) this.setState('listening');
    } catch (e) {
      this.fail(this.friendly(e));
    }
  }

  async disconnect(): Promise<void> {
    this.session?.close();
    await this.teardown();
  }

  private handle(m: LiveServerMessage): void {
    if (!this.active) return;

    const calls = m.toolCall?.functionCalls;
    if (calls?.length) {
      const functionResponses = calls.map((fc) => ({
        id: fc.id,
        name: fc.name,
        response: runTool(fc.name, fc.args),
      }));
      this.session?.sendToolResponse({ functionResponses });
    }

    const sc = m.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      this.audio.interrupt();
      this.turnDone = true;
      this.setState('listening');
      return;
    }

    for (const part of sc.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) {
        this.turnDone = false;
        this.setState('speaking');
        this.audio.playPcm(part.inlineData.data);
      }
    }

    if (sc.turnComplete) {
      this.turnDone = true;
      if (!this.audio.isPlaying()) this.setState('listening');
    }
  }

  private async teardown(): Promise<void> {
    if (!this.active && !this.session) return;
    this.active = false;
    this.session = null;
    await this.audio.stop();
    this.onState('disconnected');
  }

  private fail(message: string): void {
    this.onError(message);
    void this.disconnect();
  }

  private setState(s: SessionState): void {
    if (this.active) this.onState(s);
  }

  private friendly(e: unknown): string {
    if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError'))
      return 'माइक की अनुमति बंद है। माइक चालू करके फिर से टैप करो।';
    if (e instanceof DOMException && e.name === 'NotFoundError') return 'माइक नहीं मिला।';
    return e instanceof Error ? e.message : 'Could not connect.';
  }
}
