// ─────────────────────────────────────────────
// projector-celebration.js — Fireworks & Celebration Engine
// Canvas-based particle system + Web Audio crowd sounds
// ─────────────────────────────────────────────

class ProjectorCelebration {
  constructor() {
    this.canvas = document.getElementById('proj-fireworks-canvas');
    this.overlay = document.getElementById('proj-celebration-overlay');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.active = false;
    this.animId = null;
    this.timeout = null;
    this.fireworks = [];
    this.particles = [];
    this.confetti = [];
    this.unsoldParticles = [];
    this.audioCtx = null;
    this.type = null; // 'sold' or 'unsold'
    this.startTime = 0;
    this.DURATION = 7000;
  }

  _ensureAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    return this.audioCtx;
  }

  start(type, state, onComplete) {
    this.stop();
    this.type = type;
    this.active = true;
    this.startTime = Date.now();
    this.onComplete = onComplete;
    this.fireworks = [];
    this.particles = [];
    this.confetti = [];
    this.unsoldParticles = [];

    // Size canvas
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.canvas.style.display = 'block';
    }

    // Build overlay text
    if (this.overlay) {
      if (type === 'sold') {
        const teamName = state.currentBidderTeam?.name || '';
        const teamColor = state.currentBidderTeam?.color || '#10b981';
        const price = this._fmt(state.currentBid);
        const playerName = state.currentPlayer?.name || '';
        const playerImg = state.currentPlayer?.image || '';
        const playerInitial = playerName ? playerName.charAt(0).toUpperCase() : '?';
        this.overlay.innerHTML = `
          ${playerImg ? `<img src="${playerImg}" alt="${playerName}" style="width:clamp(80px,12vw,140px);height:clamp(80px,12vw,140px);object-fit:cover;object-position:top;border-radius:50%;border:4px solid rgba(16,185,129,0.6);box-shadow:0 0 40px rgba(16,185,129,0.3);margin-bottom:12px;animation:celebSubIn 0.4s ease 0.2s forwards;opacity:0;">` : `<div style="width:100px;height:100px;border-radius:50%;background:rgba(16,185,129,0.2);border:4px solid rgba(16,185,129,0.5);display:flex;align-items:center;justify-content:center;font-size:3rem;font-weight:900;color:rgba(255,255,255,0.3);margin-bottom:12px;animation:celebSubIn 0.4s ease 0.2s forwards;opacity:0;">${playerInitial}</div>`}
          <div style="font-size:clamp(1rem,2.5vw,1.8rem);font-weight:700;color:#e2e8f0;margin-bottom:4px;opacity:0;animation:celebSubIn 0.4s ease 0.3s forwards;">${playerName}</div>
          <div class="proj-celeb-text sold">SOLD!</div>
          <div class="proj-celeb-subtext" style="color:${teamColor}">${teamName}</div>
          <div class="proj-celeb-price">${price}</div>
        `;
      } else {
        const playerName = state.currentPlayer?.name || '';
        const playerImg = state.currentPlayer?.image || '';
        const playerInitial = playerName ? playerName.charAt(0).toUpperCase() : '?';
        this.overlay.innerHTML = `
          ${playerImg ? `<img src="${playerImg}" alt="${playerName}" style="width:clamp(80px,12vw,140px);height:clamp(80px,12vw,140px);object-fit:cover;object-position:top;border-radius:50%;border:4px solid rgba(239,68,68,0.5);box-shadow:0 0 30px rgba(239,68,68,0.2);margin-bottom:12px;opacity:0;animation:celebSubIn 0.4s ease 0.2s forwards;filter:grayscale(0.5);">` : `<div style="width:100px;height:100px;border-radius:50%;background:rgba(239,68,68,0.15);border:4px solid rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center;font-size:3rem;font-weight:900;color:rgba(255,255,255,0.2);margin-bottom:12px;opacity:0;animation:celebSubIn 0.4s ease 0.2s forwards;">${playerInitial}</div>`}
          <div style="font-size:clamp(1rem,2.5vw,1.8rem);font-weight:700;color:#94a3b8;margin-bottom:4px;opacity:0;animation:celebSubIn 0.4s ease 0.3s forwards;">${playerName}</div>
          <div class="proj-celeb-text unsold">UNSOLD</div>
          <div class="proj-celeb-subtext" style="color:#94a3b8">No bids received</div>
        `;
      }
      this.overlay.className = 'proj-celebration-overlay active';
    }

    // Add vignette for unsold
    if (type === 'unsold') {
      const vig = document.createElement('div');
      vig.className = 'proj-unsold-vignette';
      vig.id = 'proj-unsold-vignette';
      document.body.appendChild(vig);
    }

    // Play sound
    try {
      if (type === 'sold') this._playCrowdCheer();
      else this._playUnsoldSound();
    } catch (e) {}

    // Schedule firework launches (sold only)
    if (type === 'sold') {
      this._scheduleLaunches();
      this._spawnConfettiBurst();
    }

    // Start render loop
    this._animate();

    // Auto-complete after duration
    this.timeout = setTimeout(() => this._fadeOut(), this.DURATION);
  }

  stop() {
    this.active = false;
    if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; }
    if (this.timeout) { clearTimeout(this.timeout); this.timeout = null; }
    if (this.canvas) { this.canvas.style.display = 'none'; }
    if (this.overlay) { this.overlay.className = 'proj-celebration-overlay'; this.overlay.innerHTML = ''; }
    const vig = document.getElementById('proj-unsold-vignette');
    if (vig) vig.remove();
    this.fireworks = [];
    this.particles = [];
    this.confetti = [];
    this.unsoldParticles = [];
  }

  _fadeOut() {
    if (this.overlay) this.overlay.className = 'proj-celebration-overlay active fade-out';
    setTimeout(() => {
      this.stop();
      if (this.onComplete) this.onComplete();
    }, 800);
  }

  // ── Firework Launches ──

  _scheduleLaunches() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const launches = [0, 300, 600, 1000, 1500, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600];
    launches.forEach(delay => {
      setTimeout(() => {
        if (!this.active) return;
        this.fireworks.push({
          x: W * (0.15 + Math.random() * 0.7),
          y: H,
          targetY: H * (0.15 + Math.random() * 0.3),
          vy: -(8 + Math.random() * 4),
          exploded: false,
          color: this._randomColor(),
          trail: []
        });
        try { this._playFireworkPop(); } catch(e) {}
      }, delay);
    });
  }

  _spawnConfettiBurst() {
    const W = this.canvas.width;
    for (let i = 0; i < 120; i++) {
      this.confetti.push({
        x: W * Math.random(),
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 3,
        vy: 1.5 + Math.random() * 3,
        size: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.15,
        color: this._randomColor(),
        alpha: 1,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.03
      });
    }
  }

  // ── Animation Loop ──

  _animate() {
    if (!this.active) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(5,8,22,0.2)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    if (this.type === 'sold') {
      this._updateFireworks(ctx, W, H);
      this._updateParticles(ctx, H);
      ctx.globalCompositeOperation = 'source-over';
      this._updateConfetti(ctx, H);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      this._updateUnsoldFx(ctx, W, H);
    }

    this.animId = requestAnimationFrame(() => this._animate());
  }

  _updateFireworks(ctx, W, H) {
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const fw = this.fireworks[i];
      fw.trail.push({ x: fw.x, y: fw.y });
      if (fw.trail.length > 6) fw.trail.shift();
      fw.y += fw.vy;
      fw.vy *= 0.98;

      // Draw trail
      for (let t = 0; t < fw.trail.length; t++) {
        const a = t / fw.trail.length * 0.6;
        ctx.beginPath();
        ctx.arc(fw.trail[t].x, fw.trail[t].y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,200,100,${a})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe4a0';
      ctx.fill();

      if (fw.y <= fw.targetY) {
        this._explode(fw);
        this.fireworks.splice(i, 1);
      }
    }
  }

  _explode(fw) {
    const count = 80 + Math.floor(Math.random() * 40);
    const hue = fw.color;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.3;
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        x: fw.x, y: fw.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        decay: 0.012 + Math.random() * 0.01,
        size: 1.5 + Math.random() * 2,
        color: hue,
        trail: []
      });
    }
    // Ring burst
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 / 20) * i;
      this.particles.push({
        x: fw.x, y: fw.y,
        vx: Math.cos(angle) * 7,
        vy: Math.sin(angle) * 7,
        alpha: 0.8, decay: 0.04,
        size: 1, color: '#ffffff',
        trail: []
      });
    }
  }

  _updateParticles(ctx, H) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 4) p.trail.shift();
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06; // gravity
      p.vx *= 0.99;
      p.alpha -= p.decay;

      if (p.alpha <= 0 || p.y > H) { this.particles.splice(i, 1); continue; }

      // Draw trail
      for (let t = 0; t < p.trail.length; t++) {
        const a = (t / p.trail.length) * p.alpha * 0.4;
        ctx.beginPath();
        ctx.arc(p.trail[t].x, p.trail[t].y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = typeof p.color === 'string' && p.color.startsWith('#')
          ? this._hexAlpha(p.color, a) : `rgba(255,255,255,${a})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = typeof p.color === 'string' && p.color.startsWith('#')
        ? this._hexAlpha(p.color, p.alpha) : `hsla(${p.color},100%,65%,${p.alpha})`;
      ctx.fill();
    }
  }

  _updateConfetti(ctx, H) {
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.wobble += c.wobbleSpeed;
      c.x += c.vx + Math.sin(c.wobble) * 0.5;
      c.y += c.vy;
      c.rot += c.rotV;
      c.alpha -= 0.002;

      if (c.alpha <= 0 || c.y > H + 20) { this.confetti.splice(i, 1); continue; }

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  _updateUnsoldFx(ctx, W, H) {
    const elapsed = Date.now() - this.startTime;
    // Spawn falling X particles
    if (elapsed < 3000 && Math.random() < 0.15) {
      this.unsoldParticles.push({
        x: Math.random() * W,
        y: -20,
        vy: 1 + Math.random() * 2,
        alpha: 0.4 + Math.random() * 0.3,
        size: 16 + Math.random() * 20,
        rot: Math.random() * Math.PI
      });
    }
    for (let i = this.unsoldParticles.length - 1; i >= 0; i--) {
      const p = this.unsoldParticles[i];
      p.y += p.vy;
      p.alpha -= 0.003;
      p.rot += 0.01;
      if (p.alpha <= 0 || p.y > H + 30) { this.unsoldParticles.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.font = `${p.size}px 'Outfit', sans-serif`;
      ctx.fillStyle = `rgba(239,68,68,${p.alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText('✕', 0, 0);
      ctx.restore();
    }
  }

  // ── Sound Effects ──

  _playCrowdCheer() {
    const ctx = this._ensureAudio();
    const now = ctx.currentTime;

    // Crowd roar (filtered noise)
    const dur = 6.5;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.5;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.18, now + 0.2);
    g1.gain.setValueAtTime(0.18, now + 2);
    g1.gain.linearRampToValueAtTime(0.12, now + 3.5);
    g1.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(bp).connect(g1).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + dur);

    // Clapping (repeated bursts)
    for (let c = 0; c < 28; c++) {
      const t = now + 0.1 + c * 0.22 + (Math.random() - 0.5) * 0.05;
      const clapBuf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
      const cd = clapBuf.getChannelData(0);
      for (let i = 0; i < cd.length; i++) {
        cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / cd.length, 2);
      }
      const src = ctx.createBufferSource();
      src.buffer = clapBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2000;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.12, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(hp).connect(cg).connect(ctx.destination);
      src.start(t);
      src.stop(t + 0.05);
    }

    // Fanfare chord
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      og.gain.setValueAtTime(0, now + 0.3);
      og.gain.linearRampToValueAtTime(0.08, now + 0.3 + i * 0.08);
      og.gain.setValueAtTime(0.08, now + 1.5);
      og.gain.exponentialRampToValueAtTime(0.001, now + 3);
      osc.connect(og).connect(ctx.destination);
      osc.start(now + 0.3 + i * 0.08);
      osc.stop(now + 3);
    });
  }

  _playFireworkPop() {
    const ctx = this._ensureAudio();
    const now = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    src.connect(g).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.1);
  }

  _playUnsoldSound() {
    const ctx = this._ensureAudio();
    const now = ctx.currentTime;

    // Low murmur
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.08, now + 0.3);
    g.gain.linearRampToValueAtTime(0.05, now + 1.2);
    g.gain.exponentialRampToValueAtTime(0.001, now + 2);
    src.connect(lp).connect(g).connect(ctx.destination);
    src.start(now); src.stop(now + 2);

    // Descending tone
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(180, now + 1.5);
    og.gain.setValueAtTime(0.06, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    osc.connect(og).connect(ctx.destination);
    osc.start(now); osc.stop(now + 1.5);
  }

  // ── Helpers ──

  _randomColor() {
    const colors = ['#f59e0b','#10b981','#3b82f6','#ec4899','#8b5cf6','#ef4444','#06b6d4','#f97316'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  _hexAlpha(hex, a) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  _fmt(num) {
    if (num == null) return '—';
    if (num >= 10000000) return (num/10000000).toFixed(2)+' Cr';
    if (num >= 100000) return (num/100000).toFixed(2)+' L';
    return num.toLocaleString('en-IN') + ' pts';
  }
}
