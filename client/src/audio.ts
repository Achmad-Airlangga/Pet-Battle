/** Synthesized sound effects (Web Audio), so the game ships without audio files. */
import type { Element } from './types.ts';

export type SoundName =
  | 'click' | 'cast' | 'miss' | 'block' | 'heal' | 'swap' | 'ko' | 'revive'
  | 'weather' | 'denied' | 'tick' | 'win' | 'lose' | 'start' | `hit:${Element}`;

class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Browsers only allow audio after a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'click': return this.tone('square', 660, 660, t, 0.05, 0.12);
      case 'cast': return this.tone('triangle', 420, 900, t, 0.12, 0.25);
      case 'miss': return this.whoosh(t, 0.22, 2400, 600, 0.25);
      case 'block': this.tone('square', 1400, 1100, t, 0.07, 0.18); return this.tone('square', 1900, 1500, t + 0.03, 0.06, 0.1);
      case 'heal': [523, 659, 784].forEach((f, i) => this.tone('sine', f, f, t + i * 0.07, 0.14, 0.22)); return;
      case 'swap': this.tone('square', 300, 600, t, 0.06, 0.15); return this.tone('square', 600, 900, t + 0.06, 0.06, 0.15);
      case 'ko': return this.tone('sawtooth', 500, 60, t, 0.6, 0.3);
      case 'revive': [392, 523, 659, 1046].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.08, 0.18, 0.22)); return;
      case 'weather': return this.whoosh(t, 0.9, 300, 1400, 0.2);
      case 'denied': return this.tone('square', 180, 140, t, 0.12, 0.15);
      case 'tick': return this.tone('square', 990, 990, t, 0.04, 0.08);
      case 'start': [262, 330, 392, 523].forEach((f, i) => this.tone('square', f, f, t + i * 0.09, 0.1, 0.16)); return;
      case 'win': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone('square', f, f, t + i * 0.11, 0.12, 0.18)); return;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.16, 0.2, 0.22)); return;
      case 'hit:Air': this.whoosh(t, 0.16, 3000, 1200, 0.3); return this.tone('sine', 1200, 500, t, 0.1, 0.12);
      case 'hit:Earth': this.tone('sine', 140, 50, t, 0.22, 0.5); return this.whoosh(t, 0.12, 500, 200, 0.25);
      case 'hit:Fire': this.whoosh(t, 0.3, 1600, 300, 0.35); return this.tone('sawtooth', 220, 90, t, 0.18, 0.12);
      case 'hit:Water': this.tone('sine', 300, 900, t, 0.1, 0.25); return this.tone('sine', 900, 400, t + 0.08, 0.1, 0.18);
    }
  }

  private tone(type: OscillatorType, from: number, to: number, start: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private whoosh(start: number, dur: number, fromHz: number, toHz: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(fromHz, start);
    filter.frequency.exponentialRampToValueAtTime(toHz, start + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(start);
    src.stop(start + dur + 0.02);
  }
}

export const sfx = new Sfx();
