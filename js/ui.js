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

  renderHeader(currentView, stats = {}, soundMuted = false, commentaryVisible = false) {
    const primaryViews = [
      { id: 'live-match', label: '🏏 Live' },
      { id: 'auction',    label: '🏷️ Auction' },
      { id: 'results',    label: '📊 Results' },
      { id: 'gallery',    label: '📸 Gallery' },
      { id: 'awards',     label: '🏆 Awards' },
    ];
    const moreViews = [
      { id: 'setup',   label: '⚙️ Setup' },
      { id: 'players', label: '👥 Players' },
      { id: 'rules',   label: '📋 Rules' },
      { id: 'about',   label: 'ℹ️ About' },
      { id: 'history', label: '📜 NPL History' },
    ];

    const isFs = !!document.fullscreenElement;
    const moreIds = moreViews.map(v => v.id);
    const isMoreActive = moreIds.includes(currentView);
    const moreLabel = isMoreActive ? (moreViews.find(v => v.id === currentView)?.label || '⚙️ More') : '⚙️ More';

    if (currentView === 'login') {
      this.headerEl.innerHTML = `
        <div class="nav-brand" style="margin: 0 auto;">NAKRE PREMIER LEAGUE 3.0</div>
      `;
      return;
    }

    this.headerEl.innerHTML = `
      <div class="nav-brand">NAKRE PREMIER LEAGUE 3.0</div>
      <nav class="nav-links">
        ${primaryViews.map(v => `
          <button class="nav-link ${currentView === v.id ? 'active' : ''}" data-view="${v.id}">${v.label}</button>
        `).join('')}
        <div class="nav-more-menu">
          <button class="nav-link ${isMoreActive ? 'active' : ''}" id="nav-more-toggle">${moreLabel} ▾</button>
          <div class="nav-more-dropdown" id="nav-more-dropdown" style="display:none;">
            ${moreViews.map(v => `
              <button class="nav-more-item ${currentView === v.id ? 'active' : ''}" data-view="${v.id}">${v.label}</button>
            `).join('')}
          </div>
        </div>
      </nav>
      <div class="nav-right">
        <div class="nav-stats">
          ${stats.remaining !== undefined ? `
            <span>Remaining:<span class="nav-stat-value">${stats.remaining}</span></span>
            <span>Sold:<span class="nav-stat-value">${stats.sold || 0}</span></span>
            <span>Unsold:<span class="nav-stat-value">${stats.unsold || 0}</span></span>
          ` : ''}
        </div>
        <button class="btn-fullscreen" id="fullscreen-btn" title="${isFs ? 'Exit Fullscreen' : 'Enter Fullscreen'}">
          ${isFs ? '⊗' : '⛶'}
        </button>
        <div class="hamburger-menu">
          <button class="hamburger-btn" id="hamburger-toggle" title="Menu">☰</button>
          <div class="hamburger-dropdown" id="hamburger-dropdown" style="display:none;">
            <button class="hamburger-item ${commentaryVisible ? 'icon-on' : ''}" id="commentary-toggle-btn">🎙️ Commentary ${commentaryVisible ? 'ON' : 'OFF'}</button>
            <button class="hamburger-item ${!soundMuted ? 'icon-on' : ''}" id="sound-toggle-btn">${soundMuted ? '🔇' : '🔊'} Sound ${soundMuted ? 'OFF' : 'ON'}</button>
            <button class="hamburger-item" id="open-projector-btn">📺 Projector</button>
            <button class="hamburger-item" id="share-app-btn">📱 Share App</button>
            <button class="hamburger-item" id="reset-auction-btn">🔄 Reset Auction</button>
            <button class="hamburger-item" id="logout-btn">🚪 Logout</button>
          </div>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // LOGIN PAGE
  // ═══════════════════════════════════════════
  
  renderLogin() {
    this.mainEl.innerHTML = `
      <div class="login-page">
        <div class="login-card glass-card">
          <div class="login-icon">🔒</div>
          <h2 class="login-title">Admin Login</h2>
          <p class="login-subtitle">Please sign in to access the auction</p>
          <form class="login-form" onsubmit="event.preventDefault(); document.getElementById('login-btn').click();">
            <div class="input-group" style="text-align: left; margin-bottom: 16px;">
              <label for="login-username" style="display: block; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-2);">Username</label>
              <input type="text" id="login-username" class="search-input" style="width: 100%; box-sizing: border-box;" placeholder="Enter username" autocomplete="username">
            </div>
            <div class="input-group" style="text-align: left; margin-bottom: 24px;">
              <label for="login-password" style="display: block; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-2);">Password</label>
              <input type="password" id="login-password" class="search-input" style="width: 100%; box-sizing: border-box;" placeholder="Enter password" autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-primary btn-lg" id="login-btn" style="width: 100%;">Sign In</button>
          </form>
        </div>
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
              <li>Maximum bid for a single player: <strong>89,000 pts</strong>
                <div style="font-size: 0.82rem; color: var(--text-3); margin-top: 4px;">Budget must reserve 1,000 pts × remaining empty slots</div>
              </li>
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
              <li>Maximum squad size: <strong>14 players</strong>
                <div class="rules-table" style="margin-top: 6px;">
                  <div class="rules-row"><span>🏏 Auctioned Players</span><span><strong>12</strong></span></div>
                  <div class="rules-row"><span>👑 Owner</span><span><strong>1</strong></span></div>
                  <div class="rules-row"><span>⭐ Icon Player</span><span><strong>1</strong></span></div>
                  <div class="rules-row" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px; margin-top: 4px;"><span>Total per Team</span><span><strong>14</strong></span></div>
                </div>
              </li>
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
        <h3>Reset Auction?</h3>
        <p>Are you sure you want to reset? All saved auction data will be cleared.</p>
        <div class="reset-confirm-actions">
          <button class="btn btn-danger btn-lg" id="reset-confirm-yes">Yes, Reset</button>
          <button class="btn btn-ghost btn-lg" id="reset-confirm-no">No, Cancel</button>
        </div>
      </div>
    `;
    document.getElementById('app').appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeResetConfirmModal();
    });
  }

  closeResetConfirmModal() {
    const existing = document.getElementById('reset-confirm-modal');
    if (existing) existing.remove();
  }

  /** Show recall confirmation modal */
  showRecallConfirmModal(playerName, teamName, type = 'sold') {
    this.closeRecallConfirmModal();
    const isSold = type === 'sold';
    const modal = document.createElement('div');
    modal.id = 'recall-confirm-modal';
    modal.className = 'reset-confirm-overlay';
    modal.innerHTML = `
      <div class="reset-confirm-card recall-confirm-card">
        <div class="reset-confirm-icon">↩</div>
        <h3>Recall Last ${isSold ? 'Sale' : 'Unsold'}?</h3>
        <p>${isSold
          ? `This will reverse the sale of <strong>${playerName}</strong> from <strong>${teamName}</strong>.`
          : `This will bring back <strong>${playerName}</strong> from the unsold list.`
        }</p>
        <p style="font-size:0.82rem; color:var(--text-3); margin-top:4px;">${isSold
          ? "The player will be re-opened for bidding at base price. Team's purse will be refunded."
          : 'The player will be re-opened for bidding at base price.'
        }</p>
        <div class="reset-confirm-actions">
          <button class="btn btn-recall btn-lg" id="recall-confirm-yes">↩ Yes, Recall ${isSold ? 'Sale' : 'Unsold'}</button>
          <button class="btn btn-ghost btn-lg" id="recall-confirm-no">No, Keep It</button>
        </div>
      </div>
    `;
    document.getElementById('app').appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeRecallConfirmModal();
    });
  }

  closeRecallConfirmModal() {
    const existing = document.getElementById('recall-confirm-modal');
    if (existing) existing.remove();
  }

  /** Show clear tokens confirmation modal */
  showClearTokensModal() {
    this.closeClearTokensModal();
    const modal = document.createElement('div');
    modal.id = 'clear-tokens-modal';
    modal.className = 'reset-confirm-overlay';
    modal.innerHTML = `
      <div class="reset-confirm-card">
        <div class="reset-confirm-icon">🗑️</div>
        <h3>Clear Token Draw?</h3>
        <p>This will remove all group assignments and match fixtures.</p>
        <p style="font-size:0.82rem; color:var(--text-3); margin-top:4px;">You can draw tokens again after clearing.</p>
        <div class="reset-confirm-actions">
          <button class="btn btn-lg" id="clear-tokens-yes" style="background: #ef4444; color: #fff;">🗑️ Yes, Clear</button>
          <button class="btn btn-ghost btn-lg" id="clear-tokens-no">No, Keep It</button>
        </div>
      </div>
    `;
    document.getElementById('app').appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeClearTokensModal();
    });
  }

  closeClearTokensModal() {
    const existing = document.getElementById('clear-tokens-modal');
    if (existing) existing.remove();
  }

  // ═══════════════════════════════════════════
  // SCROLL REVEAL OBSERVER
  // ═══════════════════════════════════════════

  _initScrollReveal() {
    const els = document.querySelectorAll('.scroll-reveal');
    if (!els.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => observer.observe(el));
  }

  // ═══════════════════════════════════════════
  // ABOUT PAGE
  // ═══════════════════════════════════════════

  renderAbout() {
    this.mainEl.innerHTML = `
      <div class="about-page">
        <div class="about-hero scroll-reveal reveal-scale">
          <div class="about-hero-glow"></div>
          <div class="about-hero-content">
            <div class="about-avatar-wrap about-avatar-full">
              <img src="images/teams/Deepak Hegde_Full.png" alt="Deepak Hegde" class="about-avatar about-avatar-poster">
            </div>
            <h1 class="about-name">Deepak Hegde</h1>
            <p class="about-role">Developer & Architect</p>
            <div class="about-badge-row">
              <span class="about-badge">💻 Full-Stack Developer</span>
              <span class="about-badge">🏏 Cricket Enthusiast</span>
              <span class="about-badge">🎨 UI/UX Designer</span>
            </div>
          </div>
        </div>
        <div class="about-section scroll-reveal">
          <div class="about-section-icon">🏆</div>
          <h2>About the Auction Platform</h2>
          <p class="about-lead">
            The <strong>Nakre Premier League 3.0</strong> Auction Platform is a cutting-edge, real-time bidding system
            designed and developed by <strong>Deepak Hegde</strong> — built from the ground up to bring the thrill and
            excitement of a professional cricket auction right to Nakre's doorstep.
          </p>
          <p>
            What started as a simple idea to digitize the local auction process has evolved into a full-featured,
            professional-grade platform that rivals the technology behind major franchise leagues. Every pixel,
            every animation, every sound effect has been carefully crafted to deliver an unforgettable experience
            for players, team owners, and the audience alike.
          </p>
        </div>
        <div class="about-features scroll-reveal">
          <h2 style="text-align:center; margin-bottom:24px; color:var(--text-1);">Platform Highlights</h2>
          <div class="about-features-grid">
            <div class="about-feature-card"><div class="about-feature-icon">⚡</div><h3>Real-Time Bidding</h3><p>Live WebSocket-powered auction with instant bid updates, timer controls, and multi-device sync.</p></div>
            <div class="about-feature-card"><div class="about-feature-icon">📺</div><h3>Cinematic Projector</h3><p>Full-screen audience display with HD player cards, fireworks celebrations, and crowd sound effects.</p></div>
            <div class="about-feature-card"><div class="about-feature-icon">📱</div><h3>Mobile Bidding</h3><p>Team owners can bid directly from their phones via QR code — no app install required.</p></div>
            <div class="about-feature-card"><div class="about-feature-icon">🎙️</div><h3>AI Commentary</h3><p>Intelligent live commentary engine that narrates every bid, every sale, every dramatic moment.</p></div>
            <div class="about-feature-card"><div class="about-feature-icon">📊</div><h3>Analytics Dashboard</h3><p>Post-auction insights with spending charts, team composition analysis, and player statistics.</p></div>
            <div class="about-feature-card"><div class="about-feature-icon">🎨</div><h3>Team Posters</h3><p>Auto-generated HD team posters with squad details — ready for social media sharing.</p></div>
          </div>
        </div>
        <div class="about-section about-dev-note scroll-reveal reveal-scale">
          <blockquote class="about-quote">
            <span class="about-quote-mark">\u201C</span>
            Building this platform has been a labor of love. Combining my passion for cricket with technology
            to create something that brings the entire village together — that's what makes it truly special.
            Every line of code is written with one goal: making NPL 3.0 an event that Nakre will remember forever.
            <span class="about-quote-mark">\u201D</span>
          </blockquote>
          <p class="about-quote-author">— Deepak Hegde</p>
        </div>
        <div class="about-section scroll-reveal" style="text-align:center;">
          <h3 style="color:var(--text-2); margin-bottom:16px;">Built With</h3>
          <div class="about-badge-row" style="justify-content:center; flex-wrap:wrap;">
            <span class="about-badge">JavaScript ES6+</span>
            <span class="about-badge">HTML5 Canvas</span>
            <span class="about-badge">Web Audio API</span>
            <span class="about-badge">WebSockets</span>
            <span class="about-badge">SQLite</span>
            <span class="about-badge">Node.js</span>
            <span class="about-badge">CSS3 Animations</span>
          </div>
        </div>
      </div>
    `;
    this._initScrollReveal();
  }

  // ═══════════════════════════════════════════
  // NPL HISTORY PAGE
  // ═══════════════════════════════════════════

  renderHistory() {
    this.mainEl.innerHTML = `
      <div class="history-page">
        <div class="history-hero scroll-reveal reveal-scale">
          <div class="history-hero-glow"></div>
          <h1 class="history-title"><span class="history-title-sub">The Legacy of</span>NAKRE PREMIER LEAGUE</h1>
          <p class="history-tagline">Where passion meets competition. Where Nakre unites under one cricketing dream.</p>
        </div>
        <div class="history-organizer scroll-reveal reveal-left">
          <div class="history-organizer-card glass-card">
            <div class="about-avatar-wrap about-avatar-full">
              <img src="images/teams/Suraj Shetty_Full.png" alt="Suraj Shettey" class="about-avatar about-avatar-poster">
            </div>
            <div class="history-organizer-info">
              <h2>Suraj Shettey</h2>
              <p class="about-role" style="color:var(--accent-gold);">Founder & Organizer — NPL</p>
              <p class="history-organizer-desc">A true visionary and the driving force behind Nakre Premier League, <strong>Suraj Shettey</strong> has single-handedly transformed grassroots cricket in Nakre. What began as a small neighborhood tournament has grown into the most anticipated sporting event of the year — uniting players, families, and fans across the region.</p>
              <p class="history-organizer-desc">His relentless dedication, organizational excellence, and passion for nurturing local talent has made NPL more than just a tournament — it's a celebration of community, sportsmanship, and the undying spirit of cricket that runs through every lane of Nakre.</p>
              <div class="about-badge-row" style="margin-top:12px;">
                <span class="about-badge" style="background:rgba(245,158,11,0.15);color:var(--accent-gold);border-color:rgba(245,158,11,0.3);">👑 Founder</span>
                <span class="about-badge" style="background:rgba(245,158,11,0.15);color:var(--accent-gold);border-color:rgba(245,158,11,0.3);">🏏 3 Seasons</span>
                <span class="about-badge" style="background:rgba(245,158,11,0.15);color:var(--accent-gold);border-color:rgba(245,158,11,0.3);">🌟 Visionary Leader</span>
              </div>
            </div>
          </div>
        </div>
        <div class="history-timeline">
          <h2 style="text-align:center; margin-bottom:40px; color:var(--text-1); font-size:clamp(1.5rem,3vw,2rem);">The NPL Journey</h2>
          <div class="history-timeline-item scroll-reveal reveal-left">
            <div class="history-timeline-marker"><div class="history-timeline-dot" style="background: #6366f1;"></div><div class="history-timeline-line"></div></div>
            <div class="history-timeline-card glass-card">
              <div class="history-season-badge" style="background:linear-gradient(135deg, #6366f1, #8b5cf6);">NPL 1.0</div>
              <h3>The Beginning</h3>
              <p class="history-season-tagline">Where it all started — the first spark of cricket revolution in Nakre</p>
              <div class="history-season-desc"><p>The inaugural season of the Nakre Premier League was a historic moment for the community. Organized with sheer determination by Suraj Shettey, NPL 1.0 brought together local talent from every corner of Nakre for the first time in a structured, competitive format.</p><p>What started as a dream became reality — the roar of the crowd, the thrill of the auction, the joy of victory, and the grace of sportsmanship. NPL 1.0 proved that Nakre had the passion, the talent, and the spirit to create something truly extraordinary.</p></div>
              <div class="history-season-stats"><span>🏏 Season 1</span><span>🎯 The Foundation</span><span>🌱 Where Dreams Began</span></div>
            </div>
          </div>
          <div class="history-timeline-item scroll-reveal reveal-right">
            <div class="history-timeline-marker"><div class="history-timeline-dot" style="background: #10b981;"></div><div class="history-timeline-line"></div></div>
            <div class="history-timeline-card glass-card">
              <div class="history-season-badge" style="background:linear-gradient(135deg, #10b981, #059669);">NPL 2.0</div>
              <h3>The Evolution</h3>
              <p class="history-season-tagline">Bigger, better, bolder — NPL levels up</p>
              <div class="history-season-desc"><p>Building on the success of the first season, NPL 2.0 took everything to the next level. More teams, more players, more intense competition. The league grew beyond expectations, drawing spectators from neighboring villages and establishing NPL as the premier cricketing event in the region.</p><p>Suraj Shettey's vision expanded — better organization, improved infrastructure, and a growing community of cricketers who found their stage. NPL 2.0 wasn't just a tournament; it was a movement.</p></div>
              <div class="history-season-stats"><span>🏏 Season 2</span><span>📈 Growth & Excellence</span><span>🔥 The Movement Grows</span></div>
            </div>
          </div>
          <div class="history-timeline-item history-current scroll-reveal reveal-left">
            <div class="history-timeline-marker"><div class="history-timeline-dot" style="background: var(--accent-gold); box-shadow: 0 0 20px rgba(245,158,11,0.5);"></div></div>
            <div class="history-timeline-card glass-card history-card-current">
              <div class="history-season-badge" style="background:linear-gradient(135deg, #f59e0b, #d97706);">NPL 3.0</div>
              <div class="history-current-badge">🔴 CURRENT SEASON</div>
              <h3>The Revolution</h3>
              <p class="history-season-tagline">Technology meets tradition — the most ambitious NPL ever</p>
              <div class="history-season-desc"><p>NPL 3.0 is the most ambitious season yet — featuring <strong>8 powerhouse teams</strong>, <strong>92+ players</strong>, and for the first time ever, a fully digital auction platform with live projector display, mobile bidding, AI commentary, and cinematic celebrations.</p><p>This season represents the perfect fusion of Suraj Shettey's cricketing vision and cutting-edge technology. With real-time WebSocket bidding, HD player cards, fireworks animations, and team poster generation — NPL 3.0 sets a new standard for what a grassroots cricket league can achieve.</p><p style="font-weight:700; color:var(--accent-gold); margin-top:12px;">🏆 This isn't just cricket. This is the Nakre Premier League — where legends are born.</p></div>
              <div class="history-season-stats"><span>🏏 8 Teams</span><span>👥 92+ Players</span><span>💰 1,00,000 pts Budget</span><span>⚡ Digital Auction</span></div>
            </div>
          </div>
        </div>
        <div class="about-section about-dev-note scroll-reveal reveal-scale" style="margin-top:40px;">
          <blockquote class="about-quote">
            <span class="about-quote-mark">"</span>
            Cricket is not just a sport in Nakre — it's a way of life. NPL was born from the belief 
            that every talent deserves a stage, every team deserves a story, and every match deserves 
            to be remembered. Three seasons in, this dream is stronger than ever.
            <span class="about-quote-mark">"</span>
          </blockquote>
          <p class="about-quote-author">— Suraj Shettey, Founder & Organizer</p>
        </div>
      </div>
    `;
    this._initScrollReveal();
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
          const isFull = team.squad.length >= 12;
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
                  ${team.name}
                  ${isMobileConnected ? '<span class="mobile-indicator" title="Connected via mobile">📱</span>' : ''}
                </div>
                <div class="sidebar-team-purse">${fmt(team.purse)}</div>
                <div class="sidebar-team-squad">${team.squad.length}/12 players</div>
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
            ${state.canRecall ? `
              <div class="recall-bid-section">
                <div class="recall-bid-info">
                  <span class="recall-bid-icon">${state.lastSaleType === 'unsold' ? '❌' : '⚠️'}</span>
                  <span>${state.lastSaleType === 'unsold'
                    ? `Last unsold: <strong>${state.lastSalePlayer}</strong>`
                    : `Last sale: <strong>${state.lastSalePlayer}</strong> → <strong>${state.lastSaleTeam}</strong>`
                  }</span>
                </div>
                <button class="btn btn-recall btn-lg" id="recall-bid-btn">
                  ↩ Recall Last ${state.lastSaleType === 'unsold' ? 'Unsold' : 'Sale'}
                </button>
              </div>
            ` : ''}
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
                      ${state.currentBidder === team.id ? 'disabled' : ''}
                      title="${team.name}">
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
        case 'recall':
          logText = `↩ RECALLED: ${lastLog.player.name} sale to ${lastLog.teamShortName} reversed — re-bidding open!`;
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

  renderResults(state, activeTab = 'squads', opts = {}) {
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
            👥 Squads
          </button>
          <button class="results-tab-btn ${activeTab === 'analytics' ? 'active' : ''}" id="results-tab-analytics">
            📊 Analytics
          </button>
          <button class="results-tab-btn ${activeTab === 'standings' ? 'active' : ''}" id="results-tab-standings">
            📋 Standings
          </button>
          <button class="results-tab-btn ${activeTab === 'stats' ? 'active' : ''}" id="results-tab-stats">
            🃏 Player Stats
          </button>
          <button class="results-tab-btn ${activeTab === 'scorecard' ? 'active' : ''}" id="results-tab-scorecard">
            🏆 Scorecard
          </button>
          <button class="results-tab-btn ${activeTab === 'fixtures' ? 'active' : ''}" id="results-tab-fixtures">
            📅 Fixtures
          </button>
        </div>

        ${activeTab === 'squads' ? this._renderSquadsTab(state) : ''}
        ${activeTab === 'analytics' ? this._renderAnalyticsTab(state) : ''}
        ${activeTab === 'standings' ? this._renderStandingsTab(state, opts) : ''}
        ${activeTab === 'stats' ? this._renderPlayerStatsTab(state, opts) : ''}
        ${activeTab === 'scorecard' ? this._renderScorecardTab(state, opts) : ''}
        ${activeTab === 'fixtures' ? this._renderFixturesTab(state, opts) : ''}

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
                  <span>Squad: ${team.squad.length}/12</span>
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
  // SCORECARD TAB
  // ═══════════════════════════════════════════

  _renderScorecardTab(state, opts = {}) {
    const fmt = AuctionEngine.formatPoints;
    const matches = opts.matches || [];
    const honours = opts.honours || null;
    const view = opts.scorecardView || 'list';
    const activeMatch = opts.activeMatch || null;

    // ── VIEW: Match Scorecard Editor ──
    if (view === 'edit' && activeMatch) {
      return this._renderScorecardEditor(activeMatch, state);
    }

    // ── VIEW: Match List + Honours ──
    const honoursHtml = this._renderHonoursSection(state, honours, fmt);
    const statusBadge = (s) => {
      const map = { upcoming: '🔜 Upcoming', live: '🔴 Live', completed: '✅ Completed' };
      const cls = { upcoming: 'badge-upcoming', live: 'badge-live', completed: 'badge-completed' };
      return `<span class="sc-status-badge ${cls[s] || ''}">${map[s] || s}</span>`;
    };

    const teamLogo = (logo, short, color, tc) => logo
      ? `<img src="${logo}" alt="${short}" style="width:32px;height:32px;border-radius:50%;object-fit:contain;">`
      : `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:${color};color:${tc};font-size:0.6rem;font-weight:800;">${short}</span>`;

    return `
      <div class="scorecard-dashboard" style="animation: fadeIn 0.4s ease;">
        ${honoursHtml}

        <h2 style="text-align:center; margin:32px 0 20px;">🏏 Match Scorecards</h2>
        ${matches.length > 0 ? `
          <div class="sc-match-list">
            ${matches.map(m => `
              <div class="sc-match-item" data-sc-match="${m.matchId}">
                <div class="sc-match-item-header">
                  <span class="sc-match-id">Match ${m.matchId.replace('match-','')}</span>
                  ${statusBadge(m.status)}
                </div>
                <div class="sc-match-item-teams">
                  ${teamLogo(m.teamALogo, m.teamAShort, m.teamAColor, m.teamATextColor)}
                  <strong>${m.teamAShort}</strong>
                  ${m.status === 'completed' ? `<span style="font-size:0.75rem;color:var(--text-3);">${m.innings1.totalRuns}/${m.innings1.wickets}</span>` : ''}
                  <span class="sc-match-vs">VS</span>
                  ${m.status === 'completed' ? `<span style="font-size:0.75rem;color:var(--text-3);">${m.innings2.totalRuns}/${m.innings2.wickets}</span>` : ''}
                  <strong>${m.teamBShort}</strong>
                  ${teamLogo(m.teamBLogo, m.teamBShort, m.teamBColor, m.teamBTextColor)}
                </div>
                <div class="sc-match-item-info">${m.date} • ${m.time} • ${m.venue}</div>
                ${m.status === 'completed' ? (m.result.winner && m.result.winner !== 'tie' ? `<div class="sc-match-result-line">🏆 ${m.result.margin}</div>${m.result.playerOfMatch ? `<div style="font-size:0.8rem;color:var(--accent-gold);margin-top:2px;">⭐ POTM: ${m.result.playerOfMatch}</div>` : ''}` : `<div class="sc-match-result-line" style="color:var(--accent-gold);">🤝 Match Tied — Points Shared</div>`) : ''}
                <button class="btn btn-primary btn-sm sc-open-btn" data-sc-match="${m.matchId}">${m.status === 'completed' ? '📊 View Scorecard' : '✏️ Edit Scorecard'}</button>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="fixtures-empty">
            <p>📅 No matches available yet.</p>
            <p style="font-size:0.85rem; margin-top:8px;">Draw tokens in the <strong>Fixtures</strong> tab first to generate matches.</p>
          </div>
        `}

      </div>
    `;
  }

  _renderHonoursSection(state, honours, fmt) {
    const awards = [];
    if (honours && honours.completedCount > 0) {
      const h = honours;
      awards.push({ icon: '🏅', title: 'Man of the Match', name: h.motm?.name, team: h.motm?.team, stat: `${h.motm?.motmCount || 0} MOTM`, desc: 'Most MOTM Awards' });
      awards.push({ icon: '⭐', title: 'Man of the Series', name: h.mots?.name, team: h.mots?.team, stat: `${h.mots?.runs || 0}r / ${h.mots?.wickets || 0}w`, desc: 'Best Overall Performer' });
      awards.push({ icon: '🏏', title: 'Best Batsman', name: h.bestBatsman?.name, team: h.bestBatsman?.team, stat: `${h.bestBatsman?.runs || 0} runs`, desc: 'Most Tournament Runs' });
      awards.push({ icon: '🎯', title: 'Best Bowler', name: h.bestBowler?.name, team: h.bestBowler?.team, stat: `${h.bestBowler?.wickets || 0} wickets`, desc: 'Most Tournament Wickets' });
      awards.push({ icon: '👑', title: 'Best All-Rounder', name: h.bestAllRounder?.name, team: h.bestAllRounder?.team, stat: h.bestAllRounder ? `${h.bestAllRounder.runs}r/${h.bestAllRounder.wickets}w` : '—', desc: 'Best Combined Performance' });
    } else {
      const soldByRole = (r) => state.soldPlayers.filter(s => s.player.role === r);
      const best = (a) => a.length > 0 ? a.reduce((m, s) => s.price > m.price ? s : m, a[0]) : null;
      const mvp = best(state.soldPlayers);
      const mostBids = state.soldPlayers.length > 0 ? state.soldPlayers.reduce((m, s) => (s.bidCount||0) > (m.bidCount||0) ? s : m, state.soldPlayers[0]) : null;
      awards.push({ icon: '🏅', title: 'Man of the Match', name: mvp?.player?.name, team: mvp?.teamShortName, stat: mvp ? fmt(mvp.price) : '—', desc: 'Highest Auction Price', color: mvp?.teamColor });
      awards.push({ icon: '⭐', title: 'Man of the Series', name: mostBids?.player?.name, team: mostBids?.teamShortName, stat: mostBids ? `${mostBids.bidCount} bids` : '—', desc: 'Most Sought After', color: mostBids?.teamColor });
      awards.push({ icon: '🏏', title: 'Best Batsman', name: best(soldByRole('Batsman'))?.player?.name, team: best(soldByRole('Batsman'))?.teamShortName, stat: best(soldByRole('Batsman')) ? fmt(best(soldByRole('Batsman')).price) : '—', desc: 'Top Batsman Pick' });
      awards.push({ icon: '🎯', title: 'Best Bowler', name: best(soldByRole('Bowler'))?.player?.name, team: best(soldByRole('Bowler'))?.teamShortName, stat: best(soldByRole('Bowler')) ? fmt(best(soldByRole('Bowler')).price) : '—', desc: 'Top Bowler Pick' });
      awards.push({ icon: '👑', title: 'Best All-Rounder', name: best(soldByRole('All-Rounder'))?.player?.name, team: best(soldByRole('All-Rounder'))?.teamShortName, stat: best(soldByRole('All-Rounder')) ? fmt(best(soldByRole('All-Rounder')).price) : '—', desc: 'Top All-Rounder Pick' });
    }

    return `
      <div class="honours-section">
        <div class="honours-header">
          <span class="honours-icon">🏆</span>
          <h2>Individual Honours</h2>
          <p class="honours-subtitle">PLAYER AWARDS ${honours?.completedCount ? `(${honours.completedCount} MATCHES — RUNS & WICKETS)` : '(PRE-TOURNAMENT — AUCTION PICKS)'}</p>
        </div>
        <div class="honours-grid">
          ${awards.map((a, i) => `
            <div class="honour-card" style="animation-delay: ${i * 0.1}s">
              <div class="honour-icon">${a.icon}</div>
              <div class="honour-title">${a.title}</div>
              ${a.name ? `
                <div class="honour-player-name">${a.name}</div>
                <div class="honour-team" style="color: ${a.color || 'var(--accent-gold)'}">${a.team || ''}</div>
                <div class="honour-stat">${a.stat}</div>
              ` : `<div class="honour-empty">—</div>`}
              <div class="honour-desc">${a.desc}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderScorecardEditor(match, state) {
    const m = match;
    const renderBattingRow = (b, idx) => `
      <tr class="sc-bat-row" data-idx="${idx}">
        <td class="sc-bat-name">${b.name}</td>
        <td><input type="number" class="sc-input" data-field="runs" value="${b.runs}" min="0" placeholder="0"></td>
        <td><input type="number" class="sc-input" data-field="balls" value="${b.balls}" min="0" placeholder="0"></td>
        <td><input type="number" class="sc-input" data-field="fours" value="${b.fours}" min="0" placeholder="0"></td>
        <td><input type="number" class="sc-input" data-field="sixes" value="${b.sixes}" min="0" placeholder="0"></td>
        <td class="sc-sr">${b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '—'}</td>
        <td><input type="text" class="sc-input sc-input-wide" data-field="dismissal" value="${b.dismissal || ''}" placeholder="e.g. c X b Y"></td>
        <td><label class="sc-check"><input type="checkbox" data-field="isNotOut" ${b.isNotOut ? 'checked' : ''}> *</label></td>
      </tr>`;

    const renderBowlingRow = (b, idx) => `
      <tr class="sc-bowl-row" data-idx="${idx}">
        <td class="sc-bat-name">${b.name}</td>
        <td><input type="text" class="sc-input" data-field="overs" value="${b.overs}" placeholder="0.0"></td>
        <td><input type="number" class="sc-input" data-field="maidens" value="${b.maidens}" min="0" placeholder="0"></td>
        <td><input type="number" class="sc-input" data-field="runs" value="${b.runs}" min="0" placeholder="0"></td>
        <td><input type="number" class="sc-input" data-field="wickets" value="${b.wickets}" min="0" placeholder="0"></td>
        <td class="sc-econ">${b.overs > 0 ? (b.runs / parseFloat(b.overs)).toFixed(1) : '—'}</td>
      </tr>`;

    const renderInnings = (inn, num) => {
      const battingTeam = m[`team${inn.battingTeamId === m.teamAId ? 'A' : 'B'}Short`];
      const bowlingTeam = m[`team${inn.bowlingTeamId === m.teamAId ? 'A' : 'B'}Short`];
      return `
        <div class="sc-innings-card" data-innings="${num}">
          <div class="sc-innings-header">
            <h3>Innings ${num} — ${battingTeam} Batting</h3>
            <div class="sc-innings-summary">
              <input type="number" class="sc-input sc-summary-input" data-field="totalRuns" value="${inn.totalRuns}" placeholder="0" min="0"> /
              <input type="number" class="sc-input sc-summary-input" data-field="wickets" value="${inn.wickets}" placeholder="0" min="0" max="10">
              (<input type="text" class="sc-input sc-summary-input" data-field="overs" value="${inn.overs}" placeholder="0.0"> ov)
              <span class="sc-rr">RR: ${inn.runRate}</span>
              ${num === 2 ? `<span class="sc-target">Target: ${m.innings1.totalRuns + 1}</span>` : ''}
            </div>
          </div>

          <div class="sc-table-wrap">
            <table class="sc-table sc-batting-table">
              <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th><th>Dismissal</th><th>*</th></tr></thead>
              <tbody>${inn.batting.map((b, i) => renderBattingRow(b, i)).join('')}</tbody>
            </table>
          </div>

          <div class="sc-extras-row">
            <strong>Extras:</strong>
            <label>Wd <input type="number" class="sc-input sc-extra-input" data-extra="wides" value="${inn.extras.wides}" min="0"></label>
            <label>Nb <input type="number" class="sc-input sc-extra-input" data-extra="noBalls" value="${inn.extras.noBalls}" min="0"></label>
            <label>B <input type="number" class="sc-input sc-extra-input" data-extra="byes" value="${inn.extras.byes}" min="0"></label>
            <label>Lb <input type="number" class="sc-input sc-extra-input" data-extra="legByes" value="${inn.extras.legByes}" min="0"></label>
            <span class="sc-extras-total">Total: ${inn.extras.total}</span>
          </div>

          <h4 style="margin-top:16px;">🎯 ${bowlingTeam} Bowling</h4>
          <div class="sc-table-wrap">
            <table class="sc-table sc-bowling-table">
              <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
              <tbody>${inn.bowling.map((b, i) => renderBowlingRow(b, i)).join('')}</tbody>
            </table>
          </div>
        </div>`;
    };

    return `
      <div class="scorecard-dashboard sc-editor" style="animation: fadeIn 0.4s ease;" data-match-id="${m.matchId}">
        <button class="btn btn-ghost" id="sc-back-btn" style="margin-bottom:16px;">← Back to Match List</button>

        <div class="sc-match-header-card">
          <div class="sc-match-header-teams">
            <div style="text-align:center;">
              ${m.teamALogo ? `<img src="${m.teamALogo}" style="width:48px;height:48px;border-radius:50%;">` : ''}
              <div style="font-weight:700;color:${m.teamAColor};">${m.teamAShort}</div>
            </div>
            <div class="sc-match-header-vs">VS</div>
            <div style="text-align:center;">
              ${m.teamBLogo ? `<img src="${m.teamBLogo}" style="width:48px;height:48px;border-radius:50%;">` : ''}
              <div style="font-weight:700;color:${m.teamBColor};">${m.teamBShort}</div>
            </div>
          </div>
          <div class="sc-match-header-info">
            <span>${m.date} • ${m.time}</span> | <span>${m.venue}</span> | <span>${m.matchType} (${m.oversLimit} ov)</span>
          </div>
          <div class="sc-match-header-toss">
            <label>Toss: <select class="sc-select" data-field="tossWinner">
              <option value="">Select</option>
              <option value="${m.teamAId}" ${m.tossWinner===m.teamAId?'selected':''}>${m.teamAShort}</option>
              <option value="${m.teamBId}" ${m.tossWinner===m.teamBId?'selected':''}>${m.teamBShort}</option>
            </select></label>
            <label>Decision: <select class="sc-select" data-field="tossDecision">
              <option value="">Select</option>
              <option value="bat" ${m.tossDecision==='bat'?'selected':''}>Bat First</option>
              <option value="bowl" ${m.tossDecision==='bowl'?'selected':''}>Bowl First</option>
            </select></label>
          </div>
        </div>

        ${renderInnings(m.innings1, 1)}
        ${renderInnings(m.innings2, 2)}

        <div class="sc-result-card">
          <h3>🏆 Match Result</h3>
          <div class="sc-result-form">
            <label>Winner: <select class="sc-select" data-field="winner">
              <option value="">Select</option>
              <option value="${m.teamAId}" ${m.result.winner===m.teamAId?'selected':''}>${m.teamAShort}</option>
              <option value="${m.teamBId}" ${m.result.winner===m.teamBId?'selected':''}>${m.teamBShort}</option>
              <option value="tie" ${m.result.winner==='tie'?'selected':''}>Tie</option>
            </select></label>
            <label>Margin: <input type="text" class="sc-input" data-field="margin" value="${m.result.margin}" placeholder="e.g. 20 runs"></label>
            <label>Player of Match: <input type="text" class="sc-input" data-field="playerOfMatch" value="${m.result.playerOfMatch}" placeholder="Player name"></label>
          </div>
        </div>

        <div style="display:flex; gap:12px; justify-content:center; margin-top:24px;">
          <button class="btn btn-primary btn-lg" id="sc-save-btn">💾 Save Scorecard</button>
          <button class="btn btn-ghost btn-lg" id="sc-back-btn2">← Back</button>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  // FIXTURES TAB
  // ═══════════════════════════════════════════

  _renderFixturesTab(state, opts = {}) {
    const gd = state.groupDivision;
    const FIXED_A = 'bfcl';
    const FIXED_B = 'bfc';
    const getTeam = (id) => state.teams.find(t => t.id === id);
    let allFixtures = [];
    let knockouts = [];

    if (gd) {
      const rrPairs = (g) => [
        [g[0],g[1]], [g[2],g[3]],
        [g[0],g[2]], [g[1],g[3]],
        [g[0],g[3]], [g[1],g[2]]
      ];
      const pA = rrPairs(gd.groupA);
      const pB = rrPairs(gd.groupB);
      const day1 = [
        { pair: pA[0], group: 'A' }, { pair: pB[0], group: 'B' },
        { pair: pA[1], group: 'A' }, { pair: pB[1], group: 'B' },
        { pair: pA[2], group: 'A' }, { pair: pB[2], group: 'B' },
      ];
      const day2 = [
        { pair: pA[3], group: 'A' }, { pair: pB[3], group: 'B' },
        { pair: pA[4], group: 'A' }, { pair: pB[4], group: 'B' },
        { pair: pA[5], group: 'A' }, { pair: pB[5], group: 'B' },
      ];
      const scheduled = [...day1, ...day2];
      const day1Times = ['8:30 – 9:30','9:30 – 10:30','10:30 – 11:30','11:30 – 12:30','12:30 – 1:30','1:30 – 2:30'];
      const day2Times = ['8:30 – 9:30','9:30 – 10:30','10:30 – 11:30','11:30 – 12:30','12:30 – 1:30','1:30 – 2:30'];

      allFixtures = scheduled.map((s, i) => {
        const dayIdx = i < 6 ? 0 : 1;
        const slotIdx = dayIdx === 0 ? i : i - 6;
        const times = dayIdx === 0 ? day1Times : day2Times;
        return { matchNum: i + 1, teamA: getTeam(s.pair[0]), teamB: getTeam(s.pair[1]), group: s.group, day: dayIdx + 1, date: dayIdx === 0 ? '25 April 2026' : '26 April 2026', time: times[slotIdx] || '' };
      });

      // Build knockout data — use resolved teams from scorecard if available
      const koData = opts.knockoutMatches || [];
      const koMeta = [
        { label: 'Qualifier 1', desc: 'A1 vs B1 — Winner → Final', matchId: 'match-13', time: '2:30 – 3:30', accent: '#f59e0b' },
        { label: 'Eliminator', desc: 'A2 vs B2 — Loser eliminated', matchId: 'match-14', time: '3:30 – 4:30', accent: '#ef4444' },
        { label: 'Qualifier 2', desc: 'Loser Q1 vs Winner Eliminator', matchId: 'match-15', time: '4:30 – 5:30', accent: '#6366f1' },
        { label: '🏆 FINAL', desc: 'Winner Q1 vs Winner Q2', matchId: 'match-16', time: '5:30 – 6:30', accent: '#f59e0b' },
      ];
      knockouts = koMeta.map(ko => {
        const resolved = koData.find(m => m.matchId === ko.matchId);
        const hasTeams = resolved && resolved.teamAShort !== 'TBD' && resolved.teamBShort !== 'TBD';
        return { ...ko, teamA: hasTeams ? { short: resolved.teamAShort, color: resolved.teamAColor, textColor: resolved.teamATextColor, logo: resolved.teamALogo } : null, teamB: hasTeams ? { short: resolved.teamBShort, color: resolved.teamBColor, textColor: resolved.teamBTextColor, logo: resolved.teamBLogo } : null };
      });
    }

    // Render token slot
    const renderSlot = (tokenNum, teamId) => {
      const team = teamId ? getTeam(teamId) : null;
      if (team) {
        return `
          <div class="fixture-token-slot filled" style="--team-color: ${team.color}">
            <div class="fixture-token-logo" style="background: ${team.color}; color: ${team.textColor}">
              ${team.logo ? `<img src="${team.logo}" alt="${team.shortName}">` : team.shortName}
            </div>
            <div class="fixture-token-name">${team.shortName}</div>
          </div>
        `;
      }
      return `
        <div class="fixture-token-slot empty">
          <div class="fixture-token-placeholder">TOKEN ${tokenNum}</div>
        </div>
      `;
    };

    // Render fixed team slot
    const renderFixed = (teamId) => {
      const team = getTeam(teamId);
      if (!team) return '';
      return `
        <div class="fixture-token-slot fixed" style="--team-color: ${team.color}">
          <div class="fixture-token-logo" style="background: ${team.color}; color: ${team.textColor}">
            ${team.logo ? `<img src="${team.logo}" alt="${team.shortName}">` : team.shortName}
          </div>
          <div class="fixture-token-name">${team.name}</div>
          <span class="fixture-fixed-badge">FIXED</span>
        </div>
      `;
    };

    // Render match card
    const renderMatch = (fixture) => `
      <div class="fixture-match-card" draggable="true" data-match-num="${fixture.matchNum}" data-team-a="${fixture.teamA.id}" data-team-b="${fixture.teamB.id}" data-group="${fixture.group}">
        <div class="fixture-match-num">Match ${fixture.matchNum}</div>
        <div class="fixture-match-teams">
          <div class="fixture-match-team" style="--tc: ${fixture.teamA.color}">
            <div class="fixture-match-logo" style="background: ${fixture.teamA.color}; color: ${fixture.teamA.textColor}">
              ${fixture.teamA.logo ? `<img src="${fixture.teamA.logo}" alt="">` : fixture.teamA.shortName}
            </div>
            <span>${fixture.teamA.shortName}</span>
          </div>
          <div class="fixture-match-vs">VS</div>
          <div class="fixture-match-team" style="--tc: ${fixture.teamB.color}">
            <div class="fixture-match-logo" style="background: ${fixture.teamB.color}; color: ${fixture.teamB.textColor}">
              ${fixture.teamB.logo ? `<img src="${fixture.teamB.logo}" alt="">` : fixture.teamB.shortName}
            </div>
            <span>${fixture.teamB.shortName}</span>
          </div>
        </div>
        <div class="fixture-match-info">${fixture.date} • ${fixture.time || ''}</div>
      </div>
    `;

    return `
      <div class="fixtures-dashboard" style="animation: fadeIn 0.4s ease;">
        <!-- Group Division Header -->
        <div class="fixtures-header">
          <h2>NPL 3.0 GROUP DIVISION</h2>
          <p>25 & 26th April 2026</p>
          <div style="margin-top:16px; display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
            <button class="btn btn-primary btn-lg" id="draw-tokens-btn" ${state.fixturesLocked ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
              🎲 ${gd ? 'Re-Draw Tokens' : 'Draw Tokens'}
            </button>
            ${gd ? `
              <button class="btn btn-ghost btn-lg" id="clear-tokens-btn" ${state.fixturesLocked ? 'disabled style="opacity:0.4;cursor:not-allowed;border-color:rgba(239,68,68,0.15);color:#ef444480;"' : 'style="border-color: rgba(239,68,68,0.3); color: #ef4444;"'}>
                🗑️ Clear Draw
              </button>
              <button class="btn btn-primary btn-lg" id="download-fixtures-btn" style="background: linear-gradient(135deg, #10b981, #059669);">
                📥 Download HD Fixtures
              </button>
              <button class="btn btn-ghost btn-lg" id="lock-fixtures-btn" style="border-color:${state.fixturesLocked ? 'rgba(239,68,68,0.4);color:#ef4444;' : 'rgba(245,158,11,0.4);color:#f59e0b;'}">
                ${state.fixturesLocked ? '🔒 Unlock Fixtures' : '🔓 Lock Fixtures'}
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Group Cards -->
        <div class="fixtures-groups">
          <div class="fixture-group-card">
            <div class="fixture-group-label group-a">GROUP A</div>
            <div class="fixture-group-slots">
              ${renderFixed(FIXED_A)}
              ${gd ? renderSlot(1, gd.groupA[1]) : renderSlot(1, null)}
              ${gd ? renderSlot(3, gd.groupA[2]) : renderSlot(3, null)}
              ${gd ? renderSlot(5, gd.groupA[3]) : renderSlot(5, null)}
            </div>
          </div>
          <div class="fixture-group-card">
            <div class="fixture-group-label group-b">GROUP B</div>
            <div class="fixture-group-slots">
              ${renderFixed(FIXED_B)}
              ${gd ? renderSlot(2, gd.groupB[1]) : renderSlot(2, null)}
              ${gd ? renderSlot(4, gd.groupB[2]) : renderSlot(4, null)}
              ${gd ? renderSlot(6, gd.groupB[3]) : renderSlot(6, null)}
            </div>
          </div>
        </div>

        ${gd ? `
        <!-- Match Schedule -->
        <div class="fixtures-schedule">
          <h2 style="text-align:center; margin-bottom:24px;">📅 Match Schedule</h2>

          <div class="fixtures-day-section">
            <h3 class="fixtures-day-label">🗓️ Day 1 — 25 April 2026 (6 League Matches) <span style="font-size:0.7rem; color:var(--text-4); font-weight:500; margin-left:8px;">↕ drag to reorder</span></h3>
            <div style="font-size:0.8rem;color:var(--text-3);text-align:center;margin-bottom:12px;">🏏 8:30 AM – 2:30 PM &nbsp;•&nbsp; 1 hour per match</div>
            <div class="fixtures-match-grid" id="fixtures-day1-grid" data-day="1">
              ${allFixtures.filter(f => f.day === 1).map(renderMatch).join('')}
            </div>
            <div style="text-align:center;padding:8px;color:var(--text-4);font-size:0.75rem;font-style:italic;">🍽️ Lunch / Buffer: 2:30 – 3:30 PM</div>
          </div>

          <div class="fixtures-day-section">
            <h3 class="fixtures-day-label">🗓️ Day 2 — 26 April 2026 (League + Knockouts)</h3>
            <div style="font-size:0.8rem;color:var(--text-3);text-align:center;margin-bottom:12px;">🏏 League: 8:30 AM – 2:30 PM &nbsp;•&nbsp; 🔥 Knockouts: 2:30 – 6:30 PM</div>
            <div class="fixtures-match-grid" id="fixtures-day2-grid" data-day="2">
              ${allFixtures.filter(f => f.day === 2).map(renderMatch).join('')}
            </div>
          </div>

          <!-- Knockout Stage -->
          <div class="fixtures-day-section">
            <h3 class="fixtures-day-label">🔥 Knockout Stage — 26 April 2026 (2:30 – 6:30 PM)</h3>
            <div class="fixtures-match-grid">
              ${knockouts.map((ko, idx) => {
                const tA = ko.teamA;
                const tB = ko.teamB;
                const teamAHTML = tA ? `
                      <div class="fixture-match-team" style="--tc: ${tA.color};">
                        <div class="fixture-match-logo" style="background:${tA.color};color:${tA.textColor || '#fff'};">${tA.logo ? `<img src="${tA.logo}" alt="">` : tA.short}</div>
                        <span>${tA.short}</span>
                      </div>` : `
                      <div class="fixture-match-team" style="--tc: #666;">
                        <div class="fixture-match-logo" style="background:#333;color:#999;">TBD</div>
                        <span>TBD</span>
                      </div>`;
                const teamBHTML = tB ? `
                      <div class="fixture-match-team" style="--tc: ${tB.color};">
                        <div class="fixture-match-logo" style="background:${tB.color};color:${tB.textColor || '#fff'};">${tB.logo ? `<img src="${tB.logo}" alt="">` : tB.short}</div>
                        <span>${tB.short}</span>
                      </div>` : `
                      <div class="fixture-match-team" style="--tc: #666;">
                        <div class="fixture-match-logo" style="background:#333;color:#999;">TBD</div>
                        <span>TBD</span>
                      </div>`;
                return `
                <div class="fixture-match-card knockout-card" style="border-top:3px solid ${ko.accent};">
                  <div class="fixture-match-num" style="color:${ko.accent};">Match ${13 + idx} — ${ko.label}</div>
                  <div class="fixture-knockout-desc" style="font-size:0.85rem;margin:8px 0;">${tA && tB ? `${tA.short} vs ${tB.short}` : ko.desc}</div>
                  <div class="fixture-match-teams" style="justify-content:center;">
                    ${teamAHTML}
                    <div class="fixture-match-vs">VS</div>
                    ${teamBHTML}
                  </div>
                  <div class="fixture-match-info">26 April 2026 • ${ko.time}</div>
                </div>`;
              }).join('')}
            </div>
            <div style="margin-top:16px; padding:16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg); text-align:center;">
              <div style="font-size:0.85rem; color:var(--text-2); line-height:1.8;">
                <strong style="color:var(--accent-gold);">Qualifier 1</strong>: A1 vs B1 → Winner to Final, Loser to Q2<br>
                <strong style="color:var(--accent-red);">Eliminator</strong>: A2 vs B2 → Loser out, Winner to Q2<br>
                <strong style="color:var(--accent-indigo);">Qualifier 2</strong>: Loser Q1 vs Winner Eliminator → Winner to Final<br>
                <strong style="color:var(--accent-gold);">🏆 Final</strong>: Winner Q1 vs Winner Q2
              </div>
            </div>
          </div>
        </div>
        ` : `
        <div class="fixtures-empty">
          <p>🎲 Click <strong>Draw Tokens</strong> to assign teams to groups and generate the match schedule.</p>
        </div>
        `}
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

  // ═══════════════════════════════════════════
  // STANDINGS TAB (Points Table)
  // ═══════════════════════════════════════════

  _renderStandingsTab(state, opts = {}) {
    const standings = opts.standings;
    if (!standings) {
      return `<div class="standings-section"><div class="fixtures-empty" style="padding:40px;text-align:center;"><p style="font-size:1.2rem;">📋 Points Table</p><p style="margin-top:8px;color:var(--text-3);">Draw tokens in <strong>Fixtures</strong> tab and complete scorecards to see standings.</p></div></div>`;
    }
    const renderGroup = (grp, label, color) => {
      return `<div class="standings-group"><div class="standings-group-title"><span class="standings-group-badge" style="background:${color}22;color:${color};">${label}</span></div><table class="standings-table"><thead><tr><th style="width:30px;">#</th><th style="text-align:left;padding-left:16px;">Team</th><th>M</th><th>W</th><th>L</th><th>T</th><th>Pts</th><th>NRR</th><th>Form</th><th></th></tr></thead><tbody>${grp.map((s,i) => {
        const isQ = i < 2 && s.played > 0;
        return `<tr class="${isQ?'standings-qualified':''}"><td style="font-weight:700;color:var(--text-3);">${i+1}</td><td><div class="team-cell">${s.team.logo?`<img class="team-logo-sm" src="${s.team.logo}" alt="${s.team.shortName}">`:`<span class="team-logo-sm" style="background:${s.team.color};color:${s.team.textColor||'#fff'};display:flex;align-items:center;justify-content:center;font-size:0.55rem;font-weight:800;">${s.team.shortName}</span>`}<span class="team-name-cell" style="color:${s.team.color}">${s.team.shortName}</span></div></td><td>${s.played}</td><td style="color:var(--accent-green);font-weight:700;">${s.won}</td><td style="color:var(--accent-red);">${s.lost}</td><td style="color:var(--accent-gold);">${s.noResult}</td><td style="font-weight:800;font-size:1rem;">${s.points}</td><td><span class="standings-nrr ${s.nrr>=0?'positive':'negative'}">${s.nrr>=0?'+':''}${s.nrr.toFixed(3)}</span></td><td><div class="form-indicator">${s.form.map(f=>`<span class="form-dot ${f}">${f}</span>`).join('')}${s.form.length===0?'<span style="color:var(--text-4);font-size:0.7rem;">—</span>':''}</div></td><td>${isQ?'<span class="standings-q-badge">✅ Q</span>':''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    };
    return `<div class="standings-section">${renderGroup(standings.groupA,'GROUP A','#3b82f6')}${renderGroup(standings.groupB,'GROUP B','#ef4444')}<p style="text-align:center;color:var(--text-4);font-size:0.8rem;margin-top:16px;">${standings.completedCount} matches completed • Top 2 from each group qualify for knockouts</p></div>`;
  }

  // ═══════════════════════════════════════════
  // PLAYER STATS TAB
  // ═══════════════════════════════════════════

  _renderPlayerStatsTab(state, opts = {}) {
    const data = opts.playerStats;
    if (!data || data.matchCount === 0) {
      return `<div class="player-cards-section"><div class="fixtures-empty" style="padding:40px;text-align:center;"><p style="font-size:1.2rem;">🃏 Player Stats</p><p style="margin-top:8px;color:var(--text-3);">Complete match scorecards to see leaderboards.</p></div></div>`;
    }
    const lb = data.leaderboards, medals = ['🥇','🥈','🥉'];
    const renderLB = (title, icon, items, statFn, subFn) => {
      if (!items || items.length === 0) return '';
      return `<div class="leaderboard-card"><div class="leaderboard-card-header"><span style="font-size:1.2rem;">${icon}</span><h4>${title}</h4></div><div class="leaderboard-card-body">${items.map((p,i) => `<div class="lb-row"><span class="lb-rank ${i<3?'lb-rank-'+(i+1):''}">${i<3?medals[i]:i+1}</span><span class="lb-name">${p.name}</span><span class="lb-team" style="color:${p.teamColor};background:${p.teamColor}15;">${p.teamShort}</span><div style="text-align:right;"><div class="lb-stat">${statFn(p)}</div>${subFn?`<div class="lb-sub">${subFn(p)}</div>`:''}</div></div>`).join('')}</div></div>`;
    };
    return `<div class="player-cards-section"><div style="text-align:center;margin-bottom:24px;"><h2>🃏 Player Performance Stats</h2><p style="color:var(--text-3);margin-top:4px;">${data.matchCount} matches completed</p></div><div class="leaderboard-grid">${renderLB('Top Run Scorers','🏏',lb.topRunScorers,p=>`${p.runs} runs`,p=>`${p.innings} inn • SR ${p.strikeRate}`)}${renderLB('Top Wicket Takers','🎯',lb.topWicketTakers,p=>`${p.wickets} wkts`,p=>`Eco ${p.economy} • Best ${p.bestBowling}`)}${renderLB('Best Strike Rate','⚡',lb.bestStrikeRate,p=>`SR ${p.strikeRate}`,p=>`${p.runs} runs off ${p.ballsFaced} balls`)}${renderLB('Best Economy','🎯',lb.bestEconomy,p=>`Eco ${p.economy}`,p=>`${p.oversBowled} ov • ${p.wickets} wkts`)}${renderLB('Most Sixes','💥',lb.mostSixes,p=>`${p.sixes} sixes`,p=>`${p.fours} fours • ${p.runs} runs`)}${renderLB('Most MOTM','🏅',lb.mostMotm,p=>`${p.motmCount} MOTM`,p=>`${p.matches} matches`)}${renderLB('Best Value Picks','🌟',lb.bestValue,p=>`${p.runs}r / ${p.wickets}w`,p=>`Bought @ ${(p.soldPrice||0).toLocaleString('en-IN')} pts`)}</div></div>`;
  }

  // ═══════════════════════════════════════════
  // LIVE MATCH VIEW
  // ═══════════════════════════════════════════

  renderLiveMatch(matchState, matchList = []) {
    if (!matchState) {
      const leagueMatches = matchList.filter(m => {
        const num = parseInt(m.matchId.replace('match-',''));
        return num <= 12;
      });
      const knockoutMatches = matchList.filter(m => {
        const num = parseInt(m.matchId.replace('match-',''));
        return num > 12;
      });
      const koLabels = { 'match-13': 'Q1', 'match-14': 'ELIM', 'match-15': 'Q2', 'match-16': 'FINAL' };
      const isTBD = (m) => m.teamAShort === 'TBD' || m.teamBShort === 'TBD';
      const statusBadge = (m) => m.status === 'completed' ? '<span style="color:#10b981;font-size:0.7rem;">✅ Done</span>' : m.status === 'live' ? '<span style="color:#f59e0b;font-size:0.7rem;">🔴 Live</span>' : '';

      const leagueHTML = leagueMatches.length > 0 ? `
        <h3 style="text-align:center;color:var(--text-2);margin-bottom:12px;">📋 League Matches (${leagueMatches.length})</h3>
        <div class="match-select-grid">${leagueMatches.map(m => `
          <div class="match-select-card" data-live-match="${m.matchId}">
            <div class="match-select-teams">${m.teamAShort} vs ${m.teamBShort}</div>
            <div class="match-select-info">Match ${m.matchId.replace('match-','')} • ${m.time || m.date || ''}</div>
            ${statusBadge(m)}
          </div>`).join('')}
        </div>` : '';

      const knockoutHTML = knockoutMatches.length > 0 ? `
        <h3 style="text-align:center;color:var(--accent-gold);margin:24px 0 12px;">🔥 Knockout Matches (${knockoutMatches.length})</h3>
        <div class="match-select-grid">${knockoutMatches.map(m => `
          <div class="match-select-card ${isTBD(m) ? 'knockout-tbd' : ''}" data-live-match="${m.matchId}" ${isTBD(m) ? 'style="opacity:0.6;pointer-events:none;"' : ''}>
            <div style="font-size:0.65rem;color:var(--accent-gold);font-weight:700;letter-spacing:1px;">${koLabels[m.matchId] || 'KO'}</div>
            <div class="match-select-teams">${m.teamAShort} vs ${m.teamBShort}</div>
            <div class="match-select-info">${m.time || m.date || ''}</div>
            ${isTBD(m) ? '<div style="font-size:0.65rem;color:var(--text-4);">Teams decided after league</div>' : statusBadge(m)}
          </div>`).join('')}
        </div>` : `
        <div style="text-align:center;margin-top:24px;">
          <button class="btn btn-primary" id="create-knockout-btn" style="background:linear-gradient(135deg,#f59e0b,#d97706);">
            🏆 Create Knockout Matches from Standings
          </button>
        </div>`;

      this.mainEl.innerHTML = `<div class="live-match-page"><div style="text-align:center;margin-bottom:32px;"><h1 class="hero-title" style="font-size:clamp(1.8rem,3.5vw,2.5rem)">🏏 Live Match Scoring</h1><p class="hero-subtitle">Select a match to start ball-by-ball scoring</p></div>${matchList.length > 0 ? `${leagueHTML}${knockoutHTML}` : `<div class="fixtures-empty" style="padding:40px;text-align:center;"><p>📅 No matches available. Draw tokens first.</p></div>`}</div>`;
      return;
    }
    const s = matchState;
    const ballDisp = (b) => {
      // Wicket + Wide (WD+RO or WD+ST)
      if (b.wicket && b.isWide) {
        const r = b.additionalRuns ? '+' + b.additionalRuns : '';
        return `<span class="ball-chip wicket" style="font-size:0.55rem;">WD${r}·W</span>`;
      }
      // Wicket + No Ball (NB+RO)
      if (b.wicket && b.isNoBall) {
        const r = b.batRuns ? '+' + b.batRuns : '';
        return `<span class="ball-chip wicket" style="font-size:0.55rem;">NB${r}·W</span>`;
      }
      // Plain wicket (with possible completed runs on run-out)
      if (b.wicket) {
        if (b.runs > 0) return `<span class="ball-chip wicket" style="font-size:0.6rem;">${b.runs}·W</span>`;
        return '<span class="ball-chip wicket">W</span>';
      }
      if (b.isWide) return `<span class="ball-chip wide">WD${b.additionalRuns?'+'+b.additionalRuns:''}</span>`;
      if (b.isNoBall) return `<span class="ball-chip noball">NB${(b.batRuns||b.byeRuns)?'+'+(b.batRuns||b.byeRuns):''}</span>`;
      if (b.isBye) return `<span class="ball-chip bye">${b.extraRuns}B</span>`;
      if (b.isLegBye) return `<span class="ball-chip bye">${b.extraRuns}LB</span>`;
      if ((b.totalRuns||b.runs) === 6) return '<span class="ball-chip six">6</span>';
      if ((b.totalRuns||b.runs) === 4 && b.isBoundary) return '<span class="ball-chip boundary">4</span>';
      if (b.runs === 0 && !b.extraRuns) return '<span class="ball-chip dot">•</span>';
      return `<span class="ball-chip">${b.runs||b.totalRuns||0}</span>`;
    };

    // ── SETUP ──
    if (s.phase === 'setup') {
      this.mainEl.innerHTML = `<div class="live-match-page"><div class="lm-setup-card">
        <h2 style="text-align:center;margin-bottom:24px;">⚙️ Match Setup</h2>
        <div class="lm-teams-display">
          <div class="lm-team-badge" style="border-color:${s.teamA.color}">
            ${s.teamA.logo?`<img src="${s.teamA.logo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">`:
            `<div style="width:80px;height:80px;border-radius:50%;background:${s.teamA.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.2rem;color:${s.teamA.textColor||'#fff'}">${s.teamA.short}</div>`}
            <span style="color:${s.teamA.color};font-weight:700;font-size:1.1rem;margin-top:8px;">${s.teamA.name || s.teamA.short}</span>
          </div>
          <span class="lm-vs-text" style="font-size:1.5rem;font-weight:800;color:var(--accent-gold);">VS</span>
          <div class="lm-team-badge" style="border-color:${s.teamB.color}">
            ${s.teamB.logo?`<img src="${s.teamB.logo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">`:
            `<div style="width:80px;height:80px;border-radius:50%;background:${s.teamB.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.2rem;color:${s.teamB.textColor||'#fff'}">${s.teamB.short}</div>`}
            <span style="color:${s.teamB.color};font-weight:700;font-size:1.1rem;margin-top:8px;">${s.teamB.name || s.teamB.short}</span>
          </div>
        </div>
        <div class="lm-form-group"><label>🏏 OVER LIMIT</label>
          <select id="lm-overs-select" class="lm-select">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option value="${n}" ${n===s.oversLimit?'selected':''}>${n} overs</option>`).join('')}</select>
        </div>
        <div class="lm-form-group"><label>🪙 TOSS WINNER</label>
          <select id="lm-toss-winner" class="lm-select"><option value="">Select...</option><option value="${s.teamA.id}">${s.teamA.name || s.teamA.short}</option><option value="${s.teamB.id}">${s.teamB.name || s.teamB.short}</option></select>
        </div>
        <div class="lm-form-group"><label>📋 DECISION</label>
          <select id="lm-toss-decision" class="lm-select"><option value="">Select...</option><option value="bat">🏏 Bat First</option><option value="bowl">🎯 Bowl First</option></select>
        </div>
        <button class="btn btn-primary btn-lg" id="lm-start-toss-btn" style="width:100%;margin-top:20px;font-size:1.1rem;">▶ Start Match</button>
        <button class="btn btn-ghost btn-sm" id="live-back-btn" style="width:100%;margin-top:12px;">← Back</button>
      </div></div>`;
      return;
    }

    if (s.phase === 'batting-select' || s.phase === 'innings-break') {
      const bt = s.battingTeam, bwt = s.bowlingTeam, isBreak = s.phase === 'innings-break';
      const breakSummary = isBreak ? `<div class="lm-innings-summary"><h3>1st Innings Summary</h3><div class="lm-summary-score">${s.innings1.runs}/${s.innings1.wickets} (${s.innings1.overs} ov)</div><div class="lm-summary-target">Target: ${s.innings1.runs + 1}</div></div>` : '';
      const roleIcon = (p) => p.role === 'Batsman' ? '🏏' : p.role === 'Bowler' ? '🎯' : p.role === 'All-Rounder' ? '⭐' : '🧤';
      const batOpts = bt.squad.map(p => `<option value="${p.name}">${p.name} (${roleIcon(p)} ${p.role}${p.isWK?' • WK':''})</option>`).join('');
      const bowlOpts = bwt.squad.map(p => `<option value="${p.name}">${p.name} (${roleIcon(p)} ${p.role})</option>`).join('');
      this.mainEl.innerHTML = `<div class="live-match-page"><div class="lm-setup-card">${breakSummary}
        <div style="text-align:center;margin-bottom:20px;">
          <div style="display:inline-block;padding:6px 16px;border-radius:8px;background:${bt.color};color:${bt.textColor||'#fff'};font-weight:700;font-size:0.85rem;margin-bottom:8px;">${bt.name || bt.short} — BATTING</div>
          <h2 style="margin:0;">🏏 ${isBreak?'2nd Innings ':''}Select Players</h2>
        </div>
        <div class="lm-form-group"><label>🏏 STRIKER (${bt.short})</label>
          <select id="lm-striker" class="lm-select"><option value="">Select opening batsman...</option>${batOpts}</select>
        </div>
        <div class="lm-form-group"><label>🏃 NON-STRIKER (${bt.short})</label>
          <select id="lm-non-striker" class="lm-select"><option value="">Select non-striker...</option>${batOpts}</select>
        </div>
        <div class="lm-form-group"><label>🎯 OPENING BOWLER (${bwt.short})</label>
          <select id="lm-bowler" class="lm-select"><option value="">Select opening bowler...</option>${bowlOpts}</select>
        </div>
        <button class="btn btn-primary btn-lg" id="lm-confirm-openers-btn" style="width:100%;margin-top:20px;font-size:1.1rem;">▶ Start Innings</button>
        ${isBreak ? '<button class="btn btn-ghost btn-sm" id="live-edit-score-btn" style="width:100%;margin-top:8px;color:var(--accent-gold);">↩ Undo Last Ball & Edit 1st Innings Score</button>' : ''}
        <button class="btn btn-ghost btn-sm" id="live-back-btn" style="width:100%;margin-top:12px;">← Back</button>
      </div></div>`;
      return;
    }

    // ── NEW BATSMAN ──
    if (s.phase === 'new-batsman') {
      const avail = s.availableBatsmen || [];
      // Render scoreboard first, then overlay modal
      this.mainEl.innerHTML = `<div class="live-match-page">${this._renderLiveScoreboard(s, ballDisp)}</div>`;
      // Remove any existing modal
      const old = document.getElementById('lm-batsman-modal');
      if (old) old.remove();
      const modal = document.createElement('div');
      modal.className = 'lm-modal-overlay';
      modal.id = 'lm-batsman-modal';
      modal.innerHTML = `<div class="lm-modal"><h3>🏏 Select New Batsman</h3><button class="lm-modal-close" id="lm-modal-close-btn">&times;</button><div class="lm-modal-list">${avail.map(p=>`<button class="lm-modal-option" data-lm-new-batsman="${p.name}">${p.name}</button>`).join('')}${avail.length===0?'<p style="color:var(--text-4);">No batsmen available</p>':''}</div></div>`;
      document.getElementById('app').appendChild(modal);
      return;
    }

    // ── BOWLER SELECT ──
    if (s.phase === 'bowler-select') {
      const avail = s.availableBowlers || [];
      // Render scoreboard first, then overlay modal
      this.mainEl.innerHTML = `<div class="live-match-page">${this._renderLiveScoreboard(s, ballDisp)}</div>`;
      // Remove any existing modal
      const old = document.getElementById('lm-bowler-modal');
      if (old) old.remove();
      const modal = document.createElement('div');
      modal.className = 'lm-modal-overlay';
      modal.id = 'lm-bowler-modal';
      modal.innerHTML = `<div class="lm-modal"><h3>🎯 Select Next Bowler</h3><button class="lm-modal-close" id="lm-modal-close-btn">&times;</button><div class="lm-modal-list">${avail.map(p=>`<button class="lm-modal-option" data-lm-next-bowler="${p.name}">${p.name}</button>`).join('')}</div></div>`;
      document.getElementById('app').appendChild(modal);
      return;
    }

    // ── RESULT ──
    if (s.phase === 'result') {
      const allSquadPlayers = [...(s.teamA.squad || []), ...(s.teamB.squad || [])];
      const potmOpts = allSquadPlayers.map(p => `<option value="${p.name}">`).join('');
      this.mainEl.innerHTML = `<div class="live-match-page"><div class="lm-result-card">` +
        `<div class="lm-result-icon">${s.winnerId ? '🏆' : '🤝'}</div>` +
        `<h2 class="lm-result-text">${s.result}</h2>` +
        `<div style="margin-top:20px;display:flex;gap:40px;justify-content:center;">` +
          `<div style="text-align:center;"><span style="color:${s.teamA.color};font-weight:700;">${s.teamA.short}</span><div style="font-size:1.5rem;font-weight:800;">${s.teamAScore.runs}/${s.teamAScore.wickets}</div><div style="font-size:0.8rem;color:var(--text-3);">(${s.teamAScore.overs} ov)</div></div>` +
          `<div style="text-align:center;"><span style="color:${s.teamB.color};font-weight:700;">${s.teamB.short}</span><div style="font-size:1.5rem;font-weight:800;">${s.teamBScore.runs}/${s.teamBScore.wickets}</div><div style="font-size:0.8rem;color:var(--text-3);">(${s.teamBScore.overs} ov)</div></div>` +
        `</div>` +
        `<div style="margin-top:24px;text-align:center;">` +
          `<label style="font-size:0.85rem;color:var(--accent-gold);display:block;margin-bottom:6px;">⭐ Player of the Match</label>` +
          `<input type="text" id="lm-potm-input" list="lm-potm-list" value="${s.playerOfMatch || ''}" placeholder="Select or type player name" style="width:260px;max-width:90%;padding:10px 14px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-card);color:var(--text-1);font-size:0.95rem;text-align:center;outline:none;">` +
          `<datalist id="lm-potm-list">${potmOpts}</datalist>` +
        `</div>` +
        `<div style="margin-top:20px;display:flex;flex-direction:column;gap:10px;align-items:center;">` +
          `<div style="display:flex;gap:12px;justify-content:center;">` +
            `<button class="btn btn-primary" id="live-save-scorecard-btn">💾 Save to Scorecard</button>` +
            `<button class="btn btn-ghost" id="live-back-btn">← Back</button>` +
          `</div>` +
          `<button class="btn btn-ghost btn-sm" id="live-edit-score-btn" style="color:var(--accent-gold);">↩ Undo Last Ball &amp; Edit Score</button>` +
        `</div>` +
      `</div></div>`;
      return;
    }

    // ── SCORING ──
    const striker = s.striker, nonStriker = s.nonStriker, bowler = s.bowler;
    const ext = s.extras;
    const mh = s.currentInnings === 1 ? s.manhattan1 : s.manhattan2;
    const maxMH = Math.max(...mh.map(o => o.runs), 1);
    const batsmanCard = (b) => { if(!b) return ''; return `<div class="lm-batsman-card ${b.isStriker?'is-striker':''}"><div class="lm-batsman-name">${b.name} ${b.isStriker?'🏏':''}</div><div class="lm-batsman-stats"><span class="lm-stat-runs">${b.runs}</span><span class="lm-stat-detail">(${b.balls}b)</span><span class="lm-stat-detail">${b.fours}×4</span><span class="lm-stat-detail">${b.sixes}×6</span><span class="lm-stat-sr">SR ${b.balls>0?((b.runs/b.balls)*100).toFixed(1):'0.0'}</span></div></div>`; };
    const bowlerCard = bowler ? `<div class="lm-bowler-card"><div class="lm-bowler-name">🎯 ${bowler.name}</div><div class="lm-bowler-stats"><span>${bowler.overs} ov</span><span>${bowler.runs}r</span><span>${bowler.wickets}w</span><span>Eco ${parseFloat(bowler.overs)>0?(bowler.runs/parseFloat(bowler.overs)).toFixed(1):'0.0'}</span></div></div>` : '';
    this.mainEl.innerHTML = `<div class="live-match-page">${this._renderLiveScoreboard(s, ballDisp)}<div class="scoring-controls"><button class="score-btn" data-ball="0">•</button><button class="score-btn" data-ball="1">1</button><button class="score-btn" data-ball="2">2</button><button class="score-btn" data-ball="3">3</button><button class="score-btn btn-4" data-ball="4">4</button><button class="score-btn btn-6" data-ball="6">6</button><button class="score-btn btn-w" id="lm-wicket-btn" data-ball="W">W</button><div class="score-btn-group"><button class="score-btn btn-extra" id="lm-wd-toggle">WD▼</button><div class="lm-submenu" id="lm-wd-menu" style="display:none;"><button class="lm-sub-btn" data-ball="WD">WD</button><button class="lm-sub-btn" data-ball="WD+1">WD+1</button><button class="lm-sub-btn" data-ball="WD+2">WD+2</button><button class="lm-sub-btn" data-ball="WD+3">WD+3</button><button class="lm-sub-btn" data-ball="WD+4">WD+4</button><button class="lm-sub-btn" data-ball="WD+ST">WD+St</button><button class="lm-sub-btn" data-ball="WD+RO">WD+RO</button></div></div><div class="score-btn-group"><button class="score-btn btn-extra" id="lm-nb-toggle">NB▼</button><div class="lm-submenu" id="lm-nb-menu" style="display:none;"><button class="lm-sub-btn" data-ball="NB+0">NB+0</button><button class="lm-sub-btn" data-ball="NB+1">NB+1</button><button class="lm-sub-btn" data-ball="NB+2">NB+2</button><button class="lm-sub-btn" data-ball="NB+3">NB+3</button><button class="lm-sub-btn" data-ball="NB+4">NB+4</button><button class="lm-sub-btn" data-ball="NB+6">NB+6</button><button class="lm-sub-btn" data-ball="NB+1B">NB+1B</button><button class="lm-sub-btn" data-ball="NB+2B">NB+2B</button><button class="lm-sub-btn" data-ball="NB+4B">NB+4B</button><button class="lm-sub-btn" data-ball="NB+RO">NB+RO</button></div></div><div class="score-btn-group"><button class="score-btn btn-extra" id="lm-bye-toggle">BYE▼</button><div class="lm-submenu" id="lm-bye-menu" style="display:none;"><button class="lm-sub-btn" data-ball="B1">1B</button><button class="lm-sub-btn" data-ball="B2">2B</button><button class="lm-sub-btn" data-ball="B3">3B</button><button class="lm-sub-btn" data-ball="B4">4B</button></div></div><div class="score-btn-group"><button class="score-btn btn-extra" id="lm-lb-toggle">LB▼</button><div class="lm-submenu" id="lm-lb-menu" style="display:none;"><button class="lm-sub-btn" data-ball="LB1">1LB</button><button class="lm-sub-btn" data-ball="LB2">2LB</button><button class="lm-sub-btn" data-ball="LB3">3LB</button><button class="lm-sub-btn" data-ball="LB4">4LB</button></div></div><button class="score-btn btn-undo" id="live-undo-btn" ${s.canUndo?'':'disabled'}>↩</button><button class="score-btn" id="lm-swap-strike-btn" style="font-size:0.7rem;border-color:rgba(99,102,241,0.3);color:var(--accent-indigo);">🔄</button></div><div class="lm-batsmen-row">${batsmanCard(striker)}${batsmanCard(nonStriker)}</div>${bowlerCard}<div class="live-info-grid"><div class="partnership-card"><div class="partnership-label">Partnership</div><div class="partnership-value">${s.partnership.runs}</div><div class="partnership-balls">(${s.partnership.balls} balls)</div></div><div class="partnership-card"><div class="partnership-label">Extras</div><div class="partnership-value">${ext.total}</div><div class="partnership-balls">W${ext.wides} NB${ext.noBalls} B${ext.byes} LB${ext.legByes}</div></div></div>${mh.length>0?`<div style="margin-top:16px;"><h3 style="font-size:0.9rem;color:var(--text-3);margin-bottom:8px;text-align:center;">📊 Runs per Over</h3><div class="manhattan-chart">${mh.map(o=>`<div class="manhattan-bar" style="height:${Math.max(8,(o.runs/maxMH)*100)}%;background:${s.currentInnings===1?s.teamA.color:s.teamB.color};" data-label="Over ${o.over}: ${o.runs}r"></div>`).join('')}</div></div>`:''}<div style="text-align:center;margin-top:20px;"><button class="btn btn-ghost btn-sm" id="live-back-btn">← Back</button><button class="btn btn-ghost btn-sm" id="live-save-scorecard-btn" style="margin-left:8px;">💾 Save to Scorecard</button></div></div>`;
  }

  _renderLiveScoreboard(s, ballDisp) {
    const overHist = s.overHistory || [];
    const overHistoryHTML = overHist.length > 0 ? `<div class="lm-over-history">${overHist.map(o => `<div class="lm-over-row"><span class="lm-over-num">Over ${o.over}</span><span class="lm-over-balls">${o.balls.map(b => ballDisp(b)).join('')}</span><span class="lm-over-total">${o.runs}r</span></div>`).join('')}</div>` : '';
    // Toss info line
    const tossWinnerTeam = s.tossWinner === s.teamA.id ? s.teamA : s.teamB;
    const tossInfo = s.tossWinner ? `<div class="lm-toss-info">${tossWinnerTeam.short} won the toss and elected to ${s.tossDecision === 'bat' ? 'bat' : 'bowl'} first</div>` : '';
    return `<div class="live-match-header"><div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,${s.teamA.color},${s.teamB.color});"></div>${s.isFreeHit?'<div class="lm-freehit-badge">🔥 FREE HIT</div>':''}<div class="live-badge" style="margin-bottom:4px;">LIVE — Innings ${s.currentInnings}</div>${tossInfo}<div class="live-match-teams"><div class="live-match-team">${s.teamA.logo?`<img class="live-match-team-logo" src="${s.teamA.logo}">`:''}<span class="live-match-team-name" style="color:${s.teamA.color};">${s.teamA.short}</span><div class="live-match-score">${s.teamAScore.runs}/${s.teamAScore.wickets}</div><div class="live-match-overs">(${s.teamAScore.overs} ov)</div></div><div class="live-match-vs">VS</div><div class="live-match-team">${s.teamB.logo?`<img class="live-match-team-logo" src="${s.teamB.logo}">`:''}<span class="live-match-team-name" style="color:${s.teamB.color};">${s.teamB.short}</span><div class="live-match-score">${s.teamBScore.runs}/${s.teamBScore.wickets}</div><div class="live-match-overs">(${s.teamBScore.overs} ov)</div></div></div><div class="live-match-rr"><span>CRR: <strong>${s.current.crr}</strong></span>${s.rrr?`<span>RRR: <strong>${s.rrr.rrr}</strong></span><span>Need <strong>${s.rrr.remaining}</strong> off <strong>${s.rrr.ballsLeft}</strong></span>`:''}</div><div class="this-over"><span class="this-over-label">THIS OVER:</span>${s.currentOver.length>0?s.currentOver.map(b=>ballDisp(b)).join(''):'<span style="color:var(--text-4);">New over</span>'}</div>${overHistoryHTML}</div>`;
  }

  // ═══════════════════════════════════════════
  // GALLERY VIEW
  // ═══════════════════════════════════════════

  renderGallery(photos = [], matches = [], filter = 'all') {
    const filtered = filter === 'all' ? photos : photos.filter(p => p.day === filter);
    this.mainEl.innerHTML = `<div class="gallery-page"><div class="gallery-header"><h1>📸 NPL 3.0 Gallery</h1><p style="color:var(--text-3);">Capture and share tournament memories</p></div><div class="gallery-filters"><button class="filter-btn ${filter==='all'?'active':''}" data-gallery-filter="all">All</button><button class="filter-btn ${filter==='Day 1'?'active':''}" data-gallery-filter="Day 1">Day 1</button><button class="filter-btn ${filter==='Day 2'?'active':''}" data-gallery-filter="Day 2">Day 2</button></div><div class="gallery-upload-zone" id="gallery-upload-zone"><div class="gallery-upload-icon">📷</div><div class="gallery-upload-text">Click or drag photos here to upload</div><input type="file" id="gallery-file-input" accept="image/*" multiple style="display:none;"></div>${filtered.length>0?`<div class="gallery-grid">${filtered.map(photo=>`<div class="gallery-item" data-photo-id="${photo.id}"><img src="${photo.dataUrl}" alt="${photo.caption||'Photo'}"><div class="gallery-item-overlay">${photo.caption||photo.day||''}</div><button class="gallery-item-delete" data-delete-photo="${photo.id}">&times;</button></div>`).join('')}</div>`:`<div class="fixtures-empty" style="padding:40px;text-align:center;"><p>📷 No photos yet. Upload tournament photos!</p></div>`}${matches.filter(m=>m.status==='completed').length>0?`<div class="social-cards-section"><h2 style="text-align:center;margin-bottom:20px;">📱 Share Match Results</h2><div class="social-cards-grid">${matches.filter(m=>m.status==='completed').map(m=>`<div class="social-card-preview"><div style="padding:16px;text-align:center;"><div style="font-weight:700;">${m.teamAShort} vs ${m.teamBShort}</div><div style="font-size:0.8rem;color:var(--text-3);">Match ${m.matchId.replace('match-','')}</div>${m.result.margin?`<div style="font-size:0.85rem;color:var(--accent-gold);margin-top:6px;">🏆 ${m.result.margin}</div>`:''}</div><div class="social-card-actions"><button class="btn btn-primary btn-sm" data-generate-card="${m.matchId}">📥 Generate Card</button></div></div>`).join('')}</div></div>`:''}</div>`;
  }

  // ═══════════════════════════════════════════
  // AWARDS CEREMONY VIEW
  // ═══════════════════════════════════════════

  renderAwards(awards = [], revealedCount = 0) {
    this.mainEl.innerHTML = `<div class="awards-page"><div class="awards-hero"><h1>✨ NPL 3.0 AWARDS NIGHT ✨</h1><p>Celebrating the best of Nakre Premier League 3.0</p>${revealedCount<awards.length?`<button class="awards-reveal-btn" id="awards-reveal-next-btn">🎭 Reveal Next Award (${revealedCount}/${awards.length})</button>`:`<p style="color:var(--accent-gold);font-weight:700;margin-top:16px;">🎉 All awards revealed!</p>`}</div><div class="awards-grid">${awards.map((award,i) => {
      const isRevealed = i < revealedCount, isRevealing = i === revealedCount - 1;
      return `<div class="award-card ${isRevealed?'revealed':'unrevealed'} ${isRevealing?'revealing':''} ${award.id==='champion'?'champion-card':''}" data-award-index="${i}"><div style="position:absolute;top:0;left:0;right:0;height:4px;background:${award.gradient};"></div>${!isRevealed?`<div class="award-envelope"><div class="award-envelope-icon">🎭</div><div class="award-envelope-text">${award.title}</div><div style="font-size:0.7rem;color:var(--text-4);margin-top:4px;">${award.category}</div></div>`:''}<div class="award-content"><div class="award-icon">${award.icon}</div><div class="award-category">${award.category}</div><div class="award-title">${award.title}</div>${award.subtitle?`<div class="award-subtitle">${award.subtitle}</div>`:''}${award.winner?`<div class="award-winner">${award.winner}</div>${award.team?`<span class="award-team" style="background:${award.teamColor||'#666'}22;color:${award.teamColor||'#666'};">${award.team}</span>`:''}<div class="award-stat">${award.stat}</div>`:`<div style="color:var(--text-4);margin-top:12px;font-style:italic;">To be announced</div>`}<div class="award-desc">${award.desc}</div></div></div>`;
    }).join('')}</div><div style="text-align:center;padding:32px 0;"><button class="btn btn-ghost" id="awards-back-btn">← Back to Results</button>${revealedCount>0?`<button class="btn btn-ghost" id="awards-reset-btn" style="margin-left:8px;">🔄 Reset</button>`:''}</div></div>`;
  }
}

