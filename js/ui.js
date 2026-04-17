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

  renderHeader(currentView, stats = {}, soundMuted = false) {
    const views = [
      { id: 'setup',   label: 'Setup' },
      { id: 'players', label: 'Players' },
      { id: 'rules',   label: 'Rules' },
      { id: 'auction', label: 'Auction' },
      { id: 'results', label: 'Results' },
    ];

    const isFs = !!document.fullscreenElement;

    this.headerEl.innerHTML = `
      <div class="nav-brand">NAKRE PREMIER LEAGUE 3.0</div>
      <nav class="nav-links">
        ${views.map(v => `
          <button class="nav-link ${currentView === v.id ? 'active' : ''}" data-view="${v.id}">${v.label}</button>
        `).join('')}
      </nav>
      <div class="nav-right">
        <div class="nav-stats">
          ${stats.remaining !== undefined ? `
            <span>Remaining:<span class="nav-stat-value">${stats.remaining}</span></span>
            <span>Sold:<span class="nav-stat-value">${stats.sold || 0}</span></span>
            <span>Unsold:<span class="nav-stat-value">${stats.unsold || 0}</span></span>
          ` : ''}
        </div>
        <button class="btn-commentary-toggle ${currentView === 'auction' ? 'active' : ''}" id="commentary-toggle-btn" title="Toggle Live Commentary">
          🎙️
        </button>
        <button class="btn-sound-toggle" id="sound-toggle-btn" title="${soundMuted ? 'Unmute Sound' : 'Mute Sound'}">
          ${soundMuted ? '🔇' : '🔊'}
        </button>
        <button class="btn-reset-auction" id="reset-auction-btn" title="Start New Auction / Reset">🔄 New Auction</button>
        <button class="btn-fullscreen" id="fullscreen-btn" title="${isFs ? 'Exit Fullscreen' : 'Enter Fullscreen'}">
          ${isFs ? '⊗' : '⛶'}
        </button>
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // SETUP PAGE
  // ═══════════════════════════════════════════

  renderSetup(teams, selectedTeamIds, timerDuration = 30) {
    const allSelected = teams.length > 0 && teams.every(t => selectedTeamIds.has(t.id));

    this.mainEl.innerHTML = `
      <div class="setup-page">
        <div class="setup-header">
          <h1 class="hero-title">NAKRE PREMIER LEAGUE 3.0 2026</h1>
          <p class="hero-subtitle">Select teams to participate in the auction</p>
        </div>
        <div style="text-align:center;">
          <label class="select-all-teams-label" id="select-all-teams-btn">
            <span class="custom-checkbox ${allSelected ? 'checked' : ''}"></span>
            Select All Teams
          </label>
        </div>
        <div class="teams-grid">
          ${teams.map(team => `
            <div class="team-select-card ${selectedTeamIds.has(team.id) ? 'selected' : ''}"
                 data-team-id="${team.id}"
                 style="--team-color: ${team.color}">
              <div class="team-check-icon">✓</div>
              <div class="team-logo-circle" style="background: ${team.color}; color: ${team.textColor}; overflow:hidden;">
                ${team.logo ? `<img src="${team.logo}" alt="${team.shortName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : team.shortName}
              </div>
              <div class="team-name">${team.name}</div>
              <div class="team-purse">${fmt(team.purse)}</div>
              <div class="team-people-row">
                <div class="flip-card" data-flip-card>
                  <div class="flip-card-inner">
                    <div class="flip-card-front">
                      <div class="team-person-img">
                        ${team.ownerImage ? `<img src="${team.ownerImage}" alt="${team.owner}">` : '👤'}
                      </div>
                      <div class="team-person-info">
                        <span class="team-person-label">Owner</span>
                        <span class="team-person-name">${team.owner}</span>
                      </div>
                    </div>
                    <div class="flip-card-back">
                      <span class="flip-back-label">Owner</span>
                      ${team.ownerImage ? `<img src="${team.ownerImage}" alt="${team.owner}">` : '<div style="font-size:2rem;">👤</div>'}
                      <span class="flip-back-name">${team.owner}</span>
                    </div>
                  </div>
                </div>
                <div class="flip-card" data-flip-card>
                  <div class="flip-card-inner">
                    <div class="flip-card-front">
                      <div class="team-person-img icon-player">
                        ${team.iconPlayerImage ? `<img src="${team.iconPlayerImage}" alt="${team.iconPlayer}">` : '⭐'}
                      </div>
                      <div class="team-person-info">
                        <span class="team-person-label">Icon Player</span>
                        <span class="team-person-name" style="color:var(--accent-gold)">${team.iconPlayer}</span>
                      </div>
                    </div>
                    <div class="flip-card-back">
                      <span class="flip-back-label">Icon Player</span>
                      ${team.iconPlayerImage ? `<img src="${team.iconPlayerImage}" alt="${team.iconPlayer}">` : '<div style="font-size:2rem;">⭐</div>'}
                      <span class="flip-back-name" style="color:var(--accent-gold)">${team.iconPlayer}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Timer Duration Setting -->
        <div class="timer-setting-card">
          <div class="timer-setting-header">
            <span class="timer-setting-icon">⏱️</span>
            <h3>Bid Timer</h3>
          </div>
          <p class="timer-setting-desc">Set countdown duration per bid. Timer resets on each new bid.</p>
          <div class="timer-setting-options">
            <select id="timer-duration" class="timer-select">
              <option value="0" ${timerDuration === 0 ? 'selected' : ''}>Disabled</option>
              <option value="15" ${timerDuration === 15 ? 'selected' : ''}>15 seconds</option>
              <option value="20" ${timerDuration === 20 ? 'selected' : ''}>20 seconds</option>
              <option value="30" ${timerDuration === 30 ? 'selected' : ''}>30 seconds</option>
              <option value="45" ${timerDuration === 45 ? 'selected' : ''}>45 seconds</option>
              <option value="60" ${timerDuration === 60 ? 'selected' : ''}>60 seconds</option>
            </select>
          </div>
        </div>

        <div class="setup-footer">
          <p>${selectedTeamIds.size} team${selectedTeamIds.size !== 1 ? 's' : ''} selected (minimum 2 required)</p>
          <button class="btn btn-primary btn-lg" id="start-auction-btn" ${selectedTeamIds.size < 2 ? 'disabled' : ''}>
            🏏 Start Auction
          </button>
        </div>
      </div>
    `;

    // Bind flip card click and auto-flip
    this._bindFlipCards();
  }
  // ═══════════════════════════════════════════
  // RULES PAGE (post player-select, pre-auction)
  // ═══════════════════════════════════════════

  renderRules() {
    this.mainEl.innerHTML = `
      <div class="rules-page">
        <div class="rules-header">
          <div class="rules-icon">📜</div>
          <h1 class="rules-title">NAKRE PREMIER LEAGUE 3.0 – Auction Guidelines & Rules</h1>
          <p class="rules-subtitle">Please read all guidelines and rules carefully before proceeding</p>
          <button class="rules-download-btn" id="download-rules-pdf-btn">📥 Download PDF</button>
        </div>

        <div class="rules-grid">
          <!-- 1. Auction Rules -->
          <div class="rules-card">
            <div class="rules-card-header">
              <span class="rules-card-icon">💰</span>
              <h3>Auction Rules</h3>
            </div>
            <ul class="rules-list">
              <li>Each team has a fixed budget of <strong>1,00,000 pts</strong></li>
              <li>Base price starts from <strong>1,000 pts</strong></li>
              <li>Bid increments:
                <div class="rules-table">
                  <div class="rules-row"><span>1,000 – 10,000</span><span>→ +500</span></div>
                  <div class="rules-row"><span>10,000 – 20,000</span><span>→ +1,000</span></div>
                  <div class="rules-row"><span>Above 20,000</span><span>→ +2,000</span></div>
                </div>
              </li>
            </ul>
          </div>

          <!-- 2. Bidding Rules -->
          <div class="rules-card">
            <div class="rules-card-header">
              <span class="rules-card-icon">🏏</span>
              <h3>Bidding Rules</h3>
            </div>
            <ul class="rules-list">
              <li>A team <strong>cannot bid consecutively</strong> on the same player</li>
              <li>Minimum bid increment must be followed</li>
              <li>Bid must be within team's <strong>remaining budget</strong></li>
              <li>Once sold, a player cannot be re-auctioned (except in unsold round)</li>
            </ul>
          </div>

          <!-- 3. Team Building -->
          <div class="rules-card">
            <div class="rules-card-header">
              <span class="rules-card-icon">👥</span>
              <h3>Team Building</h3>
            </div>
            <ul class="rules-list">
              <li>Each team must stay within their <strong>total budget</strong></li>
              <li>Maximum squad size: <strong>14 players</strong></li>
              <li>Build a balanced squad with batsmen, bowlers, and all-rounders</li>
            </ul>
          </div>

          <!-- 4. Re-Auction -->
          <div class="rules-card">
            <div class="rules-card-header">
              <span class="rules-card-icon">♻️</span>
              <h3>Re-Auction</h3>
            </div>
            <ul class="rules-list">
              <li>Unsold players can be re-auctioned after the main auction round</li>
              <li>Re-auction is based on organizer confirmation</li>
              <li>Same rules apply in the re-auction round</li>
            </ul>
          </div>

          <!-- 5. General Guidelines -->
          <div class="rules-card">
            <div class="rules-card-header">
              <span class="rules-card-icon">📋</span>
              <h3>General Guidelines</h3>
            </div>
            <ul class="rules-list">
              <li>Only <strong>3–4 members per team</strong> are allowed to be present during the auction</li>
              <li>All participants are expected to maintain <strong>discipline and professionalism</strong> throughout the event</li>
            </ul>
          </div>

          <!-- 6. Code of Conduct -->
          <div class="rules-card rules-card-dont">
            <div class="rules-card-header">
              <span class="rules-card-icon">⚖️</span>
              <h3>Code of Conduct</h3>
            </div>
            <ul class="rules-list">
              <li>No <strong>arguments, fighting, or disruptive behavior</strong> will be tolerated</li>
              <li>No <strong>alcohol or inappropriate activities</strong> are allowed during the auction</li>
              <li>Participants must <strong>respect all teams, organizers,</strong> and decisions made during the event</li>
            </ul>
          </div>

          <!-- 7. Fair Play -->
          <div class="rules-card rules-card-do">
            <div class="rules-card-header">
              <span class="rules-card-icon">🤝</span>
              <h3>Fair Play</h3>
            </div>
            <ul class="rules-list">
              <li>All teams must follow the auction rules and bidding guidelines <strong>strictly</strong></li>
              <li>Any <strong>misuse or violation</strong> may result in disqualification or penalties</li>
            </ul>
          </div>

          <!-- 8. Authority & Decisions -->
          <div class="rules-card">
            <div class="rules-card-header">
              <span class="rules-card-icon">🏛️</span>
              <h3>Authority & Decisions</h3>
            </div>
            <ul class="rules-list">
              <li>The <strong>NPL Management Team's decision is final</strong> in all matters</li>
              <li>In case of any disputes, changes, or unexpected situations: the organizers reserve the right to <strong>modify rules or take necessary actions</strong></li>
              <li>All participants are expected to <strong>comply without objection</strong></li>
            </ul>
          </div>
        </div>

        <div class="rules-footer">
          <button class="btn btn-primary btn-lg" id="proceed-rules-btn">
            ⚡ Proceed to Auction
          </button>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // PLAYER SELECTION PAGE (post-setup, pre-auction)
  // ═══════════════════════════════════════════

  renderPlayerSelect(players, selectedPlayerIds, currentFilter = 'All', searchQuery = '') {
    const roles = ['All', 'Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'];

    // Sort alphabetically
    let sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    let filtered = sorted;
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

    const allFilteredSelected = filtered.length > 0 && filtered.every(p => selectedPlayerIds.has(p.name));

    this.mainEl.innerHTML = `
      <div class="player-select-page">
        <div class="player-select-header">
          <div>
            <h1 class="hero-title" style="font-size:clamp(1.8rem,3.5vw,2.8rem)">Select Players for Auction</h1>
            <p class="hero-subtitle">Choose which players to include in this auction</p>
          </div>
          <div class="player-select-actions">
            <label class="select-all-label" id="select-all-players-btn">
              <span class="custom-checkbox ${allFilteredSelected ? 'checked' : ''}"></span>
              Select All ${currentFilter !== 'All' ? currentFilter + 's' : 'Players'}
            </label>
            <span class="player-select-count">${selectedPlayerIds.size} / ${players.length} selected</span>
          </div>
        </div>

        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:20px;">
          <div class="pool-filters">
            ${roles.map(r => `
              <button class="filter-btn ${currentFilter === r ? 'active' : ''}" data-role="${r}">
                ${r === 'All' ? 'All' : r === 'Wicket-Keeper' ? '🧤 WK' : (ROLE_CONFIG[r]?.icon || '') + ' ' + r}
              </button>
            `).join('')}
          </div>
          <input type="text" class="search-input" placeholder="Search players..." id="player-select-search" value="${searchQuery}">
        </div>

        <div class="players-grid player-select-grid">
          ${filtered.map((player, index) => {
            const role = ROLE_CONFIG[player.role] || {};
            const isSelected = selectedPlayerIds.has(player.name);
            const serialNo = sorted.findIndex(p => p.name === player.name) + 1;
            return `
              <div class="player-pool-card player-select-item ${isSelected ? 'ps-selected' : ''}" data-player-name="${player.name}">
                <div class="player-serial-no">${serialNo}</div>
                <div class="ps-check-icon">${isSelected ? '✓' : ''}</div>
                <div class="player-initials" style="background: linear-gradient(135deg, ${role.color || '#6366f1'}, ${role.color || '#6366f1'}88); overflow: hidden; width:56px; height:56px;">
                  ${player.image ? `<img src="${player.image}" alt="${player.name}" style="width:100%;height:100%;object-fit:cover;object-position:top;">` : getInitials(player.name)}
                </div>
                <div class="player-name">${player.name}</div>
                <div class="player-meta">
                  <span class="badge badge-role" style="background: ${role.color}22; color: ${role.color}">${role.icon || ''} ${player.role}</span>
                  ${player.isWK ? '<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;">🧤 WK</span>' : ''}
                </div>
                <div class="player-base">Base: ${fmt(player.basePrice)}</div>
              </div>
            `;
          }).join('')}
          ${filtered.length === 0 ? '<p style="grid-column:1/-1; text-align:center; color:var(--text-4); padding:40px;">No players found</p>' : ''}
        </div>

        <div class="setup-footer" style="margin-top:24px; display:flex; flex-direction:column; align-items:center;">
          <p>${selectedPlayerIds.size} player${selectedPlayerIds.size !== 1 ? 's' : ''} selected for auction</p>
          <button class="btn btn-primary btn-lg" id="confirm-players-btn" ${selectedPlayerIds.size === 0 ? 'disabled' : ''}>
            🏏 Proceed to Auction with ${selectedPlayerIds.size} Players
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

    // Sort alphabetically A→Z (case-insensitive)
    let sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    let filtered = sorted;
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
          ${filtered.map((player, index) => {
            const role = ROLE_CONFIG[player.role] || {};
            // Get original serial number from sorted full list
            const serialNo = sorted.findIndex(p => p.name === player.name) + 1;
            return `
              <div class="player-pool-card">
                <div class="player-serial-no">${serialNo}</div>
                <div class="player-initials player-img-trigger" style="background: linear-gradient(135deg, ${role.color || '#6366f1'}, ${role.color || '#6366f1'}88); overflow: hidden; width:64px; height:64px; cursor:pointer;" data-player-img="${player.image || ''}" data-player-name="${player.name}" title="View Image">
                  ${player.image ? `<img src="${player.image}" alt="${player.name}" style="width:100%;height:100%;object-fit:cover;object-position:top;">` : getInitials(player.name)}
                  ${player.image ? '<div class="player-img-overlay">🔍</div>' : ''}
                </div>
                <div class="player-name">${player.name}</div>
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

      <!-- Player Image Popup -->
      <div class="player-img-modal" id="player-img-modal" style="display:none;">
        <div class="player-img-modal-backdrop" id="player-img-modal-close"></div>
        <div class="player-img-modal-content">
          <button class="player-img-modal-x" id="player-img-modal-x">&times;</button>
          <img id="player-img-modal-img" src="" alt="">
          <div class="player-img-modal-name" id="player-img-modal-name"></div>
          <button class="player-img-download-btn" id="player-img-download-btn">📥 Download Full Image</button>
        </div>
      </div>
    `;

    // Bind image popup events
    this._bindImagePopup();
  }

  /** Bind click events for player image popup */
  _bindImagePopup() {
    let currentImgSrc = '';
    let currentImgName = '';

    document.querySelectorAll('.player-img-trigger').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const img = el.dataset.playerImg;
        const name = el.dataset.playerName;
        if (!img) return;
        currentImgSrc = img;
        currentImgName = name;
        const modal = document.getElementById('player-img-modal');
        const modalImg = document.getElementById('player-img-modal-img');
        const modalName = document.getElementById('player-img-modal-name');
        if (modal && modalImg && modalName) {
          modalImg.src = img;
          modalImg.alt = name;
          modalName.textContent = name;
          modal.style.display = 'flex';
        }
      });
    });

    // Close on X button
    document.getElementById('player-img-modal-x')?.addEventListener('click', () => {
      document.getElementById('player-img-modal').style.display = 'none';
    });

    // Close on backdrop click
    document.getElementById('player-img-modal-close')?.addEventListener('click', () => {
      document.getElementById('player-img-modal').style.display = 'none';
    });

    // Download button
    document.getElementById('player-img-download-btn')?.addEventListener('click', () => {
      if (!currentImgSrc) return;
      const a = document.createElement('a');
      a.href = currentImgSrc;
      a.download = (currentImgName || 'player') + '_photo' + (currentImgSrc.includes('.png') ? '.png' : '.jpg');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }

  /** Bind flip card click events + start auto-flip */
  _bindFlipCards() {
    const allCards = document.querySelectorAll('[data-flip-card]');

    // Manual click toggle (stops auto for that card)
    allCards.forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        // If auto-flipping, stop it on click
        card.classList.remove('auto-flipping');
        card.classList.toggle('flipped');
      });
    });

    // Start synchronized auto-flip for all cards
    // Small delay to let cards render
    setTimeout(() => {
      allCards.forEach(card => {
        card.classList.add('auto-flipping');
      });
    }, 1500);
  }

  /** Show reset confirmation modal */
  showResetConfirmModal() {
    this.closeResetConfirmModal();
    const modal = document.createElement('div');
    modal.id = 'reset-confirm-modal';
    modal.className = 'reset-confirm-overlay';
    modal.innerHTML = `
      <div class="reset-confirm-card">
        <div class="reset-confirm-icon">🔄</div>
        <h3>Start New Auction?</h3>
        <p>Are you sure you want to start a new auction? All saved auction data will be cleared.</p>
        <div class="reset-confirm-actions">
          <button class="btn btn-danger btn-lg" id="reset-confirm-yes">Yes, Reset</button>
          <button class="btn btn-ghost btn-lg" id="reset-confirm-no">No, Cancel</button>
        </div>
      </div>
    `;
    document.getElementById('app').appendChild(modal);

    // Close on overlay click (not on card)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeResetConfirmModal();
    });
  }

  /** Close reset confirmation modal */
  closeResetConfirmModal() {
    const existing = document.getElementById('reset-confirm-modal');
    if (existing) existing.remove();
  }

  // ═══════════════════════════════════════════
  // AUCTION PAGE
  // ═══════════════════════════════════════════

  renderAuction(state, connectedMobiles = []) {
    if (state.phase === 'complete') {
      this.renderAuctionComplete(state);
      return;
    }

    this.mainEl.innerHTML = `
      <div class="auction-layout">
        ${this._renderTeamsSidebar(state, connectedMobiles)}
        ${this._renderAuctionCenter(state)}
        ${this._renderInfoPanel(state, connectedMobiles)}
        ${this._renderActivityLog(state)}
      </div>
    `;
  }

  _renderTeamsSidebar(state, connectedMobiles = []) {
    const connectedIds = new Set(connectedMobiles.map(m => m.teamId));
    return `
      <div class="auction-sidebar">
        ${state.teams.map(team => {
          const isHighest = state.currentBidder === team.id;
          const isFull = team.squad.length >= 14;
          const pursePct = (team.purse / 100000) * 100;
          const barClass = pursePct < 15 ? 'critical' : pursePct < 40 ? 'low' : '';
          const isMobileConnected = connectedIds.has(team.id);
          return `
            <div class="sidebar-team ${isHighest ? 'highest-bidder' : ''} ${isFull ? 'squad-full' : ''}"
                 style="--team-color: ${team.color}">
              <div class="sidebar-team-logo" style="background: ${team.color}; color: ${team.textColor}; overflow:hidden;">
                ${team.logo ? `<img src="${team.logo}" alt="${team.shortName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : team.shortName}
              </div>
              <div class="sidebar-team-info">
                <div class="sidebar-team-name">
                  ${team.shortName}
                  ${isMobileConnected ? '<span class="mobile-indicator" title="Connected via mobile">📱</span>' : ''}
                </div>
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
          <div class="player-auction-initials" style="background: linear-gradient(135deg, ${role.color || '#6366f1'}, ${role.color || '#6366f1'}99); border-radius: var(--radius-md);">
            ${player.image ? `<img src="${player.image}" alt="${player.name}" style="width:100%;height:100%;object-fit:cover;object-position:top;">` : getInitials(player.name)}
          </div>
          <div class="player-auction-name">${player.name}</div>
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

  _renderInfoPanel(state, connectedMobiles = []) {
    const hasBids = state.bidHistory.length > 0;
    const bidderTeam = state.currentBidderTeam;
    const mobileCount = connectedMobiles.length;

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

        <!-- Bid Timer -->
        ${state.timerEnabled && state.phase === 'bidding' ? `
        <div class="bid-info-card timer-card" id="timer-card">
          <div class="timer-ring-wrap">
            <svg class="timer-ring" viewBox="0 0 120 120">
              <circle class="timer-ring-bg" cx="60" cy="60" r="52" />
              <circle class="timer-ring-progress" id="timer-ring-progress" cx="60" cy="60" r="52"
                      stroke-dasharray="326.73" stroke-dashoffset="0" />
            </svg>
            <div class="timer-ring-text" id="timer-ring-text">${state.timerDuration}</div>
          </div>
          <div class="timer-label">Bid Timer</div>
        </div>
        ` : ''}
        <div class="bid-info-card mobile-bid-card">
          <div class="bid-current-label">📱 Mobile Bidding</div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;">
            <span style="font-size:0.78rem; color:${mobileCount > 0 ? 'var(--accent-green)' : 'var(--text-4)'}">
              ${mobileCount > 0 ? `${mobileCount} device${mobileCount !== 1 ? 's' : ''} connected` : 'No devices connected'}
            </span>
            <button class="btn btn-primary btn-sm" id="generate-qr-btn" style="font-size:0.72rem; padding:5px 12px;">
              📲 QR / Link
            </button>
          </div>
          ${mobileCount > 0 ? `
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
              ${connectedMobiles.map(m => `
                <span style="font-size:0.65rem; padding:2px 8px; border-radius:var(--radius-full); background:rgba(16,185,129,0.1); color:var(--accent-green); border:1px solid rgba(16,185,129,0.2);">
                  📱 ${m.teamShortName}
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>

        ${state.phase === 'bidding' ? `
        <div class="bid-info-card quick-bid-card">
          <div class="bid-current-label">⚡ Quick Bid</div>
          <div class="quick-bid-form">
            <input type="number" id="quick-bid-amount" class="quick-bid-input"
                   value="${state.nextBidAmount}" min="${state.currentPlayer?.basePrice || 0}" step="500"
                   placeholder="Bid amount">
            <select id="quick-bid-team" class="quick-bid-select">
              <option value="">Select Team</option>
              ${state.teams.map(t => `
                <option value="${t.id}" ${state.currentBidder === t.id ? 'disabled' : ''}>${t.shortName} (${fmt(t.purse)})</option>
              `).join('')}
            </select>
            <button class="btn btn-primary btn-sm" id="quick-bid-btn" style="width:100%">💰 Place Bid</button>
          </div>
        </div>
        ` : ''}

        <div class="bid-info-card" style="flex:1; overflow-y:auto; min-height:180px;">
          <div class="bid-history-header">
            <div class="bid-history-title">Bid History</div>
            <div class="bid-history-controls">
              <button class="btn-undo-redo" id="undo-bid-btn" title="Undo last bid" ${!state.canUndo ? 'disabled' : ''}>↩ Undo</button>
              <button class="btn-undo-redo" id="redo-bid-btn" title="Redo bid" ${!state.canRedo ? 'disabled' : ''}>↪ Redo</button>
            </div>
          </div>
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
              <p style="color: var(--text-4); font-size: 0.82rem; text-align:center; padding: 20px 0;">
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
    const hasUnsold = state.unsoldCount > 0;

    this.mainEl.innerHTML = `
      <div class="auction-complete">
        <div class="auction-complete-icon">🏆</div>
        <h2>Auction Complete!</h2>
        <p>${state.soldCount} players sold • ${state.unsoldCount} players unsold</p>

        ${hasUnsold ? `
          <div class="reauction-prompt">
            <div class="reauction-prompt-icon">♻️</div>
            <h3>Re-Auction Unsold Players?</h3>
            <p class="reauction-prompt-desc">
              ${state.unsoldCount} player${state.unsoldCount !== 1 ? 's' : ''} went unsold. 
              Would you like to conduct a re-auction round for them?
            </p>
            <div class="reauction-prompt-players">
              ${state.unsoldPlayers.slice(0, 8).map(p => `
                <span class="reauction-player-chip">${p.name}</span>
              `).join('')}
              ${state.unsoldPlayers.length > 8 ? `<span class="reauction-player-chip more">+${state.unsoldPlayers.length - 8} more</span>` : ''}
            </div>
            <div class="reauction-prompt-actions">
              <button class="btn btn-reauction-yes btn-lg" id="reauction-yes-btn">
                ✅ Yes, Re-Auction
              </button>
              <button class="btn btn-reauction-no btn-lg" id="reauction-no-btn">
                ❌ No, View Results
              </button>
            </div>
          </div>
        ` : `
          <div class="auction-complete-actions">
            <button class="btn btn-primary btn-lg" id="view-results-btn">📊 View Results</button>
          </div>
        `}
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // RESULTS PAGE
  // ═══════════════════════════════════════════

  renderResults(state, activeTab = 'squads') {
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
          <h2>NAKRE PREMIER LEAGUE 3.0 - 2026</h2>
          <p>${state.soldCount} players sold across ${state.teams.length} teams</p>
          <div style="margin-top:16px; display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
            <button class="btn btn-primary" id="download-all-posters-btn">📥 Download All Team Posters</button>
          </div>
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

        <!-- Tab Switcher -->
        <div class="results-tabs">
          <button class="results-tab-btn ${activeTab === 'squads' ? 'active' : ''}" id="results-tab-squads">
            👥 Team Squads
          </button>
          <button class="results-tab-btn ${activeTab === 'analytics' ? 'active' : ''}" id="results-tab-analytics">
            📊 Analytics
          </button>
        </div>

        ${activeTab === 'squads' ? this._renderSquadsTab(state) : this._renderAnalyticsTab(state)}

        ${state.unsoldPlayers.length > 0 ? `
          <div class="unsold-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h3 style="margin: 0;">❌ Unsold Players (${state.unsoldPlayers.length})</h3>
              <button id="reauction-btn" class="btn btn-primary" style="background: var(--accent-gold); color: #fff;">
                ♻️ Re-auction Unsold Players
              </button>
            </div>
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

  _renderSquadsTab(state) {
    return `
      <div class="results-teams-grid">
        ${state.teams.map(team => `
          <div class="result-team-card">
            <div class="result-team-header" style="--team-color: ${team.color}">
              <div class="result-team-logo" style="background: ${team.color}; color: ${team.textColor}; overflow:hidden;">
                ${team.logo ? `<img src="${team.logo}" alt="${team.shortName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : team.shortName}
              </div>
              <div class="result-team-info">
                <div class="result-team-name">${team.name}</div>
                <div class="result-team-meta">
                  <span>Spent: ${fmt(team.totalSpent)}</span>
                  <span>Purse: ${fmt(team.purse)}</span>
                  <span>Squad: ${team.squad.length}/14</span>
                </div>
              </div>
              <div class="result-team-people">
                ${team.ownerImage ? `
                  <div class="result-team-avatar-wrap">
                    <img class="result-team-avatar" src="${team.ownerImage}" alt="${team.owner}" title="Owner: ${team.owner}">
                    <span class="result-team-avatar-label">Owner</span>
                  </div>
                ` : ''}
                ${team.iconPlayerImage ? `
                  <div class="result-team-avatar-wrap">
                    <img class="result-team-avatar icon" src="${team.iconPlayerImage}" alt="${team.iconPlayer}" title="Icon: ${team.iconPlayer}">
                    <span class="result-team-avatar-label">Icon</span>
                  </div>
                ` : ''}
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
            <div style="padding:8px 20px 14px; display:flex; gap:8px;">
              <button class="btn btn-ghost btn-sm poster-preview-btn" data-team-id="${team.id}">🖼️ Preview</button>
              <button class="btn btn-primary btn-sm poster-download-btn" data-team-id="${team.id}">📥 Download Poster</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderAnalyticsTab(state) {
    // Top 5 most expensive players
    const top5 = [...state.soldPlayers].sort((a, b) => b.price - a.price).slice(0, 5);
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    // Team spending - sorted by total spent
    const teamsBySpend = [...state.teams].sort((a, b) => b.totalSpent - a.totalSpent);
    const maxSpend = Math.max(...state.teams.map(t => t.totalSpent), 1);

    // Category-wise spending per team
    const categoryData = state.teams.map(team => {
      const cats = { Batsman: 0, Bowler: 0, 'All-Rounder': 0 };
      team.squad.forEach(p => {
        if (cats[p.role] !== undefined) cats[p.role] += p.soldPrice;
      });
      return { team, cats };
    });

    // Most bidding wars (players with most bids)
    const biddingWars = [...state.soldPlayers]
      .filter(s => s.bidCount && s.bidCount > 1)
      .sort((a, b) => (b.bidCount || 0) - (a.bidCount || 0))
      .slice(0, 5);

    // Budget efficiency: avg price per player
    const efficiency = state.teams
      .filter(t => t.squad.length > 0)
      .map(t => ({
        team: t,
        avgPrice: Math.round(t.totalSpent / t.squad.length),
        playerCount: t.squad.length,
      }))
      .sort((a, b) => a.avgPrice - b.avgPrice);

    return `
      <div class="analytics-dashboard">
        <!-- Top 5 Most Expensive -->
        <div class="analytics-card analytics-card-wide">
          <div class="analytics-card-header">
            <span class="analytics-card-icon">💰</span>
            <h3>Top 5 Most Expensive Players</h3>
          </div>
          <div class="analytics-leaderboard">
            ${top5.map((sale, i) => `
              <div class="leaderboard-row">
                <span class="leaderboard-rank">${medals[i]}</span>
                <span class="leaderboard-name">${sale.player.name}</span>
                <span class="leaderboard-team" style="color: ${sale.teamColor}">${sale.teamShortName}</span>
                <span class="leaderboard-price">${fmt(sale.price)}</span>
              </div>
            `).join('')}
            ${top5.length === 0 ? '<p style="color:var(--text-4); text-align:center; padding:20px;">No sales yet</p>' : ''}
          </div>
        </div>

        <!-- Team Spending Chart -->
        <div class="analytics-card analytics-card-wide">
          <div class="analytics-card-header">
            <span class="analytics-card-icon">📊</span>
            <h3>Team Spending</h3>
          </div>
          <div class="analytics-bar-chart">
            ${teamsBySpend.map(team => `
              <div class="bar-chart-row">
                <span class="bar-chart-label" style="color: ${team.color}">${team.shortName}</span>
                <div class="bar-chart-track">
                  <div class="bar-chart-fill" style="width: ${(team.totalSpent / maxSpend * 100)}%; background: ${team.color};"></div>
                </div>
                <span class="bar-chart-value">${fmt(team.totalSpent)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Category Breakdown -->
        <div class="analytics-card">
          <div class="analytics-card-header">
            <span class="analytics-card-icon">🏏</span>
            <h3>Category-wise Spend</h3>
          </div>
          <div class="category-table">
            <div class="category-header-row">
              <span>Team</span>
              <span style="color:#3b82f6">🏏 Bat</span>
              <span style="color:#ef4444">🎯 Bowl</span>
              <span style="color:#f59e0b">⭐ AR</span>
            </div>
            ${categoryData.map(({ team, cats }) => `
              <div class="category-row">
                <span style="color:${team.color}; font-weight:600;">${team.shortName}</span>
                <span>${cats.Batsman > 0 ? fmt(cats.Batsman) : '—'}</span>
                <span>${cats.Bowler > 0 ? fmt(cats.Bowler) : '—'}</span>
                <span>${cats['All-Rounder'] > 0 ? fmt(cats['All-Rounder']) : '—'}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Budget Efficiency -->
        <div class="analytics-card">
          <div class="analytics-card-header">
            <span class="analytics-card-icon">⚡</span>
            <h3>Budget Efficiency</h3>
          </div>
          <div class="efficiency-list">
            ${efficiency.map((e, i) => `
              <div class="efficiency-row">
                <span class="efficiency-rank">${i + 1}</span>
                <span class="efficiency-team" style="color: ${e.team.color}">${e.team.shortName}</span>
                <span class="efficiency-detail">${e.playerCount} players</span>
                <span class="efficiency-avg">${fmt(e.avgPrice)} avg</span>
              </div>
            `).join('')}
            ${efficiency.length === 0 ? '<p style="color:var(--text-4); text-align:center; padding:20px;">No data yet</p>' : ''}
          </div>
        </div>

        <!-- Bidding Wars -->
        ${biddingWars.length > 0 ? `
        <div class="analytics-card analytics-card-wide">
          <div class="analytics-card-header">
            <span class="analytics-card-icon">🔥</span>
            <h3>Biggest Bidding Wars</h3>
          </div>
          <div class="analytics-leaderboard">
            ${biddingWars.map((sale, i) => `
              <div class="leaderboard-row">
                <span class="leaderboard-rank">${'🔥'.repeat(Math.min(3, Math.ceil((sale.bidCount || 0) / 3)))}</span>
                <span class="leaderboard-name">${sale.player.name}</span>
                <span class="leaderboard-team" style="color: ${sale.teamColor}">${sale.teamShortName}</span>
                <span class="leaderboard-price">${sale.bidCount || 0} bids</span>
              </div>
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

  // ═══════════════════════════════════════════
  // QR CODE MODAL
  // ═══════════════════════════════════════════

  /** Show QR code modal with mobile bidding link */
  showQRModal(url, ip, token) {
    // Remove existing modal if any
    this.closeQRModal();

    const qrImgSrc = `/api/qr?data=${encodeURIComponent(url)}`;

    const modal = document.createElement('div');
    modal.id = 'qr-modal';
    modal.className = 'qr-modal-overlay';
    modal.innerHTML = `
      <div class="qr-modal-card">
        <button class="qr-modal-close" id="close-qr-modal">&times;</button>
        <div class="qr-modal-icon">📱</div>
        <h3 class="qr-modal-title">Mobile Bidding Access</h3>
        <p class="qr-modal-desc">Scan this QR code or share the link to enable mobile bidding</p>

        <div class="qr-canvas-wrap">
          <img id="qr-image" src="${qrImgSrc}" alt="QR Code" width="220" height="220"
               style="display:block; border-radius:8px;"
               onerror="this.alt='QR code failed to load'; this.style.padding='60px 20px'; this.style.color='#94a3b8'; this.style.fontSize='14px'; this.style.textAlign='center';">
        </div>

        <div class="qr-link-box">
          <span class="qr-link-text" id="mobile-link-text">${url}</span>
          <button class="qr-copy-btn" id="copy-link-btn" title="Copy link">📋</button>
        </div>

        <div class="qr-info">
          <div class="qr-info-item">
            <span class="qr-info-label">Network IP</span>
            <span class="qr-info-value">${ip}:3000</span>
          </div>
          <div class="qr-info-item">
            <span class="qr-info-label">Expires</span>
            <span class="qr-info-value">24 hours</span>
          </div>
        </div>

        <p class="qr-hint">
          📌 Teams enter their <strong>short name</strong> (e.g. BFC, MI) as the team code to join.
          <br>All devices must be on the <strong>same Wi-Fi network</strong>.
        </p>
      </div>
    `;

    // Append inside #app so click delegation works
    document.getElementById('app').appendChild(modal);

    // Direct event listeners for reliability
    const closeBtn = modal.querySelector('#close-qr-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeQRModal();
      });
    }

    // Close on overlay click (not on card click)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeQRModal();
      }
    });

    // Copy link button
    const copyBtn = modal.querySelector('#copy-link-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(url).then(() => {
          this.showToast('📋 Link copied to clipboard!', 'success');
        }).catch(() => {
          const linkEl = modal.querySelector('#mobile-link-text');
          if (linkEl) {
            const range = document.createRange();
            range.selectNodeContents(linkEl);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            this.showToast('Link selected — press Ctrl+C to copy', 'info');
          }
        });
      });
    }
  }

  /** Close QR modal */
  closeQRModal() {
    const existing = document.getElementById('qr-modal');
    if (existing) existing.remove();
  }

  // ═══════════════════════════════════════════
  // TIMER DISPLAY
  // ═══════════════════════════════════════════

  /** Update the circular timer ring display */
  updateTimerDisplay(remaining, duration) {
    const progressEl = document.getElementById('timer-ring-progress');
    const textEl = document.getElementById('timer-ring-text');
    const cardEl = document.getElementById('timer-card');
    if (!progressEl || !textEl) return;

    const circumference = 326.73; // 2 * PI * 52
    const fraction = remaining / duration;
    const offset = circumference * (1 - fraction);

    progressEl.setAttribute('stroke-dashoffset', offset.toFixed(2));
    textEl.textContent = Math.ceil(remaining);

    // Color transitions based on urgency
    let color;
    if (remaining > 15) {
      color = '#10b981'; // green
    } else if (remaining > 5) {
      color = '#f59e0b'; // yellow/amber
    } else {
      color = '#ef4444'; // red
    }
    progressEl.style.stroke = color;
    textEl.style.color = color;

    // Pulse animation for last 5 seconds
    if (cardEl) {
      if (remaining <= 5 && remaining > 0) {
        cardEl.classList.add('timer-urgent');
      } else {
        cardEl.classList.remove('timer-urgent');
      }
    }
  }

  // ═══════════════════════════════════════════
  // SOUND BUTTON
  // ═══════════════════════════════════════════

  /** Update the sound toggle button icon */
  updateSoundButton(muted) {
    const btn = document.getElementById('sound-toggle-btn');
    if (btn) {
      btn.innerHTML = muted ? '🔇' : '🔊';
      btn.title = muted ? 'Unmute Sound' : 'Mute Sound';
    }
  }

  // ═══════════════════════════════════════════
  // LIVE COMMENTARY PANEL
  // ═══════════════════════════════════════════

  /** Render the floating commentary panel (creates if not existing) */
  renderCommentaryPanel(lines = []) {
    // Don't duplicate — if panel exists, just populate lines
    let panel = document.getElementById('commentary-panel');
    if (panel) return;

    panel = document.createElement('div');
    panel.id = 'commentary-panel';
    panel.className = 'commentary-panel';
    panel.innerHTML = `
      <div class="commentary-header" id="commentary-header">
        <div class="commentary-header-left">
          <div class="commentary-live-dot"></div>
          <span class="commentary-title">🎙️ Live Commentary</span>
          <span class="commentary-badge">LIVE</span>
        </div>
        <span class="commentary-toggle-icon">▼</span>
      </div>
      <div class="commentary-body" id="commentary-body">
        ${lines.length === 0 ? `
          <div class="commentary-empty">Commentary will appear here when the auction starts...</div>
        ` : ''}
      </div>
    `;

    document.getElementById('app').appendChild(panel);

    // Populate existing lines
    if (lines.length > 0) {
      const body = panel.querySelector('#commentary-body');
      lines.forEach(line => {
        this._insertCommentaryLine(body, line, false);
      });
      // Scroll to bottom
      body.scrollTop = body.scrollHeight;
    }
  }

  /** Append a single commentary line to the panel (with animation + auto-scroll) */
  appendCommentaryLine(line) {
    const body = document.getElementById('commentary-body');
    if (!body) return;

    // Remove empty state if present
    const empty = body.querySelector('.commentary-empty');
    if (empty) empty.remove();

    this._insertCommentaryLine(body, line, true);

    // Auto-scroll to bottom (smooth)
    requestAnimationFrame(() => {
      body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
    });

    // Prune old DOM lines (keep max 60 in DOM to prevent bloat)
    const allLines = body.querySelectorAll('.commentary-line');
    if (allLines.length > 60) {
      for (let i = 0; i < allLines.length - 60; i++) {
        allLines[i].remove();
      }
    }
  }

  /** Internal: insert a line element into the body */
  _insertCommentaryLine(body, line, animate) {
    const timeStr = new Date(line.timestamp).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const el = document.createElement('div');
    el.className = `commentary-line type-${line.type}`;
    if (!animate) el.style.animation = 'none';
    el.innerHTML = `
      <span class="commentary-line-time">${timeStr}</span>
      <span class="commentary-line-text">${line.text}</span>
    `;
    body.appendChild(el);
  }

  /** Toggle the commentary panel expand/collapse */
  toggleCommentaryPanel() {
    const panel = document.getElementById('commentary-panel');
    if (!panel) return;
    panel.classList.toggle('collapsed');

    // If expanded, scroll to bottom
    if (!panel.classList.contains('collapsed')) {
      const body = panel.querySelector('#commentary-body');
      if (body) {
        requestAnimationFrame(() => {
          body.scrollTop = body.scrollHeight;
        });
      }
    }
  }

  /** Remove the commentary panel from DOM */
  removeCommentaryPanel() {
    const panel = document.getElementById('commentary-panel');
    if (panel) panel.remove();
  }

  /** Check if commentary panel is currently visible */
  isCommentaryPanelVisible() {
    return !!document.getElementById('commentary-panel');
  }
}

