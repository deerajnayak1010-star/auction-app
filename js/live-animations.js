// ─────────────────────────────────────────────
// live-animations.js — Premium Ball Outcome Animations
// Self-contained overlay system for live scoring
// ─────────────────────────────────────────────

export class LiveAnimations {
  constructor(sounds) {
    this.sounds = sounds;
    this.momentumCount = 0;   // consecutive boundaries
    this.lastBoundaryType = null;
  }

  // ═══════════════════════════════════════════
  // CORE TRIGGER — called after every ball
  // ═══════════════════════════════════════════

  trigger(ball, prevState, newState) {
    if (!ball || !newState) return;

    // Button ripple on the ball that was pressed
    this._addButtonRipple(ball.type);

    // Score change animation
    if (prevState && newState) {
      this._animateScoreChange(prevState, newState);
    }

    // Ball dot pulse
    setTimeout(() => this.pulseLatestDot(), 50);

    // Ball outcome overlays
    if (ball.isBoundary && ball.runs === 4 && !ball.isWide && !ball.isNoBall) {
      this._showFourOverlay();
      this._trackMomentum('4');
    } else if (ball.isBoundary && ball.runs === 6 && !ball.isWide && !ball.isNoBall) {
      this._showSixOverlay();
      this._trackMomentum('6');
    } else if (ball.isBatBoundary && ball.batRuns === 4) {
      // NB+4
      this._showFourOverlay();
      this._trackMomentum('4');
    } else if (ball.isBatBoundary && ball.batRuns === 6) {
      // NB+6
      this._showSixOverlay();
      this._trackMomentum('6');
    } else if (ball.wicket) {
      this._showWicketOverlay();
      this._resetMomentum();
    } else {
      // Non-boundary: reset momentum
      if (ball.runs === 0 && !ball.isWide && !ball.isNoBall && !ball.isBye && !ball.isLegBye) {
        this._resetMomentum();
      }
    }

    // Milestone checks
    if (prevState && newState) {
      this._checkMilestones(prevState, newState);
      this._checkDuck(ball, prevState, newState);
    }
  }

  // ═══════════════════════════════════════════
  // FOUR OVERLAY
  // ═══════════════════════════════════════════

  _showFourOverlay() {
    if (this.sounds) this.sounds.playFour?.();

    const overlay = document.createElement('div');
    overlay.className = 'lm-anim-overlay lm-overlay-four';
    overlay.innerHTML = `
      <div class="lm-four-streak"></div>
      <div class="lm-four-text">FOUR</div>
      <div class="lm-four-boundary"></div>
    `;
    document.body.appendChild(overlay);
    this._autoRemove(overlay, 700);
  }

  // ═══════════════════════════════════════════
  // SIX OVERLAY
  // ═══════════════════════════════════════════

  _showSixOverlay() {
    if (this.sounds) this.sounds.playSix?.();

    const overlay = document.createElement('div');
    overlay.className = 'lm-anim-overlay lm-overlay-six';

    // Ball arc
    overlay.innerHTML = `<div class="lm-six-ball"></div><div class="lm-six-text">SIX</div>`;

    // Gold particles
    const particleCount = 14;
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('span');
      p.className = 'lm-six-particle';
      const angle = (i / particleCount) * Math.PI * 2;
      const dist = 80 + Math.random() * 120;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const size = 4 + Math.random() * 6;
      p.style.cssText = `
        width:${size}px; height:${size}px;
        top:50%; left:50%;
        animation-delay: ${Math.random() * 0.2}s;
        --dx:${dx}px; --dy:${dy}px;
        animation-name: sixParticleBurst;
      `;
      // Custom trajectory via inline keyframe override
      p.style.setProperty('animation-duration', `${0.6 + Math.random() * 0.4}s`);
      p.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 }
      ], { duration: 600 + Math.random() * 400, easing: 'ease-out', fill: 'forwards' });
      overlay.appendChild(p);
    }

    document.body.appendChild(overlay);
    this._autoRemove(overlay, 900);
  }

  // ═══════════════════════════════════════════
  // WICKET OVERLAY
  // ═══════════════════════════════════════════

  _showWicketOverlay() {
    if (this.sounds) this.sounds.playWicket?.();

    const overlay = document.createElement('div');
    overlay.className = 'lm-anim-overlay lm-overlay-wicket';
    overlay.innerHTML = `
      <div class="lm-wicket-text">WICKET</div>
      <div class="lm-wicket-stumps">
        <div class="lm-wicket-stump"></div>
        <div class="lm-wicket-stump"></div>
        <div class="lm-wicket-stump"></div>
        <div class="lm-wicket-bail"></div>
        <div class="lm-wicket-bail"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Screen shake
    const page = document.querySelector('.live-match-page');
    if (page) {
      page.classList.add('lm-shake');
      setTimeout(() => page.classList.remove('lm-shake'), 600);
    }

    this._autoRemove(overlay, 900);
  }

  // ═══════════════════════════════════════════
  // MOMENTUM MODE — Consecutive Boundaries
  // ═══════════════════════════════════════════

  _trackMomentum(type) {
    this.momentumCount++;
    this.lastBoundaryType = type;

    if (this.momentumCount >= 2) {
      // Activate momentum glow
      const page = document.querySelector('.live-match-page');
      if (page) page.classList.add('lm-momentum-active');

      let text = '';
      if (this.momentumCount === 2) {
        text = type === '6' ? '🚀 BACK TO BACK SIXES!' : '🔥 BACK TO BACK FOURS!';
      } else if (this.momentumCount === 3) {
        text = type === '6' ? '🚀 HAT-TRICK SIXES!' : '🔥 HAT-TRICK BOUNDARIES!';
      } else {
        text = `🔥 ${this.momentumCount} IN A ROW!`;
      }
      this._showMomentumBadge(text);
    }
  }

  _resetMomentum() {
    this.momentumCount = 0;
    this.lastBoundaryType = null;
    const page = document.querySelector('.live-match-page');
    if (page) page.classList.remove('lm-momentum-active');
  }

  _showMomentumBadge(text) {
    // Remove any existing badge
    document.querySelectorAll('.lm-momentum-badge').forEach(el => el.remove());

    const badge = document.createElement('div');
    badge.className = 'lm-momentum-badge';
    badge.textContent = text;
    document.body.appendChild(badge);
    this._autoRemove(badge, 2400);
  }

  // ═══════════════════════════════════════════
  // MILESTONES — 50 / 100
  // ═══════════════════════════════════════════

  _checkMilestones(prev, next) {
    if (!prev || !next) return;

    // Check striker from previous state
    const prevStriker = prev.striker;
    const nextBatters = next.battingCard || [];

    if (!prevStriker) return;

    // Find the same batsman in new state
    const updated = nextBatters.find(b => b.name === prevStriker.name);
    if (!updated) return;

    const prevRuns = prevStriker.runs || 0;
    const newRuns = updated.runs || 0;

    if (prevRuns < 50 && newRuns >= 50 && newRuns < 100) {
      setTimeout(() => this._showHalfCentury(updated.name), 300);
    } else if (prevRuns < 100 && newRuns >= 100) {
      setTimeout(() => this._showCentury(updated.name), 300);
    }
  }

  _showHalfCentury(name) {
    if (this.sounds) this.sounds.playMilestone?.();

    const overlay = document.createElement('div');
    overlay.className = 'lm-anim-overlay';
    overlay.innerHTML = `
      <div class="lm-milestone-50">
        <div class="lm-milestone-ring">
          <svg viewBox="0 0 100 100">
            <circle class="lm-milestone-ring-bg" cx="50" cy="50" r="45"></circle>
            <circle class="lm-milestone-ring-fill" cx="50" cy="50" r="45"></circle>
          </svg>
          <div class="lm-milestone-ring-text">50</div>
        </div>
        <div class="lm-milestone-label">🏏 HALF CENTURY</div>
        <div class="lm-milestone-name">${name}</div>
      </div>
    `;

    // Light confetti
    this._addConfetti(overlay, 20, ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f59e0b']);
    document.body.appendChild(overlay);
    this._autoRemove(overlay, 1800);
  }

  _showCentury(name) {
    if (this.sounds) this.sounds.playMilestone?.();

    const overlay = document.createElement('div');
    overlay.className = 'lm-anim-overlay lm-milestone-100';
    overlay.innerHTML = `
      <div class="lm-milestone-50">
        <div class="lm-milestone-ring">
          <svg viewBox="0 0 100 100">
            <circle class="lm-milestone-ring-bg" cx="50" cy="50" r="45"></circle>
            <circle class="lm-milestone-ring-fill" cx="50" cy="50" r="45"></circle>
          </svg>
          <div class="lm-milestone-ring-text">💯</div>
        </div>
        <div class="lm-milestone-label">🏆 CENTURY!</div>
        <div class="lm-milestone-name">${name}</div>
      </div>
    `;

    // Heavy confetti
    this._addConfetti(overlay, 40, ['#f59e0b', '#fbbf24', '#d97706', '#ef4444', '#3b82f6', '#10b981']);
    document.body.appendChild(overlay);
    this._autoRemove(overlay, 2200);
  }

  _addConfetti(container, count, colors) {
    for (let i = 0; i < count; i++) {
      const c = document.createElement('div');
      c.className = 'lm-confetti';
      const color = colors[Math.floor(Math.random() * colors.length)];
      const x = Math.random() * 100;
      const delay = Math.random() * 0.5;
      const size = 4 + Math.random() * 6;
      const rotate = Math.random() * 360;
      c.style.cssText = `
        left: ${x}%; top: -10px;
        width: ${size}px; height: ${size * 0.6}px;
        background: ${color};
        transform: rotate(${rotate}deg);
        animation-delay: ${delay}s;
        animation-duration: ${1 + Math.random() * 0.5}s;
      `;
      container.appendChild(c);
    }
  }

  // ═══════════════════════════════════════════
  // DUCK — Out for 0
  // ═══════════════════════════════════════════

  _checkDuck(ball, prev, next) {
    if (!ball.wicket) return;

    // Find the dismissed batsman
    const whoOut = ball.whoOut || 'striker';
    const prevBatter = whoOut === 'nonStriker' ? prev.nonStriker : prev.striker;
    if (!prevBatter) return;

    // Check if out for 0 (duck)
    if (prevBatter.runs === 0 && prevBatter.balls > 0) {
      setTimeout(() => this._showDuckOverlay(prevBatter.name), 900); // after wicket anim
    }
  }

  _showDuckOverlay(name) {
    const overlay = document.createElement('div');
    overlay.className = 'lm-anim-overlay lm-overlay-duck';
    overlay.innerHTML = `
      <div class="lm-duck-content">
        <div class="lm-duck-icon">🦆</div>
        <div class="lm-duck-text">OUT FOR DUCK</div>
        <div class="lm-duck-name">${name}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._autoRemove(overlay, 1800);
  }

  // ═══════════════════════════════════════════
  // SCORE FLIP ANIMATION
  // ═══════════════════════════════════════════

  _animateScoreChange(prev, next) {
    if (!prev || !next) return;

    // Detect which team's score changed
    const scoreEls = document.querySelectorAll('.live-match-score');
    if (scoreEls.length < 2) return;

    const prevA = prev.teamAScore?.runs ?? 0;
    const prevB = prev.teamBScore?.runs ?? 0;
    const nextA = next.teamAScore?.runs ?? 0;
    const nextB = next.teamBScore?.runs ?? 0;

    if (nextA !== prevA && scoreEls[0]) {
      scoreEls[0].classList.add('lm-score-highlight');
      setTimeout(() => scoreEls[0].classList.remove('lm-score-highlight'), 600);
    }
    if (nextB !== prevB && scoreEls[1]) {
      scoreEls[1].classList.add('lm-score-highlight');
      setTimeout(() => scoreEls[1].classList.remove('lm-score-highlight'), 600);
    }

    // Also highlight batsman runs
    const statRuns = document.querySelectorAll('.lm-stat-runs');
    statRuns.forEach(el => {
      el.classList.add('lm-score-highlight');
      setTimeout(() => el.classList.remove('lm-score-highlight'), 600);
    });
  }

  // ═══════════════════════════════════════════
  // OVER DOT PULSE
  // ═══════════════════════════════════════════

  pulseLatestDot() {
    const thisOver = document.querySelector('.this-over');
    if (!thisOver) return;
    const dots = thisOver.querySelectorAll('.ball-dot, .ball-run');
    if (dots.length === 0) return;
    const last = dots[dots.length - 1];
    if (last) {
      last.classList.remove('lm-dot-new');
      // Force reflow for re-trigger
      void last.offsetWidth;
      last.classList.add('lm-dot-new');
    }
  }

  // ═══════════════════════════════════════════
  // BUTTON RIPPLE
  // ═══════════════════════════════════════════

  _addButtonRipple(type) {
    const selectors = {
      '0': '.score-btn[data-ball="0"]',
      '1': '.score-btn[data-ball="1"]',
      '2': '.score-btn[data-ball="2"]',
      '3': '.score-btn[data-ball="3"]',
      '4': '.score-btn[data-ball="4"]',
      '6': '.score-btn[data-ball="6"]',
      'W': '#lm-wicket-btn',
    };
    const sel = selectors[type];
    if (!sel) return;
    const btn = document.querySelector(sel);
    if (!btn) return;

    const ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    const size = Math.max(btn.offsetWidth, btn.offsetHeight);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${(btn.offsetWidth - size) / 2}px`;
    ripple.style.top = `${(btn.offsetHeight - size) / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 450);
  }

  // ═══════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════

  _autoRemove(el, ms) {
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, ms);
  }
}
