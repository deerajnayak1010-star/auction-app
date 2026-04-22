// ─────────────────────────────────────────────
// sounds.js — Auction Sound Effects (Web Audio API)
// All sounds synthesized — zero external files
// ─────────────────────────────────────────────

export class AuctionSounds {
  constructor() {
    this.ctx = null;       // AudioContext (lazy init on first user gesture)
    this.muted = true;     // muted by default — user enables manually
    this.volume = 0.5;     // 0–1

    // Restore mute preference
    try {
      const saved = localStorage.getItem('npl_sound_muted');
      if (saved !== null) this.muted = saved === 'true';
      const vol = localStorage.getItem('npl_sound_volume');
      if (vol !== null) this.volume = parseFloat(vol);
    } catch (e) { /* ignore */ }
  }

  /** Lazily create AudioContext (must be after user gesture) */
  _ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /** Get effective gain value */
  _gain() {
    return this.muted ? 0 : this.volume;
  }

  // ── Controls ─────────────────────────────────

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('npl_sound_muted', String(this.muted)); } catch (e) {}
    return this.muted;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('npl_sound_volume', String(this.volume)); } catch (e) {}
  }

  // ── Sound: Bid Placed ────────────────────────
  // Short ascending beep — crisp and satisfying

  playBid() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const g = this._gain();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(900, now + 0.08);
    gain.gain.setValueAtTime(g * 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);

    // Add a click layer
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1200, now);
    gain2.gain.setValueAtTime(g * 0.08, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.05);
  }

  // ── Sound: SOLD — Gavel bang + fanfare ───────

  playSold() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const g = this._gain();

    // Gavel bang (noise burst)
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(g * 0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    noise.connect(noiseGain).connect(ctx.destination);
    noise.start(now);

    // Fanfare: ascending chord
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + 0.1 + i * 0.06);
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(g * 0.2, now + 0.1 + i * 0.06);
      oscGain.gain.setValueAtTime(g * 0.2, now + 0.3 + i * 0.06);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(oscGain).connect(ctx.destination);
      osc.start(now + 0.1 + i * 0.06);
      osc.stop(now + 0.8);
    });

    // Final high note
    const fin = ctx.createOscillator();
    const finGain = ctx.createGain();
    fin.type = 'sine';
    fin.frequency.setValueAtTime(1046.5, now + 0.35); // C6
    finGain.gain.setValueAtTime(0, now);
    finGain.gain.linearRampToValueAtTime(g * 0.25, now + 0.38);
    finGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    fin.connect(finGain).connect(ctx.destination);
    fin.start(now + 0.35);
    fin.stop(now + 1.2);
  }

  // ── Sound: UNSOLD — Descending buzz ──────────

  playUnsold() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const g = this._gain();

    // Low descending tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(150, now + 0.5);
    gain.gain.setValueAtTime(g * 0.15, now);
    gain.gain.linearRampToValueAtTime(g * 0.12, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);

    // Second lower buzz
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(200, now + 0.15);
    osc2.frequency.linearRampToValueAtTime(100, now + 0.55);
    gain2.gain.setValueAtTime(g * 0.06, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  }

  // ── Sound: Nominate — Attention chime ────────

  playNominate() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const g = this._gain();

    // Two-note chime: G5 → C6
    const freqs = [783.99, 1046.5];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.15);
      oscGain.gain.setValueAtTime(0, now + i * 0.15);
      oscGain.gain.linearRampToValueAtTime(g * 0.3, now + i * 0.15 + 0.02);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
      osc.connect(oscGain).connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.4);
    });

    // Shimmer overtone
    const shimmer = ctx.createOscillator();
    const shimGain = ctx.createGain();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(2093, now + 0.1); // C7
    shimGain.gain.setValueAtTime(g * 0.05, now + 0.1);
    shimGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    shimmer.connect(shimGain).connect(ctx.destination);
    shimmer.start(now + 0.1);
    shimmer.stop(now + 0.6);
  }

  // ── Sound: Timer Tick (last 5 seconds) ───────

  playTimerTick() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const g = this._gain();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5
    gain.gain.setValueAtTime(g * 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // ── Sound: Timer Expired — Alarm buzz ────────

  playTimerExpired() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const g = this._gain();

    // Double buzz
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now + i * 0.2);
      gain.gain.setValueAtTime(g * 0.15, now + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.15);
    }
  }

  // ── Sound: Strike Change — Swoosh swap tone ──

  playStrikeChange() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const g = this._gain();

    // Swoosh up
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(400, now);
    osc1.frequency.linearRampToValueAtTime(900, now + 0.12);
    gain1.gain.setValueAtTime(g * 0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.2);

    // Swoosh down
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(900, now + 0.12);
    osc2.frequency.linearRampToValueAtTime(500, now + 0.25);
    gain2.gain.setValueAtTime(g * 0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.35);

    // Confirmation ding
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1046.5, now + 0.25); // C6
    gain3.gain.setValueAtTime(g * 0.2, now + 0.25);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc3.connect(gain3).connect(ctx.destination);
    osc3.start(now + 0.25);
    osc3.stop(now + 0.55);
  }
}
