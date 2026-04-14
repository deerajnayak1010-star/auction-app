// ─────────────────────────────────────────────
// ui.js — UI Rendering for all views
// ─────────────────────────────────────────────

import { ROLE_CONFIG, LOCATION_CONFIG } from './data.js';
import { AuctionEngine } from './auction.js';

/** Get player initials (first letter of first + last name) */
function getInitials(name) {
  const parts = name.split(' ');
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Format points for display */
function fmt(pts) {
  return AuctionEngine.formatPoints(pts);
}

/** Abbreviate batting/bowling */
function abbr(hand) {
  if (!hand || hand === 'N/A') return '—';
  return hand.replace('Right ', 'R').replace('Left ', 'L');
}

export class UI {
  constructor() {
    this.headerEl = document.getElementById('header');
    this.mainEl = document.getElementById('main');
    this.toastContainer = document.getElementById('toast-container');
  }

  // ═══════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════

  renderHeader(currentView, stats = {}) {
    const views = [
      { id: 'setup',   label: 'Setup' },
      { id: 'players', label: 'Players' },
      { id: 'auction', label: 'Auction' },
      { id: 'results', label: 'Results' },
    ];

    this.headerEl.innerHTML = `
      <div class="nav-brand">NAKRE PREMIER LEAGUE</div>
      <nav class="nav-links">
        ${views.map(v => `
          <button class="nav-link ${currentView === v.id ? 'active' : ''}" data-view="${v.id}">${v.label}</button>
        `).join('')}
      </nav>
      <div class="nav-stats">
        ${stats.remaining !== undefined ? `
          <span>Remaining:<span class="nav-stat-value">${stats.remaining}</span></span>
          <span>Sold:<span class="nav-stat-value">${stats.sold || 0}</span></span>
          <span>Unsold:<span class="nav-stat-value">${stats.unsold || 0}</span></span>
        ` : ''}
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // SETUP PAGE
  // ═══════════════════════════════════════════

  renderSetup(teams, selectedTeamIds) {
    this.mainEl.innerHTML = `
      <div class="setup-page">
        <div class="setup-header">
          <h1 class="hero-title">NAKRE PREMIER LEAGUE</h1>
          <p class="hero-subtitle">Select teams to participate in the auction</p>
        </div>
        <div class="teams-grid">
          ${teams.map(team => `
            <div class="team-select-card ${selectedTeamIds.has(team.id) ? 'selected' : ''}"
                 data-team-id="${team.id}"
                 style="--team-color: ${team.color}">
              <div class="team-check-icon">✓</div>
              <div class="team-logo-circle" style="background: ${team.color}; color: ${team.textColor}">
                ${team.shortName}
              </div>
              <div class="team-name">${team.name}</div>
              <div class="team-purse">${fmt(team.purse)}</div>
              <div style="margin-top:6px; font-size:0.7rem; color:var(--text-3)">
                👤 Owner: <span style="color:var(--text-2)">${team.owner}</span>
              </div>
              <div style="font-size:0.7rem; color:var(--text-3)">
                ⭐ Icon: <span style="color:var(--accent-gold)">${team.iconPlayer}</span>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="setup-footer">
          <p>${selectedTeamIds.size} team${selectedTeamIds.size !== 1 ? 's' : ''} selected (minimum 2 required)</p>
          <button class="btn btn-primary btn-lg" id="start-auction-btn" ${selectedTeamIds.size < 2 ? 'disabled' : ''}>
            🏏 Start Auction
          </button>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // PLAYER POOL PAGE
  // ═══════════════════════════════════════════

  renderPlayerPool(players, currentFilter = 'All', searchQuery = '') {
    const roles = ['All', 'Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'];

    let filtered = players;
    if (currentFilter === 'Wicket-Keeper') {
      filtered = filtered.filter(p => p.isWK);
    } else if (currentFilter !== 'All') {
      filtered = filtered.filter(p => p.role === currentFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q)
      );
    }

    this.mainEl.innerHTML = `
      <div class="pool-page">
        <div class="pool-header">
          <h2>Player Pool <span style="color:var(--text-3); font-weight:400; font-size:1rem">(${players.length} players)</span></h2>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <div class="pool-filters">
              ${roles.map(r => `
                <button class="filter-btn ${currentFilter === r ? 'active' : ''}" data-role="${r}">
                  ${r === 'All' ? 'All' : r === 'Wicket-Keeper' ? '🧤 WK' : (ROLE_CONFIG[r]?.icon || '') + ' ' + r}
                </button>
              `).join('')}
            </div>
            <input type="text" class="search-input" placeholder="Search players..." id="player-search" value="${searchQuery}">
          </div>
        </div>
        <div class="players-grid">
          ${filtered.map(player => {
            const role = ROLE_CONFIG[player.role] || {};
            return `
              <div class="player-pool-card">
                <div class="player-initials" style="background: linear-gradient(135deg, ${role.color || '#6366f1'}, ${role.color || '#6366f1'}88); overflow: hidden;">
                  ${player.image ? \`<img src="\${player.image}" alt="\${player.name}" style="width:100%;height:100%;object-fit:cover;">\` : getInitials(player.name)}
                </div>
                <div class="player-name">\${player.name}</div>
                <div class="player-meta">
                  <span class="badge badge-role" style="background: ${role.color}22; color: ${role.color}">${role.icon || ''} ${player.role}</span>
                  ${player.isWK ? '<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;">🧤 WK</span>' : ''}
                </div>
                <div class="player-meta">
                  <span>📍 ${player.location}</span>
                  <span>${abbr(player.batting)} / ${abbr(player.bowling)}</span>
                </div>
                <div class="player-base">Base: ${fmt(player.basePrice)}</div>
              </div>
            `;
          }).join('')}
          ${filtered.length === 0 ? '<p style="grid-column:1/-1; text-align:center; color:var(--text-4); padding:40px;">No players found</p>' : ''}
        </div>
        <div class="pool-footer">
          <button class="btn btn-primary btn-lg" id="goto-auction-btn">🏏 Proceed to Auction</button>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // AUCTION PAGE
  // ═══════════════════════════════════════════

  renderAuction(state) {
    if (state.phase === 'complete') {
      this.renderAuctionComplete(state);
      return;
    }

    this.mainEl.innerHTML = `
      <div class="auction-layout">
        ${this._renderTeamsSidebar(state)}
        ${this._renderAuctionCenter(state)}
        ${this._renderInfoPanel(state)}
        ${this._renderActivityLog(state)}
      </div>
    `;
  }

  _renderTeamsSidebar(state) {
    return `
      <div class="auction-sidebar">
        ${state.teams.map(team => {
          const isHighest = state.currentBidder === team.id;
          const isFull = team.squad.length >= 14;
          const pursePct = (team.purse / 100000) * 100;
          const barClass = pursePct < 15 ? 'critical' : pursePct < 40 ? 'low' : '';
          return `
            <div class="sidebar-team ${isHighest ? 'highest-bidder' : ''} ${isFull ? 'squad-full' : ''}"
                 style="--team-color: ${team.color}">
              <div class="sidebar-team-logo" style="background: ${team.color}; color: ${team.textColor}">
                ${team.shortName}
              </div>
              <div class="sidebar-team-info">
                <div class="sidebar-team-name">${team.shortName}</div>
                <div class="sidebar-team-purse">${fmt(team.purse)}</div>
                <div class="sidebar-team-squad">${team.squad.length}/14 players</div>
                <div class="purse-bar">
                  <div class="purse-bar-fill ${barClass}" style="width: ${pursePct}%"></div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  _renderAuctionCenter(state) {
    if (state.phase === 'waiting') {
      return `
        <div class="auction-center">
          <div class="auction-waiting">
            <h2>Ready for Next Player</h2>
            <p>Player ${state.playerIndex + 1} of ${state.totalPlayers} • ${state.remainingPlayers} remaining</p>
            <button class="btn btn-primary btn-lg" id="nominate-btn">⚡ Nominate Next Player</button>
          </div>
        </div>
      `;
    }

    const player = state.currentPlayer;
    const role = ROLE_CONFIG[player.role] || {};

    return `
      <div class="auction-center">
        <div class="player-auction-card bidding" id="player-card">
          <div class="player-auction-initials" style="background: linear-gradient(135deg, ${role.color || '#6366f1'}, ${role.color || '#6366f1'}99); overflow: hidden;">
            ${player.image ? \`<img src="\${player.image}" alt="\${player.name}" style="width:100%;height:100%;object-fit:cover;">\` : getInitials(player.name)}
          </div>
          <div class="player-auction-name">\${player.name}</div>
          <div class="player-auction-meta">
            <span class="badge badge-role" style="background: ${role.color}22; color: ${role.color}">${role.icon || ''} ${player.role}</span>
            ${player.isWK ? '<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;">🧤 WK</span>' : ''}
            <span>📍 ${player.location}</span>
          </div>
          <div class="player-auction-meta" style="margin-top:4px; font-size:0.8rem;">
            <span>🏏 ${player.batting}</span>
            <span>🎯 ${player.bowling}</span>
          </div>
          <div class="player-auction-base">Base Price: <span>${fmt(player.basePrice)}</span></div>
        </div>

        <div class="bid-buttons-grid">
          ${state.teams.map(team => {
            return `
              <button class="team-bid-btn" data-team-id="${team.id}"
                      style="background: ${team.color}; color: ${team.textColor}; border-color: ${team.color}"
                      ${state.currentBidder === team.id ? 'disabled' : ''}>
                ${team.shortName}
              </button>
            `;
          }).join('')}
        </div>

        <div class="auction-actions">
          <button class="btn btn-success" id="sold-btn" ${!state.currentBidder ? 'disabled' : ''}>
            ✅ SOLD — ${fmt(state.currentBid)}
          </button>
          <button class="btn btn-danger" id="unsold-btn">
            ❌ UNSOLD
          </button>
        </div>
      </div>
    `;
  }

  _renderInfoPanel(state) {
    const hasBids = state.bidHistory.length > 0;
    const bidderTeam = state.currentBidderTeam;

    return `
      <div class="auction-info-panel">
        <div class="bid-info-card">
          <div class="bid-current-label">Current Bid</div>
          <div class="bid-current-amount" id="bid-amount">${state.phase === 'bidding' ? fmt(state.currentBid) : '—'}</div>
          ${bidderTeam ? `
            <div class="bid-current-team" style="color: ${bidderTeam.color}">
              🏆 ${bidderTeam.name}
            </div>
          ` : `
            <div class="bid-current-team">No bids yet</div>
          `}
          ${state.phase === 'bidding' ? `
            <div class="bid-increment-info">
              Next bid: ${fmt(state.nextBidAmount)} (+${fmt(state.increment)})
            </div>
          ` : ''}
        </div>

        <div class="bid-info-card" style="flex:1; overflow-y:auto;">
          <div class="bid-history-title">Bid History</div>
          <div class="bid-history-list">
            ${hasBids ? [...state.bidHistory].reverse().map(entry => `
              <div class="bid-history-entry">
                <span class="bid-history-team">
                  <span class="bid-history-dot" style="background: ${entry.teamColor}"></span>
                  ${entry.teamName}
                </span>
                <span class="bid-history-amount">${fmt(entry.amount)}</span>
              </div>
            `).join('') : `
              <p style="color: var(--text-4); font-size: 0.78rem; text-align:center; padding: 16px 0;">
                ${state.phase === 'bidding' ? 'Waiting for bids...' : 'Nominate a player to start'}
              </p>
            `}
          </div>
        </div>

        <div class="bid-info-card">
          <div class="bid-current-label">Auction Progress</div>
          <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:0.78rem;">
            <span style="color:var(--accent-green)">Sold: ${state.soldCount}</span>
            <span style="color:var(--accent-red)">Unsold: ${state.unsoldCount}</span>
            <span style="color:var(--text-3)">Left: ${state.remainingPlayers}</span>
          </div>
          <div class="purse-bar" style="margin-top:8px; height:6px;">
            <div class="purse-bar-fill" style="width: ${((state.soldCount + state.unsoldCount) / state.totalPlayers * 100)}%; background: var(--accent-indigo);"></div>
          </div>
        </div>
      </div>
    `;
  }

  _renderActivityLog(state) {
    const lastLog = state.auctionLog[0]; // newest first
    let logText = 'Auction started. Nominate the first player.';

    if (lastLog) {
      switch (lastLog.type) {
        case 'sold':
          logText = `🎉 ${lastLog.teamShortName} bought ${lastLog.player.name} for ${fmt(lastLog.price)}`;
          break;
        case 'unsold':
          logText = `❌ ${lastLog.player.name} went UNSOLD`;
          break;
        case 'bid':
          logText = `📢 ${lastLog.teamName} bid ${fmt(lastLog.amount)} for ${lastLog.playerName}`;
          break;
        case 'nominate':
          logText = `🏏 Player #${lastLog.index}: ${lastLog.player.name} is up for auction (Base: ${fmt(lastLog.player.basePrice)})`;
          break;
      }
    }

    return `
      <div class="auction-log">
        <span class="auction-log-label">LIVE</span>
        <span class="auction-log-text">${logText}</span>
      </div>
    `;
  }

  renderAuctionComplete(state) {
    this.mainEl.innerHTML = `
      <div class="auction-complete">
        <h2>🏆 Auction Complete!</h2>
        <p>${state.soldCount} players sold • ${state.unsoldCount} players unsold</p>
        <button class="btn btn-primary btn-lg" id="view-results-btn">📊 View Results</button>
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // RESULTS PAGE
  // ═══════════════════════════════════════════

  renderResults(state) {
    if (!state) {
      this.mainEl.innerHTML = `
        <div class="auction-complete">
          <h2 style="font-size:1.8rem; color:var(--text-2); -webkit-text-fill-color:var(--text-2);">No Auction Data</h2>
          <p>Start an auction first to see results here.</p>
          <button class="btn btn-primary" id="goto-setup-btn">Go to Setup</button>
        </div>
      `;
      return;
    }

    // Compute stats
    const totalSpent = state.teams.reduce((sum, t) => sum + t.totalSpent, 0);
    const mostExpensive = state.soldPlayers.length > 0
      ? state.soldPlayers.reduce((max, s) => s.price > max.price ? s : max, state.soldPlayers[0])
      : null;

    this.mainEl.innerHTML = `
      <div class="results-page">
        <div class="results-header">
          <h2>Auction Results</h2>
          <p>${state.soldCount} players sold across ${state.teams.length} teams</p>
        </div>

        <div class="results-stats">
          <div class="stat-card">
            <div class="stat-card-label">Total Spent</div>
            <div class="stat-card-value">${fmt(totalSpent)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label">Players Sold</div>
            <div class="stat-card-value">${state.soldCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label">Players Unsold</div>
            <div class="stat-card-value">${state.unsoldCount}</div>
          </div>
          ${mostExpensive ? `
            <div class="stat-card">
              <div class="stat-card-label">Most Expensive</div>
              <div class="stat-card-value">${fmt(mostExpensive.price)}</div>
              <div class="stat-card-sub">${mostExpensive.player.name} → ${mostExpensive.teamShortName}</div>
            </div>
          ` : ''}
        </div>

        <div class="results-teams-grid">
          ${state.teams.map(team => `
            <div class="result-team-card">
              <div class="result-team-header" style="--team-color: ${team.color}">
                <div class="result-team-logo" style="background: ${team.color}; color: ${team.textColor}">
                  ${team.shortName}
                </div>
                <div class="result-team-info">
                  <div class="result-team-name">${team.name}</div>
                  <div class="result-team-meta">
                    <span>Spent: ${fmt(team.totalSpent)}</span>
                    <span>Purse: ${fmt(team.purse)}</span>
                    <span>Squad: ${team.squad.length}/14</span>
                  </div>
                </div>
              </div>
              <div class="result-squad-list">
                ${team.squad.length > 0 ? team.squad.map(p => {
                  const rc = ROLE_CONFIG[p.role] || {};
                  return `
                    <div class="result-squad-item">
                      <div class="result-squad-player">
                        <span class="result-squad-role-dot" style="background: ${rc.color || '#6366f1'}"></span>
                        <span>${p.name}</span>
                        <span style="color:var(--text-4); font-size:0.7rem;">${rc.icon || ''} ${p.role}${p.isWK ? ' 🧤' : ''}</span>
                      </div>
                      <span class="result-squad-price">${fmt(p.soldPrice)}</span>
                    </div>
                  `;
                }).join('') : `
                  <div class="result-squad-empty">No players acquired</div>
                `}
              </div>
            </div>
          `).join('')}
        </div>

        ${state.unsoldPlayers.length > 0 ? `
          <div class="unsold-section">
            <h3>❌ Unsold Players (${state.unsoldPlayers.length})</h3>
            <div class="unsold-grid">
              ${state.unsoldPlayers.map(p => `
                <span class="unsold-chip">${p.name} • ${p.role}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // TOAST NOTIFICATIONS
  // ═══════════════════════════════════════════

  showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ═══════════════════════════════════════════
  // PARTIAL UPDATES (avoid full re-render)
  // ═══════════════════════════════════════════

  /** Update just the bid amount display and SOLD button text */
  updateBidDisplay(state) {
    const amountEl = document.getElementById('bid-amount');
    if (amountEl) {
      amountEl.textContent = fmt(state.currentBid);
      amountEl.classList.remove('bid-flash');
      void amountEl.offsetWidth; // trigger reflow
      amountEl.classList.add('bid-flash');
    }

    const soldBtn = document.getElementById('sold-btn');
    if (soldBtn) {
      soldBtn.disabled = !state.currentBidder;
      soldBtn.textContent = `✅ SOLD — ${fmt(state.currentBid)}`;
    }
  }

  /** Show SOLD overlay on the player card */
  showSoldOverlay() {
    const card = document.getElementById('player-card');
    if (card) {
      card.classList.remove('bidding');
      card.insertAdjacentHTML('beforeend', '<div class="auction-overlay sold">SOLD</div>');
    }
  }

  /** Show UNSOLD overlay on the player card */
  showUnsoldOverlay() {
    const card = document.getElementById('player-card');
    if (card) {
      card.classList.remove('bidding');
      card.insertAdjacentHTML('beforeend', '<div class="auction-overlay unsold">UNSOLD</div>');
    }
  }
}
