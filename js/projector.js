class ProjectorApp {
  constructor() {
    this.ws = null;
    this.state = null;
    this.contentEl = document.getElementById('projector-content');
  }

  init() {
    this.connectWebSocket();
    this.startLocalTimer();
    
    // Double click for fullscreen
    document.body.addEventListener('dblclick', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(e => console.log(e));
      } else {
        document.exitFullscreen();
      }
    });
  }

  startLocalTimer() {
    setInterval(() => {
      if (this.state && this.state.phase === 'bidding' && this.state.timerRemaining > 0) {
        this.state.timerRemaining = Math.max(0, this.state.timerRemaining - 0.1);
        
        // Update timer display without full re-render to avoid image flicker
        const timerEl = document.getElementById('projector-timer-display');
        if (timerEl) {
          const roundedTime = Math.ceil(this.state.timerRemaining);
          timerEl.textContent = `00:${roundedTime.toString().padStart(2, '0')}`;
          
          if (this.state.timerRemaining <= 5) {
            timerEl.className = 'projector-timer danger';
          } else if (this.state.timerRemaining <= 10) {
            timerEl.className = 'projector-timer warning';
          } else {
            timerEl.className = 'projector-timer';
          }
        }
      }
    }, 100);
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[Projector] Connected to server');
      this.ws.send(JSON.stringify({ type: 'projector-register' }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state-update') {
          this.state = msg.state;
          this.render();
        }
      } catch (e) {
        console.error('Invalid message', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[Projector] Disconnected, retrying...');
      setTimeout(() => this.connectWebSocket(), 3000);
      this.contentEl.innerHTML = `<div class="projector-waiting">Disconnected from Server. Reconnecting...</div>`;
    };
  }

  formatPoints(num) {
    if (num >= 10000000) return (num / 10000000).toFixed(2) + ' Cr';
    if (num >= 100000) return (num / 100000).toFixed(2) + ' L';
    return num.toLocaleString();
  }

  renderPlayerCard(p) {
    if (!p) return '';
    const initialHtml = p.name ? p.name.charAt(0).toUpperCase() : '?';
    const imgHtml = p.image 
      ? `<img src="${p.image}" alt="${p.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="width: 100%; height: 100%; object-fit: cover; object-position: top;"><div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:8rem; color:rgba(255,255,255,0.3);">${initialHtml}</div>`
      : `<div style="display:flex; width:100%; height:100%; align-items:center; justify-content:center; font-size:8rem; color:rgba(255,255,255,0.3);">${initialHtml}</div>`;

    return `
      <div class="glass-card projector-card" style="width: 100%; max-width: 400px; border-radius: var(--radius-xl); overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
        <div style="height: 400px; background: linear-gradient(135deg, #1a1a2e, #2a2a4a); position: relative; display: flex; justify-content: center; align-items: center; overflow: hidden;">
          ${imgHtml}
        </div>
        <div style="padding: 30px; text-align: center; background: rgba(19, 25, 64, 0.9);">
          <h3 style="font-size: 2.5rem; margin-bottom: 15px; color: #fff;">${p.name}</h3>
          <div class="badge-role" style="display: inline-block; font-size: 1.4rem; padding: 8px 20px; border-radius: 30px; margin-bottom: 25px;">${p.role}</div>
          <div style="display: flex; justify-content: space-around; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px;">
            <div style="text-align: center;">
              <span style="display: block; font-size: 1rem; color: var(--text-3); text-transform: uppercase;">Base Price</span>
              <strong style="font-size: 1.8rem; color: var(--accent-gold);">${this.formatPoints(p.basePrice)}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    if (!this.state || this.state.phase === 'idle') {
      this.contentEl.innerHTML = `<div class="projector-waiting">Waiting for next player...</div>`;
      return;
    }

    if (this.state.phase === 'results') {
      this.contentEl.innerHTML = `<div class="projector-waiting">Auction Ended. View stats on admin screen.</div>`;
      return;
    }

    const p = this.state.currentPlayer;
    const bidStr = this.state.currentBid > 0 ? this.formatPoints(this.state.currentBid) : this.formatPoints(p.basePrice);
    
    let bidderHtml = '<span style="color: var(--text-3)">No Bids Yet</span>';
    if (this.state.currentBidderTeam) {
      const team = this.state.currentBidderTeam;
      bidderHtml = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 16px;">
          <img src="${team.logo}" alt="" onerror="this.style.display='none'" style="width: 60px; height: 60px; object-fit: contain;">
          <span style="color: ${team.color}">${team.name}</span>
        </div>
      `;
    }

    let statusLabel = 'Current Bid';
    if (this.state.phase === 'sold') statusLabel = 'SOLD FOR';
    if (this.state.phase === 'unsold') statusLabel = 'UNSOLD';

    let timerClass = '';
    if (this.state.timerRemaining <= 10 && this.state.timerRemaining > 0) timerClass = 'warning';
    if (this.state.timerRemaining <= 5 && this.state.timerRemaining > 0) timerClass = 'danger';

    let timerHtml = '';
    if (this.state.phase === 'bidding' && this.state.timerRemaining !== null) {
      const roundedTime = Math.ceil(this.state.timerRemaining);
      timerHtml = `<div id="projector-timer-display" class="projector-timer ${timerClass}">00:${roundedTime.toString().padStart(2, '0')}</div>`;
    } else if (this.state.phase === 'sold') {
      timerHtml = `<div class="projector-timer" style="color: var(--accent-green)">SOLD!</div>`;
    } else if (this.state.phase === 'unsold') {
      timerHtml = `<div class="projector-timer" style="color: var(--accent-red)">UNSOLD</div>`;
    }

    this.contentEl.innerHTML = `
      <div class="projector-player-area">
        ${this.renderPlayerCard(p)}
      </div>
      <div class="projector-info-area">
        <div class="projector-status-box">
          <div class="projector-bid-label">${statusLabel}</div>
          <div class="projector-bid-amount">${bidStr}</div>
          <div class="projector-bidder">${bidderHtml}</div>
        </div>
        ${timerHtml}
      </div>
      <div style="position: absolute; bottom: 15px; right: 20px; color: rgba(255,255,255,0.2); font-size: 0.9rem; pointer-events: none;">
        Double-click anywhere for Fullscreen
      </div>
    `;
  }
}

// Start app
document.addEventListener('DOMContentLoaded', () => {
  const app = new ProjectorApp();
  app.init();
});
