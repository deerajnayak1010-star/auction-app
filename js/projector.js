// ─────────────────────────────────────────────
// projector.js — Ultra Premium Projector View
// Timer-synced, flicker-free, 60fps rendering
// ─────────────────────────────────────────────

class ProjectorApp {
  constructor() {
    this.ws = null;
    this.state = null;
    this.prevState = null;
    this.connected = false;
    this.animFrameId = null;
    this.currentPlayerName = null; // track to detect player changes

    // DOM refs (cached after render)
    this.mainEl = document.getElementById('proj-main');
    this.statusDot = document.getElementById('proj-status-dot');
    this.statusText = document.getElementById('proj-status-text');
  }

  init() {
    this.connectWebSocket();
    this.startRenderLoop();
    this.bindFullscreen();
  }

  // ═══════════════════════════════════════════
  // FULLSCREEN
  // ═══════════════════════════════════════════

  bindFullscreen() {
    const btn = document.getElementById('proj-fullscreen-btn');
    if (btn) {
      btn.addEventListener('click', () => this.toggleFullscreen());
    }
    document.addEventListener('fullscreenchange', () => {
      const btn = document.getElementById('proj-fullscreen-btn');
      if (btn) {
        btn.textContent = document.fullscreenElement ? '⊗ Exit Fullscreen' : '⛶ Fullscreen';
      }
    });
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  // ═══════════════════════════════════════════
  // WEBSOCKET
  // ═══════════════════════════════════════════

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      this.setConnectionStatus(false);
      setTimeout(() => this.connectWebSocket(), 3000);
      return;
    }

    this.ws.onopen = () => {
      console.log('[Projector] Connected');
      this.ws.send(JSON.stringify({ type: 'projector-register' }));
      this.setConnectionStatus(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state-update') {
          this.prevState = this.state;
          this.state = msg.state;
          this.onStateUpdate();
        }
      } catch (e) {
        console.error('[Projector] Invalid message', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[Projector] Disconnected');
      this.setConnectionStatus(false);
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    this.ws.onerror = () => {
      this.setConnectionStatus(false);
    };
  }

  setConnectionStatus(connected) {
    this.connected = connected;
    if (this.statusDot) {
      this.statusDot.className = 'proj-status-dot' + (connected ? ' connected' : '');
    }
    if (this.statusText) {
      this.statusText.textContent = connected ? 'Live' : 'Reconnecting...';
    }
    if (!connected && this.state === null) {
      this.mainEl.innerHTML = `
        <div class="proj-disconnected">
          <div class="proj-disconnected-icon">⟳</div>
          <div class="proj-disconnected-text">Connecting to Server...</div>
        </div>
      `;
    }
  }

  // ═══════════════════════════════════════════
  // TIMER SYNC (absolute timestamp based)
  // ═══════════════════════════════════════════

  /** Calculate remaining timer from absolute host timestamp — always perfectly synced */
  getTimerRemaining() {
    if (!this.state) return null;
    if (!this.state.timerEnabled) return null;
    if (this.state.phase !== 'bidding') return null;

    // If we have timerStartTime, calculate from Date.now() (perfect sync)
    if (this.state.timerStartTime) {
      const elapsed = (Date.now() - this.state.timerStartTime) / 1000;
      return Math.max(0, (this.state.timerDuration || 30) - elapsed);
    }

    // Fallback: use timerRemaining snapshot
    return this.state.timerRemaining ?? null;
  }

  // ═══════════════════════════════════════════
  // RENDER LOOP (60fps via requestAnimationFrame)
  // ═══════════════════════════════════════════

  startRenderLoop() {
    const tick = () => {
      this.updateTimer();
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  /** Update only the timer ring — runs at 60fps, touches only timer DOM */
  updateTimer() {
    if (!this.state || this.state.phase !== 'bidding') return;

    const remaining = this.getTimerRemaining();
    if (remaining === null) return;

    const duration = this.state.timerDuration || 30;
    const fraction = Math.max(0, remaining / duration);
    const circumference = 2 * Math.PI * 72; // r=72

    // Update ring progress
    const progressEl = document.getElementById('proj-timer-progress');
    if (progressEl) {
      const offset = circumference * (1 - fraction);
      progressEl.setAttribute('stroke-dashoffset', offset.toFixed(2));
    }

    // Update text
    const valueEl = document.getElementById('proj-timer-value');
    if (valueEl) {
      valueEl.textContent = Math.ceil(remaining);
    }

    // Update color classes
    const container = document.getElementById('proj-timer-container');
    if (container) {
      container.classList.remove('warning', 'danger');
      if (remaining <= 5 && remaining > 0) {
        container.classList.add('danger');
      } else if (remaining <= 10) {
        container.classList.add('warning');
      }
    }
  }

  // ═══════════════════════════════════════════
  // STATE CHANGE HANDLER
  // ═══════════════════════════════════════════

  onStateUpdate() {
    if (!this.state) return;

    const s = this.state;
    const prev = this.prevState;

    // Update bottom bar stats always
    this.updateBottomBar();

    // Detect if the player changed (need full re-render)
    const currentName = s.currentPlayer?.name || null;
    const playerChanged = currentName !== this.currentPlayerName;
    const phaseChanged = !prev || prev.phase !== s.phase;

    if (playerChanged || phaseChanged || !prev) {
      // Full render
      this.currentPlayerName = currentName;
      this.renderFull();
    } else {
      // Surgical update (bid amount, bidder, history, timer — no re-render)
      this.updateBidInfo();
      this.updateBidHistory();
    }
  }

  // ═══════════════════════════════════════════
  // FULL RENDER (only on player/phase change)
  // ═══════════════════════════════════════════

  renderFull() {
    const s = this.state;

    if (!s || s.phase === 'idle' || s.phase === 'waiting') {
      this.mainEl.innerHTML = `
        <div class="proj-waiting">
          <div class="proj-waiting-icon">🏏</div>
          <div class="proj-waiting-text">Waiting for Next Player<span class="proj-waiting-dots"></span></div>
          <div class="proj-waiting-sub">Player ${(s?.playerIndex || 0) + 1} of ${s?.totalPlayers || '—'}</div>
        </div>
      `;
      return;
    }

    if (s.phase === 'complete' || s.phase === 'results') {
      this.mainEl.innerHTML = `
        <div class="proj-waiting">
          <div class="proj-waiting-icon">🏆</div>
          <div class="proj-waiting-text">Auction Complete!</div>
          <div class="proj-waiting-sub">${s.soldCount || 0} players sold across all teams</div>
        </div>
      `;
      return;
    }

    // Bidding / Sold / Unsold — render full layout
    const p = s.currentPlayer;
    const isSold = s.phase === 'sold';
    const isUnsold = s.phase === 'unsold';

    // Player card
    const playerCardHtml = this.renderPlayerCard(p, isSold, isUnsold);

    // Bid box
    let labelClass = '';
    let statusLabel = 'CURRENT BID';
    if (isSold)   { statusLabel = 'SOLD FOR';  labelClass = 'sold-label'; }
    if (isUnsold) { statusLabel = 'UNSOLD';    labelClass = 'unsold-label'; }

    const bidStr = s.currentBid > 0 ? this.formatPoints(s.currentBid) : this.formatPoints(p.basePrice);
    const bidderHtml = this.renderBidder(s.currentBidderTeam);

    // Timer / Result badge
    let timerHtml = '';
    if (s.phase === 'bidding' && s.timerEnabled) {
      const remaining = this.getTimerRemaining();
      const duration = s.timerDuration || 30;
      const circumference = 2 * Math.PI * 72;
      const fraction = remaining !== null ? Math.max(0, remaining / duration) : 1;
      const offset = circumference * (1 - fraction);
      const timeVal = remaining !== null ? Math.ceil(remaining) : duration;
      let timerClass = '';
      if (remaining !== null && remaining <= 5 && remaining > 0) timerClass = 'danger';
      else if (remaining !== null && remaining <= 10) timerClass = 'warning';

      timerHtml = `
        <div class="proj-timer-wrap">
          <div class="proj-timer-ring-container ${timerClass}" id="proj-timer-container">
            <svg class="proj-timer-svg" viewBox="0 0 160 160">
              <circle class="proj-timer-bg" cx="80" cy="80" r="72" />
              <circle class="proj-timer-progress" id="proj-timer-progress" cx="80" cy="80" r="72"
                      stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" />
            </svg>
            <div class="proj-timer-text">
              <div class="proj-timer-value" id="proj-timer-value">${timeVal}</div>
              <div class="proj-timer-label">seconds</div>
            </div>
          </div>
        </div>
      `;
    } else if (isSold) {
      timerHtml = `<div class="proj-result-badge sold">SOLD!</div>`;
    } else if (isUnsold) {
      timerHtml = `<div class="proj-result-badge unsold">UNSOLD</div>`;
    }

    // Bid history
    const historyHtml = this.renderBidHistoryHtml(s.bidHistory);

    this.mainEl.innerHTML = `
      <div class="proj-player-area">
        ${playerCardHtml}
      </div>
      <div class="proj-info-area">
        <div class="proj-bid-box" id="proj-bid-box">
          <div class="proj-bid-label ${labelClass}" id="proj-bid-label">${statusLabel}</div>
          <div class="proj-bid-amount" id="proj-bid-amount">${bidStr}</div>
          <div class="proj-bidder" id="proj-bidder">${bidderHtml}</div>
        </div>
        ${timerHtml}
        ${historyHtml}
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // SURGICAL UPDATES (no flicker)
  // ═══════════════════════════════════════════

  updateBidInfo() {
    const s = this.state;
    if (!s || !s.currentPlayer) return;

    const amountEl = document.getElementById('proj-bid-amount');
    if (amountEl) {
      const bidStr = s.currentBid > 0 ? this.formatPoints(s.currentBid) : this.formatPoints(s.currentPlayer.basePrice);
      if (amountEl.textContent !== bidStr) {
        amountEl.textContent = bidStr;
        amountEl.classList.remove('flash');
        void amountEl.offsetWidth;
        amountEl.classList.add('flash');
      }
    }

    const bidderEl = document.getElementById('proj-bidder');
    if (bidderEl) {
      bidderEl.innerHTML = this.renderBidder(s.currentBidderTeam);
    }
  }

  updateBidHistory() {
    const existing = document.getElementById('proj-bid-history');
    if (!existing) return;
    const s = this.state;
    if (!s || !s.bidHistory) return;
    existing.outerHTML = this.renderBidHistoryHtml(s.bidHistory);
  }

  updateBottomBar() {
    const s = this.state;
    if (!s) return;
    const el = (id) => document.getElementById(id);
    const pc = el('proj-player-count');
    const sc = el('proj-sold-count');
    const uc = el('proj-unsold-count');
    const rc = el('proj-remaining-count');
    if (pc) pc.textContent = `${s.playerIndex || 0}/${s.totalPlayers || '—'}`;
    if (sc) sc.textContent = s.soldCount || 0;
    if (uc) uc.textContent = s.unsoldCount || 0;
    if (rc) rc.textContent = s.remainingPlayers ?? '—';
  }

  // ═══════════════════════════════════════════
  // RENDER HELPERS
  // ═══════════════════════════════════════════

  renderPlayerCard(p, isSold, isUnsold) {
    if (!p) return '';
    const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
    const roleClass = p.role === 'Batsman' ? 'batsman' : p.role === 'Bowler' ? 'bowler' : 'allrounder';
    const roleIcon = p.role === 'Batsman' ? '🏏' : p.role === 'Bowler' ? '🎯' : '⭐';

    let overlayHtml = '';
    if (isSold) {
      overlayHtml = `<div class="proj-card-overlay sold"><div class="proj-card-overlay-text">SOLD</div></div>`;
    } else if (isUnsold) {
      overlayHtml = `<div class="proj-card-overlay unsold"><div class="proj-card-overlay-text">UNSOLD</div></div>`;
    }

    const imgHtml = p.image
      ? `<img src="${p.image}" alt="${p.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
         <div class="proj-initial" style="display:none;">${initial}</div>`
      : `<div class="proj-initial">${initial}</div>`;

    return `
      <div class="proj-player-card">
        ${overlayHtml}
        <div class="proj-player-img">${imgHtml}</div>
        <div class="proj-player-body">
          <div class="proj-player-name">${p.name}</div>
          <div class="proj-player-role ${roleClass}">${roleIcon} ${p.role}</div>
          <div class="proj-player-base">
            <span class="proj-player-base-label">Base Price</span>
            <span class="proj-player-base-value">${this.formatPoints(p.basePrice)}</span>
          </div>
        </div>
      </div>
    `;
  }

  renderBidder(team) {
    if (!team) {
      return `<span class="proj-bidder-none">No Bids Yet</span>`;
    }
    const logoHtml = team.logo
      ? `<img src="${team.logo}" alt="" onerror="this.style.display='none'">`
      : '';
    return `${logoHtml}<span style="color: ${team.color}">${team.name}</span>`;
  }

  renderBidHistoryHtml(bidHistory) {
    if (!bidHistory || bidHistory.length === 0) return '';
    const entries = [...bidHistory].reverse().slice(0, 5);
    return `
      <div class="proj-bid-history" id="proj-bid-history">
        <div class="proj-bid-history-title">Bid History</div>
        ${entries.map(e => `
          <div class="proj-bid-entry">
            <span class="proj-bid-team">
              <span class="proj-bid-dot" style="background:${e.teamColor}"></span>
              ${e.teamName}
            </span>
            <span class="proj-bid-amt">${this.formatPoints(e.amount)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  formatPoints(num) {
    if (num == null) return '—';
    if (num >= 10000000) return (num / 10000000).toFixed(2) + ' Cr';
    if (num >= 100000)  return (num / 100000).toFixed(2) + ' L';
    return num.toLocaleString('en-IN') + ' pts';
  }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
  const app = new ProjectorApp();
  app.init();
});
