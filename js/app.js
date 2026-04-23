// ─────────────────────────────────────────────
// app.js — Main Controller, Routing & Events
// ─────────────────────────────────────────────

import { TEAMS_DATA, PLAYERS_DATA, normalizePlayerCatalog } from './data.js?v=3';
import { AuctionEngine } from './auction.js';
import { UI } from './ui.js?v=5';
import { WSClient } from './ws-client.js';
import { AuctionSounds } from './sounds.js';
import { CommentaryEngine } from './commentary.js';
import { ScorecardManager } from './scorecard.js';
import { StandingsEngine } from './standings.js';
import { PlayerCardsEngine } from './player-cards.js';
import { GalleryManager } from './gallery.js';
import { BackgroundMediaManager } from './background-media.js';

class App {
  constructor() {
    this.ui = new UI();
    this.engine = null;
    this.selectedTeamIds = new Set();
    this.selectedPlayerIds = new Set();
    this.allPlayers = []; // Will be populated from server state; falls back to PLAYERS_DATA
    this.currentView = 'login';
    this.isLoggedIn = false;
    this.poolFilter = 'All';
    this.poolSearch = '';
    this.playerSelectFilter = 'All';
    this.playerSelectSearch = '';
    this.wsClient = new WSClient();
    this.mobileSessionUrl = null;
    this.showQRModal = false;

    // Sound effects
    this.sounds = new AuctionSounds();

    // Timer
    this.timerInterval = null;
    this.lastTickSecond = null; // track which second we last ticked
    this.timerDuration = 30; // default, user can change

    // Analytics
    this.resultsTab = 'squads'; // 'squads' | 'analytics'

    // Live Commentary
    this.commentary = new CommentaryEngine();
    this.commentaryVisible = false;  // disabled by default
    this.commentary.setSpeechEnabled(false); // speech off by default
    this.idleCommentaryInterval = null;

    // Scorecard Manager
    this.scorecardMgr = new ScorecardManager();
    this.scorecardView = 'list'; // 'list' | 'edit'
    this.activeScorecardId = null;

    // Premium Features State
    this.liveMatchEngine = null;
    this.galleryMgr = new GalleryManager();
    this.galleryFilter = 'all';
    this.awardsData = [];
    this.awardsRevealedCount = 0;
    this.fixturesLocked = localStorage.getItem('npl_fixtures_locked') === '1';
    this.backgroundMedia = new BackgroundMediaManager();
    this._syncViewportMetrics = () => this.syncViewportMetrics();
    this._featurePromises = Object.create(null);
    this._stateSyncTimer = null;
    this._stateSyncInFlight = null;
    this._stateSyncQueued = false;
    this._pendingStateStr = null;
    this._lastSyncedStateStr = null;
    this._pendingPlayerImage = null;
    this._playerImageBusy = false;
    this._playerImageTaskId = 0;
  }

  async init() {
    this.ui.renderViewSkeleton('boot');

    // Listen to hash changes for routing
    window.addEventListener('hashchange', () => this.onHashChange());

    // Delegate all click events from #app
    document.getElementById('app').addEventListener('click', (e) => this.onClick(e));
    document.getElementById('app').addEventListener('pointerdown', (e) => this.ui.spawnInteractionRipple(e));

    // Close header menus when the pointer/click leaves their trigger areas
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.hamburger-menu') && !e.target.closest('.nav-more-menu') && !e.target.closest('#nav-more-toggle')) {
        this._closeHeaderMenus();
      }
    });

    window.addEventListener('resize', this._syncViewportMetrics);
    window.visualViewport?.addEventListener('resize', this._syncViewportMetrics);
    window.addEventListener('pagehide', () => {
      this.flushStateSync({ keepalive: true }).catch(() => {});
    });

    // Fullscreen change listener
    document.addEventListener('fullscreenchange', () => this.render());

    // Initialize WebSocket connection
    this.initWebSocket();

    // Set up commentary listener — append lines in real-time
    this.commentary.onChange((line) => {
      this.ui.appendCommentaryLine(line);
    });

    // Try to restore saved state
    await this.loadState();

    const normalizedPlayers = normalizePlayerCatalog(this.allPlayers);
    const playerCatalogChanged = JSON.stringify(normalizedPlayers) !== JSON.stringify(this.allPlayers || []);
    this.allPlayers = normalizedPlayers;
    if (playerCatalogChanged) {
      console.log(`[App] Player catalog synchronized (${this.allPlayers.length} players)`);
      this.saveState({ immediate: this.isLoggedIn });
    }

    await this.backgroundMedia.init();

    // Enforce login
    if (!this.isLoggedIn) {
      this.currentView = 'login';
      window.location.hash = 'login';
    } else {
      // Navigate to initial view
      const hash = window.location.hash.slice(1);
      if (['setup', 'player-select', 'rules', 'players', 'auction', 'results', 'about', 'history'].includes(hash)) {
        this.currentView = hash;
      } else if (hash === 'login') {
        this.currentView = 'setup'; // already logged in
        window.location.hash = 'setup';
      }
    }
    this.render();
  }

  syncViewportMetrics() {
    document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
    document.body.classList.toggle('app-fullscreen', !!document.fullscreenElement);

    const header = document.getElementById('header');
    if (header) {
      const headerHeight = Math.ceil(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--header-safe-height', `${headerHeight}px`);
    }
  }

  // ═══════════════════════════════════════════
  // WEBSOCKET
  // ═══════════════════════════════════════════

  initWebSocket() {
    this.wsClient.connect();

    this.wsClient.on('connected', () => {
      console.log('[App] WebSocket connected');
      this._updateSyncChip(); // Only update sync indicator, don't re-render entire page
    });

    this.wsClient.on('disconnected', () => {
      console.log('[App] WebSocket disconnected');
      this._updateSyncChip();
    });

    this.wsClient.on('role-assigned', ({ role }) => {
      console.log(`[App] Role: ${role}`);
      if (role === 'spectator') {
        this.ui.showToast('👁️ Spectator mode — live updates from primary host', 'info');
      } else if (role === 'primary') {
        this.ui.showToast('🎯 You are the primary host', 'success');
        // Immediately broadcast current state so spectators sync
        this.broadcastState();
      }
      this._updateSyncChip();
    });

    // ── Receive state from primary host (spectator mode) ──
    this.wsClient.on('remote-state-update', (remoteState) => {
      this._applyRemoteState(remoteState);
    });

    this.wsClient.on('session-created', (msg) => {
      this.mobileSessionUrl = msg.url;
      this.showQRModal = true;
      this.ui.showQRModal(msg.url, msg.ip, msg.token);
      this.ui.showToast('📱 Mobile bidding session created!', 'success');
    });

    this.wsClient.on('mobile-connected', (msg) => {
      this.ui.showToast(`📱 ${msg.teamShortName} connected via mobile`, 'info');
      if (this.currentView === 'auction' && this.engine) {
        this.refreshAuctionRealtime();
      } else {
        this.render();
      }
    });

    this.wsClient.on('mobile-disconnected', (msg) => {
      this.ui.showToast(`📱 ${msg.teamShortName} disconnected`, 'warning');
      if (this.currentView === 'auction' && this.engine) {
        this.refreshAuctionRealtime();
      } else {
        this.render();
      }
    });

    this.wsClient.on('mobile-bid', (msg) => {
      this.handleMobileBid(msg);
    });
  }

  /** Broadcast current auction state to all mobile clients + projector tabs + spectator hosts */
  broadcastState() {
    if (!this.engine) return;
    const state = this.engine.getState();

    // WebSocket broadcast (when server is running)
    if (this.wsClient.connected) {
      // Send auction state for mobiles/projectors + full persistent state for spectator hosts
      const fullState = this._buildPersistentState();
      this.wsClient.broadcastState(state, fullState);
    }

    // BroadcastChannel for cross-tab projector (works on GitHub Pages / static hosting)
    try {
      if (!this._projectorChannel) {
        this._projectorChannel = new BroadcastChannel('npl-projector');
      }
      // Send filtered state (same shape the server would send)
      this._projectorChannel.postMessage({
        type: 'state-update',
        state: this._filterStateForProjector(state)
      });
    } catch (e) {
      // BroadcastChannel not supported — ignore
    }
  }

  /** Broadcast only the persistent app state to spectator hosts. */
  broadcastPersistentState() {
    if (!this.wsClient.connected) return;
    this.wsClient.broadcastFullState(this._buildPersistentState());
  }

  /** Filter auction state to projector-safe subset (mirrors server.js filterStateForProjector) */
  _filterStateForProjector(state) {
    return {
      phase: state.phase,
      currentPlayer: state.currentPlayer,
      currentBid: state.currentBid,
      currentBidder: state.currentBidder,
      currentBidderTeam: state.currentBidderTeam ? {
        shortName: state.currentBidderTeam.shortName,
        name: state.currentBidderTeam.name,
        color: state.currentBidderTeam.color,
        logo: state.currentBidderTeam.logo
      } : null,
      nextBidAmount: state.nextBidAmount,
      playerIndex: state.playerIndex,
      totalPlayers: state.totalPlayers,
      remainingPlayers: state.remainingPlayers,
      soldCount: state.soldCount,
      unsoldCount: state.unsoldCount,
      bidHistory: (state.bidHistory || []).slice(-5),
      timerRemaining: state.timerRemaining,
      timerStartTime: state.timerStartTime || null,
      timerDuration: state.timerDuration || 30,
      timerEnabled: state.timerEnabled || false,
      // Bidder team financial info (for projector warning)
      currentBidderPurse: state.currentBidderTeam ? state.currentBidderTeam.purse : null,
      currentBidderSquadCount: state.currentBidderTeam ? state.currentBidderTeam.squad?.length ?? 0 : 0,
      // Recall
      canRecall: state.canRecall || false,
      lastSalePlayer: state.lastSalePlayer || null,
      lastSaleTeam: state.lastSaleTeam || null,
    };
  }

  /** Handle an incoming bid from a mobile client */
  handleMobileBid(msg) {
    if (!this.engine) {
      this.wsClient.sendBidResult(msg.teamId, false, 'Auction not active');
      return;
    }

    const canBid = this.engine.canTeamBid(msg.teamId);
    if (!canBid) {
      const team = this.engine.getTeamState(msg.teamId);
      let error = 'Cannot bid';
      if (team && team.squad.length >= 13) error = 'Squad is full';
      else if (this.engine.currentBidder === msg.teamId) error = 'Already highest bidder';
      else error = 'Insufficient budget';
      this.wsClient.sendBidResult(msg.teamId, false, error);
      return;
    }

    const result = this.engine.placeBid(msg.teamId);
    if (result.success) {
      this.wsClient.sendBidResult(msg.teamId, true);
      this.lastTickSecond = null;
      const state = this.engine.getState();
      this.refreshAuctionRealtime(state, { flashBid: true });
      this.ui.showToast(`📱 ${msg.teamShortName} bid ${AuctionEngine.formatPoints(result.bid)}`, 'info');
      this.broadcastState();
    } else {
      this.wsClient.sendBidResult(msg.teamId, false, 'Bid failed');
    }
  }

  /** Generate QR code / mobile link */
  generateMobileSession() {
    if (!this.engine) {
      this.ui.showToast('Start the auction first', 'warning');
      return;
    }
    const state = this.engine.getState();
    this.wsClient.createSession(state.teams);
  }

  // ═══════════════════════════════════════════
  // ROUTING
  // ═══════════════════════════════════════════

  navigate(view) {
    this.currentView = view;
    if (window.location.hash.slice(1) !== view) {
      window.location.hash = view;
      return;
    }
    this.render();
  }

  onHashChange() {
    const hash = window.location.hash.slice(1);
    
    if (!this.isLoggedIn && hash !== 'login') {
      window.location.hash = 'login';
      return;
    }
    
    if (this.isLoggedIn && hash === 'login') {
      window.location.hash = 'setup';
      return;
    }

    if (['login', 'setup', 'player-select', 'rules', 'players', 'auction', 'results', 'about', 'history', 'live-match', 'gallery', 'awards'].includes(hash)) {
      this.currentView = hash;
      this.render();
    }
  }

  // ═══════════════════════════════════════════
  // STATE PERSISTENCE (localStorage)
  // ═══════════════════════════════════════════

  /** Save current auction state to localStorage */
  saveState({ immediate = false } = {}) {
    // When applying remote state, only save to localStorage (no server echo)
    if (this._applyingRemoteState) {
      try {
        localStorage.setItem('npl_auction_state', JSON.stringify(this._buildPersistentState()));
      } catch(e) {}
      return;
    }

    try {
      const stateStr = JSON.stringify(this._buildPersistentState());
      localStorage.setItem('npl_auction_state', stateStr);
      this._pendingStateStr = stateStr;

      if (this.isLoggedIn) {
        clearTimeout(this._stateSyncTimer);
        if (immediate) {
          this.flushStateSync().catch((e) => console.warn('Server sync failed', e));
        } else {
          this._stateSyncTimer = setTimeout(() => {
            this.flushStateSync().catch((e) => console.warn('Server sync failed', e));
          }, 450);
        }
      }
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  _buildPersistentState() {
    // Build a single object containing ALL syncable state
    const state = {
      updatedAt: Date.now(),
      isLoggedIn: this.isLoggedIn,
      selectedTeamIds: [...this.selectedTeamIds],
      selectedPlayerIds: [...this.selectedPlayerIds],
      currentView: this.currentView,
      engine: this.engine ? this.engine.serialize() : null,
      scorecards: this.scorecardMgr.serialize(),
    };

    // Include live match data for multi-device sync
    if (this.liveMatchEngine) {
      state.liveMatch = this.liveMatchEngine.serialize();
    }

    // Include gallery data for multi-device sync
    if (this.galleryMgr) {
      try { state.gallery = this.galleryMgr.serialize(); } catch(e) {}
    }

    // Include fixtures lock state
    state.fixturesLocked = this.fixturesLocked || false;

    // Always include player catalog so CRUD changes persist across sessions/browsers
    state.allPlayers = this._getPlayerCatalog();

    return state;
  }

  _parsePersistedState(raw) {
    if (!raw || raw === 'null') return null;

    try {
      const state = JSON.parse(raw);
      return state && typeof state === 'object' ? state : null;
    } catch (e) {
      console.warn('Failed to parse persisted state:', e);
      return null;
    }
  }

  _selectPreferredState(...candidates) {
    let preferred = null;
    let preferredTs = Number.NEGATIVE_INFINITY;

    candidates.forEach((candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      const candidateTs = Number(candidate.updatedAt) || 0;
      if (!preferred || candidateTs >= preferredTs) {
        preferred = candidate;
        preferredTs = candidateTs;
      }
    });

    return preferred;
  }

  async flushStateSync({ keepalive = false } = {}) {
    clearTimeout(this._stateSyncTimer);
    if (!this.isLoggedIn || !this._pendingStateStr) return;
    if (this._pendingStateStr === this._lastSyncedStateStr) return;

    if (this._stateSyncInFlight) {
      this._stateSyncQueued = true;
      return this._stateSyncInFlight;
    }

    const stateStr = this._pendingStateStr;
    this._stateSyncQueued = false;
    this._stateSyncInFlight = fetch('/api/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('npl_token') || '')
      },
      body: stateStr,
      keepalive
    }).then(async (res) => {
      if (!res.ok) {
        let message = `State sync failed (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch (e) {
          // Ignore JSON parse errors for non-JSON failures.
        }
        throw new Error(message);
      }
      this._lastSyncedStateStr = stateStr;
      return res;
    }).catch((e) => {
      console.warn('Server sync failed', e);
      throw e;
    }).finally(() => {
      this._stateSyncInFlight = null;
      if (this._stateSyncQueued || this._pendingStateStr !== this._lastSyncedStateStr) {
        this.flushStateSync({ keepalive }).catch(() => {});
      }
    });

    return this._stateSyncInFlight;
  }

  /** Load saved auction state from server/localStorage */
  async loadState({ preferServer = false } = {}) {
    try {
      let serverRaw = null;
      try {
        const res = await fetch('/api/state');
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          serverRaw = await res.text();
        }
      } catch (e) {
        // Server unavailable (GitHub Pages) — will fall back to localStorage
      }

      const localRaw = localStorage.getItem('npl_auction_state');
      const serverState = this._parsePersistedState(serverRaw);
      const localState = this._parsePersistedState(localRaw);
      const state = preferServer && serverState
        ? serverState
        : this._selectPreferredState(serverState, localState);
      if (!state) return;

      // ── Merge allPlayers: ensure CRUD changes are never lost ──
      // If the preferred state has no allPlayers, pull from the other source.
      const otherState = (state === serverState) ? localState : serverState;
      if ((!state.allPlayers || !Array.isArray(state.allPlayers) || state.allPlayers.length === 0)
          && otherState?.allPlayers && Array.isArray(otherState.allPlayers) && otherState.allPlayers.length > 0) {
        state.allPlayers = otherState.allPlayers;
        console.log('[App] Merged allPlayers from alternate source (' + otherState.allPlayers.length + ' players)');
      }

      const stateStr = JSON.stringify(state);
      this._pendingStateStr = stateStr;
      if (serverState && state === serverState) {
        this._lastSyncedStateStr = stateStr;
      }

      try {
        localStorage.setItem('npl_auction_state', stateStr);
      } catch (e) {
        console.warn('Failed to refresh local state cache:', e);
      }

      await this._restoreFromState(state);

      // Ensure the merged state (with allPlayers) is pushed to the server DB
      // so future sessions / new browsers always get the full player catalog.
      if (this.isLoggedIn) {
        this._pendingStateStr = JSON.stringify(this._buildPersistentState());
        this.flushStateSync().catch((e) => console.warn('[App] Post-load server sync failed', e));
      }
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
  }

  /** Apply state received from primary host (spectator mode) — no echo back */
  async _applyRemoteState(state) {
    if (!state || typeof state !== 'object') return;
    console.log('[App] Applying remote state update');

    this._applyingRemoteState = true;
    try {
      try {
        const stateStr = JSON.stringify(state);
        this._pendingStateStr = stateStr;
        this._lastSyncedStateStr = stateStr;
        localStorage.setItem('npl_auction_state', stateStr);
      } catch (e) {
        console.warn('[App] Failed to cache remote state locally:', e);
      }

      // Don't overwrite currentView — let spectators navigate independently
      const savedView = this.currentView;
      await this._restoreFromState(state);
      this.currentView = savedView;

      // Smart re-render: only update header stats + current view data
      // This avoids wiping form state (toss dropdowns, etc.)
      if (this.currentView === 'auction' && this.engine) {
        this.refreshAuctionRealtime();
      } else if (this.currentView === 'results') {
        this.render();
      } else if (this.currentView === 'live-match') {
        // Re-render the lobby so fixture order changes appear on synced screens,
        // but avoid wiping an active scoring session.
        if (!this.liveMatchEngine) {
          this._renderLiveMatchView();
        }
      } else {
        // For other views, a full render is safe
        this.render();
      }
    } catch (e) {
      console.warn('[App] Failed to apply remote state:', e);
    } finally {
      this._applyingRemoteState = false;
    }
  }

  /** Common state restoration logic used by loadState and _applyRemoteState */
  async _restoreFromState(state) {
    if (!state || typeof state !== 'object') return;

    if (state.isLoggedIn !== undefined) {
      this.isLoggedIn = state.isLoggedIn;
    }
    if (state.selectedTeamIds) {
      this.selectedTeamIds = new Set(state.selectedTeamIds);
    }
    if (state.selectedPlayerIds) {
      this.selectedPlayerIds = new Set(state.selectedPlayerIds);
    }
    if (state.allPlayers && Array.isArray(state.allPlayers)) {
      this.allPlayers = state.allPlayers.map(player => ({ ...player }));
    }
    if (state.currentView) {
      this.currentView = state.currentView;
    }
    if (state.engine) {
      this.engine = AuctionEngine.restore(state.engine);
      console.log('[App] Auction state restored');
    }
    if (state.scorecards) {
      this.scorecardMgr = ScorecardManager.restore(state.scorecards);
      console.log('[App] Scorecards restored');
    }

    // Restore live match (multi-device sync)
    if (state.liveMatch) {
      try {
        const LME = await this._ensureLiveMatchEngineClass();
        this.liveMatchEngine = LME.restore(state.liveMatch);
        console.log('[App] Live match restored from sync');
      } catch (e) {
        console.warn('[App] Live match restore failed:', e);
      }
    }

    // Restore gallery (multi-device sync)
    if (state.gallery) {
      try { this.galleryMgr = GalleryManager.restore(state.gallery); }
      catch(e) { console.warn('Gallery restore failed:', e); }
    } else {
      // Fall back to localStorage for gallery
      const galleryRaw = localStorage.getItem('npl_gallery');
      if (galleryRaw) {
        try { this.galleryMgr = GalleryManager.restore(JSON.parse(galleryRaw)); }
        catch(e) { console.warn('Gallery restore failed:', e); }
      }
    }

    // Restore fixtures lock state
    if (state.fixturesLocked !== undefined) {
      this.fixturesLocked = state.fixturesLocked;
    }
  }

  /** Clear saved state and reset everything */
  resetAuction() {
    localStorage.removeItem('npl_auction_state');
    this.engine = null;
    this.selectedTeamIds = new Set();
    this.selectedPlayerIds = new Set();
    // Keep login state when resetting auction data
    this.saveState(); 
    this.ui.showToast('🔄 Auction reset. Starting fresh!', 'info');
    this.navigate('setup');
  }

  /** Update only the sync status chip in the header without a full re-render */
  _updateSyncChip() {
    const chip = document.querySelector('.sync-chip');
    if (!chip) return; // Header not rendered yet

    const { connected, role } = { connected: this.wsClient.connected, role: this.wsClient.role };

    // Update classes
    chip.className = `nav-stat-chip sync-chip sync-chip--${connected ? (role || 'unknown') : 'offline'}`;

    // Update text
    const dot = '<span class="sync-dot"></span>';
    if (connected) {
      chip.innerHTML = `${dot} ${role === 'primary' ? 'Primary' : role === 'spectator' ? 'Live Sync' : 'Connected'}`;
      chip.title = role === 'primary' ? 'You are the primary host' : 'Live syncing with primary host';
    } else {
      chip.innerHTML = `${dot} Offline`;
      chip.title = 'Not connected to server';
    }
  }

  // ═══════════════════════════════════════════
  // PLAYER MANAGEMENT (CRUD)
  // ═══════════════════════════════════════════

  /** Get form data from the player modal */
  _getPlayerFormData() {
    return {
      name: document.getElementById('pm-name')?.value?.trim() || '',
      role: document.getElementById('pm-role')?.value || 'Batsman',
      location: document.getElementById('pm-location')?.value?.trim() || 'Nakre',
      batting: document.getElementById('pm-batting')?.value || 'Right Hand',
      bowling: document.getElementById('pm-bowling')?.value || 'Right Arm',
      basePrice: parseInt(document.getElementById('pm-price')?.value) || 1000,
      isWK: document.getElementById('pm-wk')?.checked || false,
    };
  }

  _getPlayerCatalog() {
    return Array.isArray(this.allPlayers) && this.allPlayers.length
      ? this.allPlayers
      : normalizePlayerCatalog(PLAYERS_DATA);
  }

  _normalizePlayerRecord(player = {}) {
    return {
      id: Number(player?.id) || 0,
      name: player?.name || '',
      role: player?.role || 'Batsman',
      location: player?.location || 'Nakre',
      batting: player?.batting || 'Right Hand',
      bowling: player?.bowling || 'Right Arm',
      basePrice: Number(player?.basePrice) || 0,
      isWK: !!player?.isWK,
      image: player?.image || '',
      detailImage: player?.detailImage || player?.image || '',
      imageDisplay: player?.imageDisplay || '',
    };
  }

  _showPlayerModalFeedback(message, type = 'error') {
    if (!message) {
      this.ui.clearPlayerModalFeedback();
      return true;
    }

    if (this.ui.setPlayerModalFeedback(message, type)) {
      return true;
    }

    this.ui.showToast(message, type);
    return false;
  }

  /** @deprecated No longer needed — allPlayers is always persisted */
  _hasCustomPlayerState() {
    return true;
  }

  /** Add a new player */
  addPlayer(data) {
    if (!data.name) {
      this._showPlayerModalFeedback('Player name is required', 'error');
      return false;
    }
    // Duplicate name check
    if (this.allPlayers.some(p => p.name.toLowerCase() === data.name.toLowerCase())) {
      this._showPlayerModalFeedback(`Player "${data.name}" already exists`, 'error');
      return false;
    }
    const maxId = this.allPlayers.reduce((max, p) => Math.max(max, p.id), 0);
    const uploadedImage = this._pendingPlayerImage || '';
    const newPlayer = {
      id: maxId + 1,
      name: data.name,
      role: data.role,
      location: data.location,
      batting: data.batting,
      bowling: data.bowling,
      basePrice: data.basePrice,
      isWK: data.isWK,
      image: uploadedImage,
      detailImage: uploadedImage,
    };
    this.allPlayers.push(newPlayer);
    this._pendingPlayerImage = null;
    this._showPlayerModalFeedback('');
    this.saveState({ immediate: true });
    this.broadcastPersistentState();
    this.ui.showToast(`✅ ${data.name} added successfully`, 'success');
    return true;
  }

  /** Update an existing player */
  updatePlayer(id, data) {
    const idx = this.allPlayers.findIndex(p => p.id === id);
    if (idx === -1) {
      this._showPlayerModalFeedback('Player not found', 'error');
      return false;
    }
    if (!data.name) {
      this._showPlayerModalFeedback('Player name is required', 'error');
      return false;
    }
    // Duplicate check (excluding self)
    if (this.allPlayers.some(p => p.id !== id && p.name.toLowerCase() === data.name.toLowerCase())) {
      this._showPlayerModalFeedback(`Player "${data.name}" already exists`, 'error');
      return false;
    }
    const player = this.allPlayers[idx];
    const previousName = player.name;
    player.name = data.name;
    player.role = data.role;
    player.location = data.location;
    player.batting = data.batting;
    player.bowling = data.bowling;
    player.basePrice = data.basePrice;
    player.isWK = data.isWK;
    if (this._pendingPlayerImage) {
      player.image = this._pendingPlayerImage;
      player.detailImage = this._pendingPlayerImage;
    }
    this._pendingPlayerImage = null;

    if (previousName !== player.name && this.selectedPlayerIds.has(previousName)) {
      this.selectedPlayerIds.delete(previousName);
      this.selectedPlayerIds.add(player.name);
    }

    this._updatePlayerReferencesInAuction(id, player, previousName);

    this._showPlayerModalFeedback('');
    this.saveState({ immediate: true });
    this.broadcastPersistentState();
    this.ui.showToast(`✅ ${data.name} updated`, 'success');
    return true;
  }

  _updatePlayerReferencesInAuction(id, player, previousName) {
    if (!this.engine) return;

    this.engine.playerPool = this.engine.playerPool.map(entry =>
      entry.id === id ? { ...entry, ...player } : entry
    );

    this.engine.unsoldPlayers = this.engine.unsoldPlayers.map(entry =>
      entry.id === id ? { ...entry, ...player } : entry
    );

    this.engine.soldPlayers = this.engine.soldPlayers.map(entry => {
      if (entry.player?.id !== id) return entry;
      return {
        ...entry,
        player: {
          ...entry.player,
          ...player,
          soldPrice: entry.player.soldPrice ?? entry.price,
        },
      };
    });

    for (const team of this.engine.teams.values()) {
      team.squad = team.squad.map(entry =>
        entry.id === id
          ? { ...entry, ...player, soldPrice: entry.soldPrice }
          : entry
      );
    }

    if (this.engine.currentPlayer?.id === id) {
      this.engine.currentPlayer = {
        ...this.engine.currentPlayer,
        ...player,
        soldPrice: this.engine.currentPlayer.soldPrice,
      };
    }

    if (this.engine.lastSale?.player?.id === id) {
      this.engine.lastSale = {
        ...this.engine.lastSale,
        player: {
          ...this.engine.lastSale.player,
          ...player,
          soldPrice: this.engine.lastSale.player.soldPrice,
        },
      };
    }

    if (this.engine.maxBidsPlayer?.name === previousName) {
      this.engine.maxBidsPlayer = {
        ...this.engine.maxBidsPlayer,
        name: player.name,
      };
    }
  }

  /** Delete a player */
  deletePlayer(id) {
    const idx = this.allPlayers.findIndex(p => p.id === id);
    if (idx === -1) return false;

    const player = this.allPlayers[idx];

    // Check if player is sold in auction
    if (this.engine) {
      const isSold = this.engine.soldPlayers.some(s => s.player.id === id);
      if (isSold) {
        this.ui.showToast(`Cannot delete ${player.name} — already sold in auction`, 'error');
        return false;
      }
      if (this.engine.currentPlayer?.id === id) {
        this.ui.showToast(`Cannot delete ${player.name} — currently being auctioned`, 'error');
        return false;
      }
      // Remove from pool if pending
      this.engine.playerPool = this.engine.playerPool.filter(p => p.id !== id);
    }

    // Remove from selected
    this.selectedPlayerIds.delete(player.name);

    // Remove from allPlayers
    this.allPlayers.splice(idx, 1);

    this.saveState({ immediate: true });
    this.broadcastPersistentState();
    this.ui.showToast(`🗑️ ${player.name} deleted`, 'success');
    return true;
  }

  /** Handle image file → base64 */
  _setPlayerImageBusy(isBusy, message = '') {
    this._playerImageBusy = isBusy;

    const saveBtn = document.getElementById('player-modal-save');
    if (saveBtn) saveBtn.disabled = isBusy;

    const statusEl = document.getElementById('player-image-status');
    if (statusEl) {
      statusEl.textContent = message || statusEl.dataset.defaultText || '';
      statusEl.classList.toggle('is-busy', isBusy);
      statusEl.classList.toggle('is-ready', !isBusy && message === 'Image optimized and ready');
    }
  }

  _readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
      reader.readAsDataURL(file);
    });
  }

  _loadImageData(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to load image'));
      img.src = src;
    });
  }

  async _optimizePlayerImage(file) {
    const sourceDataUrl = await this._readFileAsDataUrl(file);
    const image = await this._loadImageData(sourceDataUrl);
    const longestSide = Math.max(image.width, image.height);

    if (!longestSide) return sourceDataUrl;

    const maxSide = 960;
    const scale = longestSide > maxSide ? maxSide / longestSide : 1;
    if (scale === 1 && file.size <= 600 * 1024) {
      return sourceDataUrl;
    }

    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return sourceDataUrl;

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);

    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const optimizedDataUrl = canvas.toDataURL(outputType, outputType === 'image/png' ? undefined : 0.84);

    return optimizedDataUrl.length < sourceDataUrl.length ? optimizedDataUrl : sourceDataUrl;
  }

  async _handlePlayerImageFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this._showPlayerModalFeedback('Image must be under 5MB', 'error');
      return;
    }
    if (!file.type.startsWith('image/')) {
      this._showPlayerModalFeedback('Please select an image file', 'error');
      return;
    }

    const taskId = ++this._playerImageTaskId;
    this._showPlayerModalFeedback('');
    this._setPlayerImageBusy(true, 'Optimizing image...');

    try {
      const optimizedImage = await this._optimizePlayerImage(file);
      if (taskId !== this._playerImageTaskId) return;

      this._pendingPlayerImage = optimizedImage;
      const preview = document.getElementById('player-avatar-drop');
      if (preview) {
        preview.classList.add('has-image');
        preview.innerHTML = `<img src="${optimizedImage}" alt="Preview" id="pm-avatar-img">`;
      }

      this._setPlayerImageBusy(false, 'Image optimized and ready');
    } catch (error) {
      if (taskId !== this._playerImageTaskId) return;
      this._setPlayerImageBusy(false);
      console.warn('Player image processing failed:', error);
      this._showPlayerModalFeedback('Could not process that image. Please try another file.', 'error');
    }
  }

  /** Re-render the player select view after a CRUD operation */
  _refreshPlayerView() {
    if (this.currentView === 'player-select') {
      this.ui.renderPlayerSelect(this._getPlayerCatalog(), this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
      this.bindPlayerSelectEvents();
    } else if (this.currentView === 'players') {
      this.ui.renderPlayerPool(this._getPlayerCatalog(), this.poolFilter, this.poolSearch);
      this.bindPoolEvents();
    }
  }

  /** Bind image upload, drag-drop, and all button events inside the player modal */
  _bindPlayerModalEvents() {
    // File input change
    const fileInput = document.getElementById('player-image-upload');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        this._handlePlayerImageFile(e.target.files[0]);
      });
    }

    // Click avatar to trigger file input
    const dropZone = document.getElementById('player-avatar-drop');
    if (dropZone) {
      dropZone.addEventListener('click', () => fileInput?.click());

      // Drag-drop
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) this._handlePlayerImageFile(file);
      });
    }

    // ── Direct button handlers (bypass event delegation) ──

    // Save button
    const form = document.getElementById('player-modal-form');
    if (form) {
      form.addEventListener('input', () => this._showPlayerModalFeedback(''));
      form.addEventListener('change', () => this._showPlayerModalFeedback(''));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (this._playerImageBusy) {
          this._showPlayerModalFeedback('Please wait for the image to finish processing', 'info');
          return;
        }

        this._showPlayerModalFeedback('');
        const saveBtn = document.getElementById('player-modal-save');
        const data = this._getPlayerFormData();
        const editId = saveBtn?.dataset.playerId ? parseInt(saveBtn.dataset.playerId) : null;
        let success;
        if (editId) {
          success = this.updatePlayer(editId, data);
        } else {
          success = this.addPlayer(data);
        }
        if (success) {
          this.ui.closePlayerModal();
          this._refreshPlayerView();
        }
      });
    }

    this._setPlayerImageBusy(false);

    // Cancel button
    document.getElementById('player-modal-cancel')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._playerImageTaskId++;
      this._setPlayerImageBusy(false);
      this._showPlayerModalFeedback('');
      this._pendingPlayerImage = null;
      this.ui.closePlayerModal();
    });

    // Close (X) button
    document.getElementById('player-modal-close')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._playerImageTaskId++;
      this._setPlayerImageBusy(false);
      this._showPlayerModalFeedback('');
      this._pendingPlayerImage = null;
      this.ui.closePlayerModal();
    });

    // Click overlay background to close
    const overlay = document.getElementById('player-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          e.stopPropagation();
          this._playerImageTaskId++;
          this._setPlayerImageBusy(false);
          this._showPlayerModalFeedback('');
          this._pendingPlayerImage = null;
          this.ui.closePlayerModal();
        }
      });
    }

    // Delete button → show confirmation
    const deleteBtn = document.getElementById('player-modal-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = parseInt(deleteBtn.dataset.playerId);
        const player = this.allPlayers.find(p => p.id === id);
        if (player) {
          this.ui.renderPlayerDeleteConfirm(player.name, id);
          this._bindDeleteConfirmEvents();
        }
      });
    }
  }

  /** Bind direct click handlers on delete confirmation dialog buttons */
  _bindDeleteConfirmEvents() {
    document.getElementById('player-delete-yes')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(e.currentTarget.dataset.playerId);
      if (this.deletePlayer(id)) {
        this.ui.closePlayerDeleteConfirm();
        this.ui.closePlayerModal();
        this._refreshPlayerView();
      }
    });

    document.getElementById('player-delete-no')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ui.closePlayerDeleteConfirm();
    });
  }

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  render() {
    const stats = this.engine ? {
      remaining: this.engine.getState().remainingPlayers,
      sold: this.engine.getState().soldCount,
      unsold: this.engine.getState().unsoldCount,
    } : {};

    this.ui.renderHeader(
      this.currentView,
      stats,
      this.sounds.muted,
      this.commentaryVisible,
      this.backgroundMedia.getUiState(),
      { connected: this.wsClient.connected, role: this.wsClient.role }
    );
    this.bindNavEvents();

    switch (this.currentView) {
      case 'login':
        this.ui.renderLogin();
        break;
      case 'setup':
        this.ui.renderSetup(TEAMS_DATA, this.selectedTeamIds, this.timerDuration);
        this.bindTimerSetting();
        break;
      case 'player-select':
        this.ui.renderPlayerSelect(this._getPlayerCatalog(), this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
        this.bindPlayerSelectEvents();
        break;
      case 'rules':
        this.ui.renderRulesPremium();
        break;
      case 'players':
        this.ui.renderPlayerPool(this._getPlayerCatalog(), this.poolFilter, this.poolSearch);
        this.bindPoolEvents();
        break;
      case 'auction':
        if (!this.engine) {
          this.ui.showToast('Please set up the auction first', 'warning');
          this.navigate('setup');
          return;
        }
        this.ui.renderAuction(this.engine.getState(), this.wsClient.getConnectedTeams());
        this.updateBidButtonStates();
        this.startTimerTick();
        // Show commentary panel
        if (this.commentaryVisible) {
          this.ui.renderCommentaryPanel(this.commentary.getLines());
        }
        this.startIdleCommentary();
        break;
      case 'results':
        this._renderResultsWithPremium();
        this.stopIdleCommentary();
        this.ui.removeCommentaryPanel();
        break;
      case 'live-match':
        this._renderLiveMatchView();
        this.stopIdleCommentary();
        this.ui.removeCommentaryPanel();
        break;
      case 'gallery':
        this._renderGalleryView();
        this.stopIdleCommentary();
        this.ui.removeCommentaryPanel();
        break;
      case 'awards':
        this.ui.renderViewSkeleton('awards');
        this._renderAwardsView();
        this.stopIdleCommentary();
        this.ui.removeCommentaryPanel();
        break;
      case 'about':
        this.ui.renderAbout();
        this.stopIdleCommentary();
        this.ui.removeCommentaryPanel();
        break;
      case 'history':
        this.ui.renderHistory();
        this.stopIdleCommentary();
        this.ui.removeCommentaryPanel();
        break;
      default:
        this.stopIdleCommentary();
        this.ui.removeCommentaryPanel();
        break;
    }

    this.syncViewportMetrics();
    this.ui.enhanceRenderedMedia(this.currentView);
    // Skip entrance animation for live-match (lobby has its own CSS animation,
    // and scoring view should not animate on every ball re-render)
    if (this.currentView !== 'live-match') {
      this.ui.animateViewEntrance();
    }
  }

  refreshAuctionRealtime(state = this.engine?.getState(), options = {}) {
    if (!state || this.currentView !== 'auction') return;

    const didPatch = this.ui.syncAuctionRealtime(state, this.wsClient.getConnectedTeams(), options);
    if (!didPatch) {
      this.ui.renderAuction(state, this.wsClient.getConnectedTeams());
    }

    this.updateBidButtonStates();
    if (state.timerEnabled && state.timerRemaining !== null) {
      this.ui.updateTimerDisplay(state.timerRemaining, state.timerDuration);
    }
    this.ui.enhanceRenderedMedia('auction');
  }

  async _loadFeatureModule(key, importer) {
    if (!this._featurePromises[key]) {
      this._featurePromises[key] = importer();
    }
    return this._featurePromises[key];
  }

  async _ensurePosterTools() {
    return this._loadFeatureModule('poster', () => import('./poster.js'));
  }

  async _ensureLiveMatchEngineClass() {
    const module = await this._loadFeatureModule('liveMatch', () => import('./live-match.js'));
    return module.LiveMatchEngine;
  }

  async _ensureAwardsEngine() {
    const module = await this._loadFeatureModule('awards', () => import('./awards.js'));
    return module.AwardsEngine;
  }

  // ═══════════════════════════════════════════
  // EVENT HANDLING
  // ═══════════════════════════════════════════

  bindNavEvents() {
    document.querySelectorAll('.nav-link[data-view]').forEach(btn => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.view));
    });
    document.querySelectorAll('.nav-more-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.view));
    });
    this.bindHeaderMenuEvents();
  }

  bindHeaderMenuEvents() {
    ['.nav-more-menu', '.hamburger-menu'].forEach((selector) => {
      const menu = document.querySelector(selector);
      if (!menu) return;

      const openMenu = () => this._openHeaderMenu(menu);
      const closeMenu = () => this._scheduleHeaderMenuClose(menu);

      menu.addEventListener('mouseenter', openMenu);
      menu.addEventListener('mouseleave', closeMenu);
      menu.addEventListener('focusin', openMenu);
      menu.addEventListener('focusout', (event) => {
        if (!menu.contains(event.relatedTarget)) {
          closeMenu();
        }
      });
    });
  }

  _openHeaderMenu(menu) {
    if (!menu) return;
    clearTimeout(menu._closeTimer);
    this._closeHeaderMenus(menu);
    menu.classList.add('is-open');

    const toggle = menu.querySelector('[id$="-toggle"]') || document.getElementById('nav-more-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');

    // Position .nav-more-menu below the toggle button
    if (menu.id === 'nav-more-menu-wrapper' && toggle) {
      const headerRect = this.ui.headerEl.getBoundingClientRect();
      const toggleRect = toggle.getBoundingClientRect();
      const centerX = toggleRect.left + toggleRect.width / 2 - headerRect.left;
      menu.style.left = `${centerX}px`;
      menu.style.top = `${headerRect.height}px`;
    }
  }

  _closeHeaderMenu(menu) {
    if (!menu) return;
    clearTimeout(menu._closeTimer);
    menu.classList.remove('is-open');

    const toggle = menu.querySelector('[id$="-toggle"]');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  _scheduleHeaderMenuClose(menu) {
    if (!menu) return;
    clearTimeout(menu._closeTimer);
    menu._closeTimer = setTimeout(() => {
      if (!menu.matches(':hover') && !menu.contains(document.activeElement)) {
        this._closeHeaderMenu(menu);
      }
    }, 140);
  }

  _closeHeaderMenus(except = null) {
    document.querySelectorAll('.nav-more-menu, .hamburger-menu').forEach((menu) => {
      if (menu !== except) {
        this._closeHeaderMenu(menu);
      }
    });
  }

  bindPoolEvents() {
    const searchInput = document.getElementById('player-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.poolSearch = e.target.value;
        const cursorPos = e.target.selectionStart;
        this.ui.renderPlayerPool(this._getPlayerCatalog(), this.poolFilter, this.poolSearch);
        this.bindPoolEvents();
        const newInput = document.getElementById('player-search');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(cursorPos, cursorPos);
        }
      });
    }
  }

  bindPlayerSelectEvents() {
    const searchInput = document.getElementById('player-select-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.playerSelectSearch = e.target.value;
        const cursorPos = e.target.selectionStart;
        this.ui.renderPlayerSelect(this._getPlayerCatalog(), this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
        this.bindPlayerSelectEvents();
        const newInput = document.getElementById('player-select-search');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(cursorPos, cursorPos);
        }
      });
    }
  }

  async onClick(e) {
    const target = e.target.closest('[data-team-id], [data-view], [data-role], [data-player-name], [data-player-edit-id], [data-ball], [data-live-match], [data-lm-new-batsman], [data-lm-next-bowler], [data-lm-coin-flip], [data-lm-dismissal], [data-lm-runout], [data-ro-runs], [data-gallery-filter], [data-delete-photo], [data-generate-card], #login-btn, #login-eye-toggle, #login-forgot-link, #logout-btn, #start-auction-btn, #nominate-btn, #sold-btn, #unsold-btn, #goto-auction-btn, #view-results-btn, #goto-setup-btn, #reauction-btn, #reauction-yes-btn, #reauction-no-btn, #download-all-posters-btn, #select-all-players-btn, #confirm-players-btn, #quick-bid-btn, #undo-bid-btn, #redo-bid-btn, #fullscreen-btn, #generate-qr-btn, #close-qr-modal, #copy-link-btn, #proceed-rules-btn, #reset-auction-btn, #reset-confirm-yes, #reset-confirm-no, #recall-bid-btn, #recall-confirm-yes, #recall-confirm-no, #select-all-teams-btn, #download-rules-pdf-btn, #sound-toggle-btn, #video-bg-toggle-btn, #results-tab-squads, #results-tab-analytics, #results-tab-standings, #results-tab-stats, #results-tab-scorecard, #results-tab-fixtures, #draw-tokens-btn, #clear-tokens-btn, #clear-tokens-yes, #clear-tokens-no, #download-fixtures-btn, #lock-fixtures-btn, #create-knockout-btn, #sc-back-btn, #sc-back-btn2, #sc-save-btn, .sc-open-btn, #commentary-toggle-btn, #commentary-header, #open-projector-btn, #hamburger-toggle, #nav-more-toggle, .nav-more-item, .qr-modal-overlay, .filter-btn, .team-bid-btn, .poster-preview-btn, .poster-download-btn, #live-undo-btn, #live-back-btn, #live-save-scorecard-btn, #lm-start-toss-btn, #lm-confirm-openers-btn, #lm-wd-toggle, #lm-nb-toggle, #lm-bye-toggle, #lm-lb-toggle, #lm-wicket-btn, #lm-modal-close-btn, #lm-save-yes-btn, #lm-save-no-btn, #lm-save-dismiss-btn, #lm-edit-score-btn, #live-edit-score-btn, #ro-swap-strike-btn, #lm-swap-strike-btn, #share-app-btn, #share-copy-wa-btn, #share-copy-ig-btn, #share-tab-wa, #share-tab-ig, #share-modal-close, #awards-reveal-next-btn, #awards-reset-btn, #awards-back-btn, #add-player-btn, #player-modal-save, #player-modal-cancel, #player-modal-close, #player-modal-delete, #player-modal-overlay, #player-delete-yes, #player-delete-no, #copy-player-pool-link-btn, .player-edit-btn, .score-btn, .lm-sub-btn, .lm-modal-option, .lm-modal-close');
    if (!target) return;

    // ── Premium Features Click Routing ──
    if (this.currentView === 'live-match' && await this._handleLiveMatchClick(target)) return;
    if (this.currentView === 'gallery' && this._handleGalleryClick(target)) return;
    if (this.currentView === 'awards' && this._handleAwardsClick(target)) return;

    // ── Player Management Modal ──
    // Open Add Player modal
    // Copy public player pool link
    if (target.id === 'copy-player-pool-link-btn') {
      const publicUrl = new URL('players.html', window.location.href).toString();
      navigator.clipboard.writeText(publicUrl).then(() => {
        this.ui.showToast('✅ Public player pool link copied!', 'success');
        target.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
        target.style.borderColor = 'rgba(16,185,129,0.4)';
        target.style.color = '#10b981';
        setTimeout(() => {
          target.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Copy Public Link`;
          target.style.borderColor = 'rgba(99,102,241,0.3)';
          target.style.color = 'var(--accent-indigo)';
        }, 2000);
      }).catch(() => {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = publicUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.ui.showToast('✅ Public player pool link copied!', 'success');
      });
      return;
    }

    if (target.id === 'add-player-btn') {
      this._playerImageTaskId++;
      this._playerImageBusy = false;
      this._pendingPlayerImage = null;
      this.ui.renderPlayerModal(null);
      this._bindPlayerModalEvents();
      return;
    }

    // Edit player button on card
    if (target.dataset.playerEditId) {
      e.stopPropagation(); // prevent card selection toggle
      const playerId = parseInt(target.dataset.playerEditId);
      const player = this.allPlayers.find(p => p.id === playerId);
      if (player) {
        this._playerImageTaskId++;
        this._playerImageBusy = false;
        this._pendingPlayerImage = null;
        this.ui.renderPlayerModal(player);
        this._bindPlayerModalEvents();
      }
      return;
    }

    // Save player (add or update)
    if (target.id === 'player-modal-save') {
      // Handled by the modal form submit listener so validation, image-busy
      // checks, and inline popup feedback all stay in one place.
      return;
    }

    // Cancel / Close modal
    if (target.id === 'player-modal-cancel' || target.id === 'player-modal-close') {
      this._pendingPlayerImage = null;
      this.ui.closePlayerModal();
      return;
    }

    // Close on overlay click (only if click is directly on overlay, not card)
    if (target.id === 'player-modal-overlay') {
      this._pendingPlayerImage = null;
      this.ui.closePlayerModal();
      return;
    }

    // Delete button → show confirmation
    if (target.id === 'player-modal-delete') {
      const id = parseInt(target.dataset.playerId);
      const player = this.allPlayers.find(p => p.id === id);
      if (player) {
        this.ui.renderPlayerDeleteConfirm(player.name, id);
      }
      return;
    }

    // Confirm delete
    if (target.id === 'player-delete-yes') {
      const id = parseInt(target.dataset.playerId);
      if (this.deletePlayer(id)) {
        this.ui.closePlayerDeleteConfirm();
        this.ui.closePlayerModal();
        this._refreshPlayerView();
      }
      return;
    }

    // Cancel delete
    if (target.id === 'player-delete-no') {
      this.ui.closePlayerDeleteConfirm();
      return;
    }

    // ── Login: submit ──
    // Password visibility toggle
    if (target.id === 'login-eye-toggle') {
      const passEl = document.getElementById('login-password');
      if (passEl) {
        const showing = passEl.type === 'text';
        passEl.type = showing ? 'password' : 'text';
        target.textContent = showing ? '👁️' : '👁️‍🗨️';
        target.title = showing ? 'Show password' : 'Hide password';
      }
      return;
    }

    // Forgot password (decorative)
    if (target.id === 'login-forgot-link') {
      this.ui.showToast('Please contact the tournament admin to reset your password', 'info');
      return;
    }

    if (target.id === 'login-btn') {
      const userEl = document.getElementById('login-username');
      const passEl = document.getElementById('login-password');
      if (userEl && passEl) {
        const username = userEl.value.trim();
        const password = passEl.value;

        // Try server login first, fall back to client-side for GitHub Pages
        let serverHandled = false;
        try {
          const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const data = await res.json();
            serverHandled = true;
            if (data.success) {
              localStorage.setItem('npl_token', data.token || 'npl-auth-token');
              await this.loadState({ preferServer: true });
              this.isLoggedIn = true;
              this.saveState({ immediate: true });
              this.broadcastPersistentState();
              this.ui.showToast('Login successful!', 'success');
              this.navigate('setup');
            } else {
              this.ui.showToast('Invalid username or password', 'error');
              // Shake the login card
              const card = document.querySelector('.login-card');
              if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
            }
          }
        } catch (_) {
          // Network error or parse error — fall through to client-side
        }

        // Client-side fallback (GitHub Pages / static hosting — no server)
        if (!serverHandled) {
          if (username.toUpperCase() === 'RCB' && password === 'RCB2.0') {
            this.isLoggedIn = true;
            localStorage.setItem('npl_token', 'npl-auth-token');
            this.saveState({ immediate: true });
            this.broadcastPersistentState();
            this.ui.showToast('Login successful!', 'success');
            this.navigate('setup');
          } else {
            this.ui.showToast('Invalid username or password', 'error');
            const card = document.querySelector('.login-card');
            if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
          }
        }
      }
      return;
    }

    // ── Logout ──
    if (target.id === 'logout-btn') {
      this.isLoggedIn = false;
      localStorage.removeItem('npl_token');
      // Stop commentary and speech
      this.commentaryVisible = false;
      this.commentary.setSpeechEnabled(false);
      this.commentary.stopSpeaking();
      this.ui.removeCommentaryPanel();
      this.stopIdleCommentary();
      this.saveState();
      this.ui.showToast('Logged out successfully', 'info');
      this.navigate('login');
      return;
    }

    // ── Setup: team toggle ──
    if (target.closest('.team-select-card')) {
      const teamId = target.closest('.team-select-card').dataset.teamId;
      if (teamId) this.toggleTeam(teamId);
      return;
    }

    // ── Setup: start auction ──
    if (target.id === 'start-auction-btn') {
      this.startAuction();
      return;
    }

    // ── Pool / Player Selection: filter ──
    if (target.classList.contains('filter-btn')) {
      if (this.currentView === 'player-select') {
        this.playerSelectFilter = target.dataset.role;
        this.ui.renderPlayerSelect(this._getPlayerCatalog(), this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
        this.bindPlayerSelectEvents();
      } else {
        this.poolFilter = target.dataset.role;
        this.ui.renderPlayerPool(this._getPlayerCatalog(), this.poolFilter, this.poolSearch);
        this.bindPoolEvents();
      }
      return;
    }

    // ── Player Selection: toggle individual player ──
    if (target.closest('.player-select-item') && this.currentView === 'player-select') {
      const card = target.closest('.player-select-item');
      const playerName = card.dataset.playerName;
      if (playerName) this.togglePlayer(playerName);
      return;
    }

    // ── Player Selection: select all ──
    if (target.id === 'select-all-players-btn' || target.closest('#select-all-players-btn')) {
      this.selectAllPlayers();
      return;
    }

    // ── Player Selection: confirm → go to Rules ──
    if (target.id === 'confirm-players-btn') {
      this.confirmPlayerSelection();
      return;
    }

    // ── Rules: proceed to auction ──
    if (target.id === 'proceed-rules-btn') {
      this.navigate('auction');
      return;
    }

    // ── Reset auction (show confirmation) ──
    if (target.id === 'reset-auction-btn') {
      this.ui.showResetConfirmModal();
      return;
    }

    // ── Reset confirm: yes ──
    if (target.id === 'reset-confirm-yes') {
      this.ui.closeResetConfirmModal();
      this.resetAuction();
      return;
    }

    // ── Reset confirm: no ──
    if (target.id === 'reset-confirm-no') {
      this.ui.closeResetConfirmModal();
      return;
    }

    // ── Recall bid (show confirmation) ──
    if (target.id === 'recall-bid-btn') {
      if (this.engine && this.engine.canRecall()) {
        const state = this.engine.getState();
        this.ui.showRecallConfirmModal(state.lastSalePlayer, state.lastSaleTeam, state.lastSaleType);
      }
      return;
    }

    // ── Recall confirm: yes ──
    if (target.id === 'recall-confirm-yes') {
      this.ui.closeRecallConfirmModal();
      this.handleRecallBid();
      return;
    }

    // ── Recall confirm: no ──
    if (target.id === 'recall-confirm-no') {
      this.ui.closeRecallConfirmModal();
      return;
    }

    // ── Setup: select all teams ──
    if (target.id === 'select-all-teams-btn' || target.closest('#select-all-teams-btn')) {
      this.selectAllTeams();
      return;
    }

    // ── Rules: download PDF ──
    if (target.id === 'download-rules-pdf-btn') {
      this.downloadRulesPDF();
      return;
    }

    // ── Pool: go to auction ──
    if (target.id === 'goto-auction-btn') {
      if (!this.engine) {
        this.ui.showToast('Please set up the auction first', 'warning');
        this.navigate('setup');
      } else {
        this.navigate('auction');
      }
      return;
    }

    // ── Auction: nominate ──
    if (target.id === 'nominate-btn') {
      this.nominatePlayer();
      return;
    }

    // ── Auction: team bid ──
    if (target.classList.contains('team-bid-btn')) {
      const teamId = target.dataset.teamId;
      if (teamId) this.placeBid(teamId);
      return;
    }

    // ── Auction: sold ──
    if (target.id === 'sold-btn') {
      this.sellPlayer();
      return;
    }

    // ── Auction: unsold ──
    if (target.id === 'unsold-btn') {
      this.markUnsold();
      return;
    }

    // ── Auction: quick bid ──
    if (target.id === 'quick-bid-btn') {
      this.handleQuickBid();
      return;
    }

    // ── Auction: undo bid ──
    if (target.id === 'undo-bid-btn') {
      this.handleUndoBid();
      return;
    }

    // ── Auction: redo bid ──
    if (target.id === 'redo-bid-btn') {
      this.handleRedoBid();
      return;
    }

    // ── Complete: view results ──
    if (target.id === 'view-results-btn') {
      this.navigate('results');
      return;
    }

    // ── Complete: re-auction yes ──
    if (target.id === 'reauction-yes-btn') {
      if (this.engine && this.engine.reauctionUnsold()) {
        this.commentary.onReauction(this.engine.playerPool?.length || 0);
        this.ui.showToast('♻️ Re-auction started with unsold players!', 'success');
        this.navigate('auction');
      }
      return;
    }

    // ── Complete: re-auction no → go to results ──
    if (target.id === 'reauction-no-btn') {
      this.navigate('results');
      return;
    }

    // ── Results: go to setup ──
    if (target.id === 'goto-setup-btn') {
      this.navigate('setup');
      return;
    }

    // ── Results: re-auction unsold (from results page) ──
    if (target.id === 'reauction-btn') {
      if (this.engine.reauctionUnsold()) {
        this.commentary.onReauction(this.engine.playerPool?.length || 0);
        this.ui.showToast('♻️ Re-auction started with unsold players!', 'success');
        this.navigate('auction');
      }
      return;
    }

    // ── Results: download all posters ──
    if (target.id === 'download-all-posters-btn') {
      this.downloadAllPosters();
      return;
    }

    // ── Results: preview single poster ──
    if (target.classList.contains('poster-preview-btn')) {
      const teamId = target.dataset.teamId;
      if (teamId) this.previewTeamPoster(teamId);
      return;
    }

    // ── Results: download single poster ──
    if (target.classList.contains('poster-download-btn')) {
      const teamId = target.dataset.teamId;
      if (teamId) this.downloadTeamPoster(teamId);
      return;
    }

    // ── Fullscreen toggle ──
    if (target.id === 'fullscreen-btn' || target.closest('#fullscreen-btn')) {
      this.toggleFullscreen();
      return;
    }

    // ── Hamburger menu toggle ──
    if (target.id === 'hamburger-toggle' || target.closest('#hamburger-toggle')) {
      const menu = document.querySelector('.hamburger-menu');
      if (menu?.classList.contains('is-open')) this._closeHeaderMenu(menu);
      else this._openHeaderMenu(menu);
      return;
    }

    // ── Nav More dropdown toggle ──
    if (target.id === 'nav-more-toggle' || target.closest('#nav-more-toggle')) {
      const menu = document.querySelector('.nav-more-menu');
      if (menu?.classList.contains('is-open')) this._closeHeaderMenu(menu);
      else this._openHeaderMenu(menu);
      return;
    }

    // ── Modal close button (live match modals) ──
    if (target.id === 'lm-modal-close-btn' || target.classList.contains('lm-modal-close')) {
      this._closeModal();
      // If we're in new-batsman or bowler-select phase, undo to go back to scoring
      if (this.liveMatchEngine) {
        const phase = this.liveMatchEngine.phase;
        if (phase === 'new-batsman' || phase === 'bowler-select') {
          this.liveMatchEngine.undoLastBall();
          this._saveLiveMatch();
          this._renderLiveMatchView();
        }
      }
      return;
    }

    // ── Generate QR / Mobile link ──
    if (target.id === 'generate-qr-btn' || target.closest('#generate-qr-btn')) {
      this.generateMobileSession();
      return;
    }

    // ── Close QR modal ──
    if (target.id === 'close-qr-modal' || target.classList.contains('qr-modal-overlay')) {
      this.ui.closeQRModal();
      return;
    }

    // ── Copy link ──
    if (target.id === 'copy-link-btn' || target.closest('#copy-link-btn')) {
      const linkEl = document.getElementById('mobile-link-text');
      if (linkEl) {
        navigator.clipboard.writeText(linkEl.textContent).then(() => {
          this.ui.showToast('📋 Link copied to clipboard!', 'success');
        }).catch(() => {
          this.ui.showToast('Failed to copy link', 'error');
        });
      }
      return;
    }

    // ── Sound toggle ──
    if (target.id === 'sound-toggle-btn' || target.closest('#sound-toggle-btn')) {
      const muted = this.sounds.toggleMute();
      this.ui.showToast(muted ? '🔇 Sound muted' : '🔊 Sound enabled', 'info', 1500);
      this._closeHeaderMenus();
      this.render();
      return;
    }

    // ── Background video toggle ──
    if (target.id === 'video-bg-toggle-btn' || target.closest('#video-bg-toggle-btn')) {
      const state = await this.backgroundMedia.toggleUserPreference();
      this._closeHeaderMenus();
      this.ui.showToast(
        state.active ? '🎬 Cinematic background enabled' : '🖼️ Cinematic poster mode enabled',
        'info',
        1600
      );
      this.render();
      return;
    }

    // ── Share App ──
    if (target.id === 'share-app-btn' || target.closest('#share-app-btn')) {
      this._closeHeaderMenus();
      this._showShareModal();
      return;
    }

    // ── Share modal controls ──
    if (target.id === 'share-modal-close') {
      const m = document.getElementById('share-app-modal');
      if (m) m.remove();
      return;
    }
    if (target.id === 'share-tab-wa') {
      document.getElementById('share-wa-content')?.classList.add('active');
      document.getElementById('share-ig-content')?.classList.remove('active');
      target.classList.add('active');
      document.getElementById('share-tab-ig')?.classList.remove('active');
      return;
    }
    if (target.id === 'share-tab-ig') {
      document.getElementById('share-ig-content')?.classList.add('active');
      document.getElementById('share-wa-content')?.classList.remove('active');
      target.classList.add('active');
      document.getElementById('share-tab-wa')?.classList.remove('active');
      return;
    }
    if (target.id === 'share-copy-wa-btn') {
      const txt = document.getElementById('share-wa-text')?.value;
      if (txt) navigator.clipboard.writeText(txt).then(() => this.ui.showToast('📋 WhatsApp message copied!', 'success'));
      return;
    }
    if (target.id === 'share-copy-ig-btn') {
      const txt = document.getElementById('share-ig-text')?.value;
      if (txt) navigator.clipboard.writeText(txt).then(() => this.ui.showToast('📋 Instagram caption copied!', 'success'));
      return;
    }

    // ── Results tab: squads ──
    if (target.id === 'results-tab-squads' || target.closest('#results-tab-squads')) {
      this.resultsTab = 'squads';
      this._renderResultsWithPremium();
      return;
    }

    // ── Results tab: analytics ──
    if (target.id === 'results-tab-analytics' || target.closest('#results-tab-analytics')) {
      this.resultsTab = 'analytics';
      this._renderResultsWithPremium();
      return;
    }

    // ── Results tab: standings ──
    if (target.id === 'results-tab-standings' || target.closest('#results-tab-standings')) {
      this.resultsTab = 'standings';
      this._renderResultsWithPremium();
      return;
    }

    // ── Results tab: stats ──
    if (target.id === 'results-tab-stats' || target.closest('#results-tab-stats')) {
      this.resultsTab = 'stats';
      this._renderResultsWithPremium();
      return;
    }

    // ── Results tab: scorecard ──
    if (target.id === 'results-tab-scorecard' || target.closest('#results-tab-scorecard')) {
      this.resultsTab = 'scorecard';
      this.scorecardView = 'list';
      this.activeScorecardId = null;
      this._renderScorecard();
      return;
    }

    // ── Scorecard: open match ──
    if (target.classList.contains('sc-open-btn') || target.closest('.sc-open-btn')) {
      const matchId = (target.dataset.scMatch || target.closest('[data-sc-match]')?.dataset.scMatch);
      if (matchId) {
        this._ensureScorecardMatch(matchId);
        this.scorecardView = 'edit';
        this.activeScorecardId = matchId;
        this._renderScorecard();
      }
      return;
    }

    // ── Scorecard: back to list ──
    if (target.id === 'sc-back-btn' || target.id === 'sc-back-btn2') {
      this.scorecardView = 'list';
      this.activeScorecardId = null;
      this._renderScorecard();
      return;
    }

    // ── Scorecard: save ──
    if (target.id === 'sc-save-btn') {
      this._saveScorecardFromForm();
      return;
    }

    // ── Results tab: fixtures ──
    if (target.id === 'results-tab-fixtures' || target.closest('#results-tab-fixtures')) {
      this.resultsTab = 'fixtures';
      this._renderResultsWithPremium();
      return;
    }

    // ── Draw tokens for fixtures ──
    if (target.id === 'draw-tokens-btn' || target.closest('#draw-tokens-btn')) {
      const gd = this.engine?.groupDivision;
      if (gd && this.fixturesLocked) {
        // Only block Re-Draw if fixtures are already drawn and locked
        this.ui.showToast('🔒 Fixtures are locked. Unlock first to re-draw.', 'warning');
        return;
      }
      this.handleTokenDraw();
      return;
    }

    // ── Lock/Unlock fixtures ──
    if (target.id === 'lock-fixtures-btn' || target.closest('#lock-fixtures-btn')) {
      this.fixturesLocked = !this.fixturesLocked;
      localStorage.setItem('npl_fixtures_locked', this.fixturesLocked ? '1' : '0');
      this.ui.showToast(this.fixturesLocked ? '🔒 Fixtures locked!' : '🔓 Fixtures unlocked!', 'info');
      this._renderResultsWithPremium();
      return;
    }

    // ── Clear tokens (show confirmation) ──
    if (target.id === 'clear-tokens-btn' || target.closest('#clear-tokens-btn')) {
      if (this.fixturesLocked) {
        this.ui.showToast('🔒 Fixtures are locked. Unlock first.', 'warning');
        return;
      }
      this.ui.showClearTokensModal();
      return;
    }
    if (target.id === 'clear-tokens-yes') {
      this.ui.closeClearTokensModal();
      if (this.engine) {
        this.engine.groupDivision = null;
        this.engine.fixtureSchedule = null;
        this._resetAllMatchData();
        this.saveState();
        this.broadcastState();
        this.ui.showToast('🗑️ Token draw cleared. All match data reset.', 'info');
        this.resultsTab = 'fixtures';
        this._renderResultsWithPremium();
      }
      return;
    }
    if (target.id === 'clear-tokens-no') {
      this.ui.closeClearTokensModal();
      return;
    }

    // ── Download HD Fixtures ──
    if (target.id === 'download-fixtures-btn' || target.closest('#download-fixtures-btn')) {
      this.downloadFixturesHD();
      return;
    }

    // ── Sync fixtures to live section ──
    if (target.id === 'sync-live-fixtures-btn' || target.closest('#sync-live-fixtures-btn')) {
      if (!this.syncFixturesToLive({ showToast: true })) {
        this.ui.showToast('⚠️ Draw fixtures first before syncing live section.', 'warning');
      }
      return;
    }

    // ── Commentary toggle (header button) ──
    if (target.id === 'commentary-toggle-btn' || target.closest('#commentary-toggle-btn')) {
      this.toggleCommentary();
      return;
    }

    // ── Commentary panel header click (collapse/expand) ──
    if (target.id === 'commentary-header' || target.closest('#commentary-header')) {
      this.ui.toggleCommentaryPanel();
      return;
    }

    // ── Open Projector Screen ──
    if (target.id === 'open-projector-btn' || target.closest('#open-projector-btn')) {
      this._closeHeaderMenus();
      window.open('projector.html', '_blank');
      return;
    }
  }

  // ═══════════════════════════════════════════
  // AUCTION ACTIONS
  // ═══════════════════════════════════════════

  toggleTeam(teamId) {
    if (this.selectedTeamIds.has(teamId)) {
      this.selectedTeamIds.delete(teamId);
    } else {
      this.selectedTeamIds.add(teamId);
    }
    this.ui.renderSetup(TEAMS_DATA, this.selectedTeamIds);
  }

  selectAllTeams() {
    const allSelected = TEAMS_DATA.length > 0 && TEAMS_DATA.every(t => this.selectedTeamIds.has(t.id));
    if (allSelected) {
      this.selectedTeamIds.clear();
    } else {
      TEAMS_DATA.forEach(t => this.selectedTeamIds.add(t.id));
    }
    this.ui.renderSetup(TEAMS_DATA, this.selectedTeamIds);
  }

  downloadRulesPDF() {
    // Trigger browser print for the rules page
    this.ui.showToast('Preparing rules for download...', 'info', 2000);
    setTimeout(() => window.print(), 300);
  }

  startAuction() {
    if (this.selectedTeamIds.size < 2) {
      this.ui.showToast('Select at least 2 teams', 'warning');
      return;
    }

    // Read timer setting
    const timerInput = document.getElementById('timer-duration');
    if (timerInput) {
      this.timerDuration = parseInt(timerInput.value, 10) || 30;
    }

    // Pre-select all players by default
    this.selectedPlayerIds = new Set(this._getPlayerCatalog().map(p => p.name));
    this.playerSelectFilter = 'All';
    this.playerSelectSearch = '';
    this.ui.showToast('Now select players for the auction', 'info');
    this.navigate('player-select');
  }

  togglePlayer(playerName) {
    if (this.selectedPlayerIds.has(playerName)) {
      this.selectedPlayerIds.delete(playerName);
    } else {
      this.selectedPlayerIds.add(playerName);
    }
    this.ui.renderPlayerSelect(this._getPlayerCatalog(), this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
    this.bindPlayerSelectEvents();
  }

  selectAllPlayers() {
    // Get currently filtered players
    let filtered = this._getPlayerCatalog();
    if (this.playerSelectFilter === 'Wicket-Keeper') {
      filtered = filtered.filter(p => p.isWK);
    } else if (this.playerSelectFilter !== 'All') {
      filtered = filtered.filter(p => p.role === this.playerSelectFilter);
    }
    if (this.playerSelectSearch) {
      const q = this.playerSelectSearch.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q));
    }

    const allSelected = filtered.length > 0 && filtered.every(p => this.selectedPlayerIds.has(p.name));
    if (allSelected) {
      // Deselect all filtered
      filtered.forEach(p => this.selectedPlayerIds.delete(p.name));
    } else {
      // Select all filtered
      filtered.forEach(p => this.selectedPlayerIds.add(p.name));
    }
    this.ui.renderPlayerSelect(this._getPlayerCatalog(), this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
    this.bindPlayerSelectEvents();
  }

  confirmPlayerSelection() {
    if (this.selectedPlayerIds.size === 0) {
      this.ui.showToast('Select at least 1 player', 'warning');
      return;
    }

    const selectedTeams = TEAMS_DATA.filter(t => this.selectedTeamIds.has(t.id));
    const selectedPlayers = this._getPlayerCatalog().filter(p => this.selectedPlayerIds.has(p.name));
    this.engine = new AuctionEngine(selectedTeams, selectedPlayers, {
      timerDuration: this.timerDuration,
    });
    this.saveState();

    // Initialize commentary
    this.commentary.clear();
    this.commentary.onAuctionStart(selectedTeams.length, selectedPlayers.length);

    this.ui.showToast(`${selectedTeams.length} teams, ${selectedPlayers.length} players ready!`, 'success');
    this.navigate('rules');
  }

  handleQuickBid() {
    if (!this.engine) return;

    const amountInput = document.getElementById('quick-bid-amount');
    const teamSelect = document.getElementById('quick-bid-team');
    if (!amountInput || !teamSelect) return;

    const amount = parseInt(amountInput.value, 10);
    const teamId = teamSelect.value;

    if (!teamId) {
      this.ui.showToast('Please select a team', 'warning');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      this.ui.showToast('Please enter a valid bid amount', 'warning');
      return;
    }
    if (amount > AuctionEngine.MAX_BID) {
      this.ui.showToast(`⚠️ Max bid is ${AuctionEngine.MAX_BID.toLocaleString('en-IN')} pts`, 'error');
      return;
    }

    const result = this.engine.placeDirectBid(teamId, amount);
    if (result.success) {
      this.lastTickSecond = null;
      const state = this.engine.getState();
      this.refreshAuctionRealtime(state, { flashBid: true });
      this.ui.showToast(`Quick bid: ${AuctionEngine.formatPoints(amount)}`, 'success');
      this.broadcastState();
      this.saveState();
    } else {
      this.ui.showToast(result.error, 'error');
    }
  }

  handleUndoBid() {
    if (!this.engine) return;
    if (this.engine.undoBid()) {
      this.lastTickSecond = null;
      const state = this.engine.getState();
      this.refreshAuctionRealtime(state, { flashBid: true });
      this.ui.showToast('Bid undone', 'info');
      this.broadcastState();
      this.saveState();
    }
  }

  handleRedoBid() {
    if (!this.engine) return;
    if (this.engine.redoBid()) {
      this.lastTickSecond = null;
      const state = this.engine.getState();
      this.refreshAuctionRealtime(state, { flashBid: true });
      this.ui.showToast('Bid redone', 'info');
      this.broadcastState();
      this.saveState();
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      const requestFullscreen = document.documentElement.requestFullscreen?.bind(document.documentElement);
      if (!requestFullscreen) {
        this.ui.showToast('Fullscreen not supported', 'warning');
        return;
      }

      Promise.resolve()
        .then(() => requestFullscreen({ navigationUI: 'hide' }))
        .catch(() => requestFullscreen())
        .catch(() => {
          this.ui.showToast('Fullscreen not supported', 'warning');
        });
    } else {
      document.exitFullscreen();
    }
  }

  nominatePlayer() {
    if (!this.engine) return;

    // Clear recall when nominating a new player
    this.engine.lastSale = null;

    const player = this.engine.nominateNext();
    if (!player) {
      this.ui.showToast('All players have been auctioned!', 'info');
      this.stopTimerTick();

      // Commentary: auction complete
      const state = this.engine.getState();
      this.commentary.onAuctionComplete(state.soldCount, state.unsoldCount);

      this.render();
      this.broadcastState();
      return;
    }

    this.sounds.playNominate();
    this.lastTickSecond = null;

    // Commentary: player nominated
    const state = this.engine.getState();
    this.commentary.onNominate(player, state.playerIndex, state.totalPlayers, state.remainingPlayers);

    this.render();
    this.ui.showToast(`🏏 ${player.name} is up for auction!`, 'info');
    this.broadcastState();
    this.saveState();
  }

  placeBid(teamId) {
    if (!this.engine) return;

    const canBid = this.engine.canTeamBid(teamId);
    if (!canBid) {
      const team = this.engine.getTeamState(teamId);
      if (team && team.squad.length >= 13) {
        this.ui.showToast(`${team.shortName}: Squad is full (13/13)`, 'error');
      } else if (this.engine.currentBidder === teamId) {
        this.ui.showToast(`${team.shortName}: Already the highest bidder`, 'warning');
      } else {
        this.ui.showToast(`${team?.shortName || 'Team'}: Insufficient budget`, 'error');
      }
      return;
    }

    const result = this.engine.placeBid(teamId);
    if (result.success) {
      this.sounds.playBid();
      this.lastTickSecond = null; // reset tick tracking
      const state = this.engine.getState();

      // Commentary: bid placed
      const team = this.engine.getTeamState(teamId);
      this.commentary.onBid(
        team?.shortName || 'Team',
        team?.name || 'Team',
        result.bid,
        state.currentPlayer?.name || 'Player',
        state.bidHistory,
        team
      );

      this.refreshAuctionRealtime(state, { flashBid: true });
      this.broadcastState();
      this.saveState();
    }
  }

  // ── Scorecard Helpers ──
  _renderScorecard() {
    if (!this.engine) return;
    const state = this.engine.getState();
    const gd = state.groupDivision;

    if (gd) {
      const fixtures = this._getFixtureMatchList(gd, state.teams);
      this._syncFixtureMatchesToSchedule(fixtures, state.teams);
    }

    this.resultsTab = 'scorecard';
    this._renderResultsWithPremium();
  }

  _ensureScorecardMatch(matchId) {
    const state = this.engine.getState();
    const gd = state.groupDivision;
    if (!gd) return;
    const allTeams = state.teams;
    const getTeam = (id) => allTeams.find(t => t.id === id) || { id, name: id, shortName: id, color: '#666', textColor: '#fff', logo: '', squad: [] };
    const fixtures = this._getFixtureMatchList(gd, allTeams);
    const fix = fixtures.find(f => f.matchId === matchId);
    if (!fix) return;
    const tA = getTeam(fix.teamAId);
    const tB = getTeam(fix.teamBId);
    this.scorecardMgr.syncFixtureMatch(matchId, tA, tB, {
      venue: 'Nakre Ground', date: fix.date, time: fix.time,
    });
  }

  _fixtureDateForDay(day) {
    return day === 1 ? '25 April 2026' : '26 April 2026';
  }

  _formatFixtureClock(totalMinutes) {
    const hours24 = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, '0')}`;
  }

  _formatFixtureTime(slotIndex) {
    const startMinutes = (8 * 60) + 30 + (slotIndex * 60);
    const endMinutes = startMinutes + 60;
    return `${this._formatFixtureClock(startMinutes)} – ${this._formatFixtureClock(endMinutes)}`;
  }

  _buildFixtureScheduleFromDays(...dayBuckets) {
    let matchNum = 1;

    return dayBuckets.flatMap((entries, dayIndex) => (
      entries.map((entry, slotIndex) => ({
        matchId: `match-${matchNum}`,
        matchNum: matchNum++,
        teamAId: entry.teamAId,
        teamBId: entry.teamBId,
        group: entry.group,
        day: dayIndex + 1,
        date: this._fixtureDateForDay(dayIndex + 1),
        time: this._formatFixtureTime(slotIndex),
      }))
    ));
  }

  _buildDefaultFixtureSchedule(gd) {
    if (!gd) return [];

    const rrPairs = (group) => [
      [group[0], group[1]], [group[2], group[3]],
      [group[0], group[2]], [group[1], group[3]],
      [group[0], group[3]], [group[1], group[2]],
    ];

    const pA = rrPairs(gd.groupA);
    const pB = rrPairs(gd.groupB);

    const day1 = [
      { teamAId: pA[0][0], teamBId: pA[0][1], group: 'A' },
      { teamAId: pB[0][0], teamBId: pB[0][1], group: 'B' },
      { teamAId: pA[1][0], teamBId: pA[1][1], group: 'A' },
      { teamAId: pB[1][0], teamBId: pB[1][1], group: 'B' },
      { teamAId: pA[2][0], teamBId: pA[2][1], group: 'A' },
      { teamAId: pB[2][0], teamBId: pB[2][1], group: 'B' },
      { teamAId: pA[3][0], teamBId: pA[3][1], group: 'A' },
      { teamAId: pB[3][0], teamBId: pB[3][1], group: 'B' },
    ];
    const day2 = [
      { teamAId: pA[4][0], teamBId: pA[4][1], group: 'A' },
      { teamAId: pB[4][0], teamBId: pB[4][1], group: 'B' },
      { teamAId: pA[5][0], teamBId: pA[5][1], group: 'A' },
      { teamAId: pB[5][0], teamBId: pB[5][1], group: 'B' },
    ];

    return this._buildFixtureScheduleFromDays(day1, day2);
  }

  _syncFixtureMatchesToSchedule(fixtures, teams) {
    if (!Array.isArray(fixtures) || !fixtures.length) return;

    const getTeam = (id) => teams.find(t => t.id === id) || {
      id,
      name: id,
      shortName: id,
      color: '#666',
      textColor: '#fff',
      logo: '',
      squad: [],
    };

    fixtures.forEach((fixture) => {
      this.scorecardMgr.syncFixtureMatch(
        fixture.matchId,
        getTeam(fixture.teamAId),
        getTeam(fixture.teamBId),
        { venue: 'Nakre Ground', date: fixture.date, time: fixture.time },
      );
    });
  }

  _applyFixtureSchedule(fixtures, { render = true, immediateSync = false } = {}) {
    if (!this.engine || !Array.isArray(fixtures) || !fixtures.length) return;

    this.engine.fixtureSchedule = fixtures.map(fixture => ({ ...fixture }));
    const state = this.engine.getState();
    this._syncFixtureMatchesToSchedule(this.engine.fixtureSchedule, state.teams);
    this.saveState({ immediate: immediateSync });
    this.broadcastState();

    if (render && this.currentView === 'results' && this.resultsTab === 'fixtures') {
      this._renderResultsWithPremium();
    }
  }

  syncFixturesToLive({ showToast = false, renderCurrent = true } = {}) {
    if (!this.engine) return false;

    const state = this.engine.getState();
    if (!state.groupDivision) return false;

    const fixtures = this._getFixtureMatchList(state.groupDivision, state.teams);
    if (!fixtures.length) return false;

    this._syncFixtureMatchesToSchedule(fixtures, state.teams);
    this.saveState({ immediate: true });
    this.broadcastState();

    if (renderCurrent) {
      if (this.currentView === 'live-match' && !this.liveMatchEngine) {
        this._renderLiveMatchView();
      } else if (this.currentView === 'results' && this.resultsTab === 'fixtures') {
        this._renderResultsWithPremium();
      }
    }

    if (showToast) {
      this.ui.showToast('🔄 Live fixtures synced with current schedule.', 'success');
    }

    return true;
  }

  _getFixtureMatchList(gd, teams) {
    if (!gd) return [];

    const schedule = Array.isArray(this.engine?.fixtureSchedule) && this.engine.fixtureSchedule.length
      ? this.engine.fixtureSchedule
      : this._buildDefaultFixtureSchedule(gd);
    if (schedule.length) {
      return schedule.map((fixture) => ({ ...fixture }));
    }

    // Time slots: each match = 1 hour, starting 8:30 AM
    const day1Times = ['8:30 – 9:30','9:30 – 10:30','10:30 – 11:30','11:30 – 12:30','12:30 – 1:30','1:30 – 2:30','2:30 – 3:30','3:30 – 4:30'];
    const day2Times = ['8:30 – 9:30','9:30 – 10:30','10:30 – 11:30','11:30 – 12:30'];

    // Round-robin pairs for 4 teams [0,1,2,3]
    // Round 1: 0v1, 2v3  |  Round 2: 0v2, 1v3  |  Round 3: 0v3, 1v2
    const rrPairs = (g) => [
      [g[0],g[1]], [g[2],g[3]],  // Round 1
      [g[0],g[2]], [g[1],g[3]],  // Round 2
      [g[0],g[3]], [g[1],g[2]]   // Round 3
    ];

    const pA = rrPairs(gd.groupA);
    const pB = rrPairs(gd.groupB);

    // Day 1 (8 matches): Interleave A,B from Round 1, 2 & start of 3
    // Day 2 (4 matches): Remaining league + Knockouts after
    const day1 = [
      { pair: pA[0], group: 'A' }, // R1-M1
      { pair: pB[0], group: 'B' }, // R1-M1
      { pair: pA[1], group: 'A' }, // R1-M2
      { pair: pB[1], group: 'B' }, // R1-M2
      { pair: pA[2], group: 'A' }, // R2-M1
      { pair: pB[2], group: 'B' }, // R2-M1
      { pair: pA[3], group: 'A' }, // R2-M2
      { pair: pB[3], group: 'B' }, // R2-M2
    ];
    const day2 = [
      { pair: pA[4], group: 'A' }, // R3-M1
      { pair: pB[4], group: 'B' }, // R3-M1
      { pair: pA[5], group: 'A' }, // R3-M2
      { pair: pB[5], group: 'B' }, // R3-M2
    ];

    const scheduled = [...day1, ...day2];

    return scheduled.map((s, i) => {
      const dayIdx = i < 8 ? 0 : 1;
      const slotIdx = dayIdx === 0 ? i : i - 8;
      const times = dayIdx === 0 ? day1Times : day2Times;
      return {
        matchId: `match-${i + 1}`,
        matchNum: i + 1,
        teamAId: s.pair[0],
        teamBId: s.pair[1],
        group: s.group,
        day: dayIdx + 1,
        date: dayIdx === 0 ? '25 April 2026' : '26 April 2026',
        time: times[slotIdx] || '',
      };
    });
  }

  _saveScorecardFromForm() {
    const editor = document.querySelector('.sc-editor');
    if (!editor) return;
    const matchId = editor.dataset.matchId;
    if (!matchId) return;

    // Save each innings
    [1, 2].forEach(num => {
      const card = editor.querySelector(`.sc-innings-card[data-innings="${num}"]`);
      if (!card) return;
      const batting = [...card.querySelectorAll('.sc-bat-row')].map(row => ({
        name: row.querySelector('.sc-bat-name')?.textContent || '',
        runs: row.querySelector('[data-field="runs"]')?.value || '',
        balls: row.querySelector('[data-field="balls"]')?.value || '',
        fours: row.querySelector('[data-field="fours"]')?.value || '',
        sixes: row.querySelector('[data-field="sixes"]')?.value || '',
        dismissal: row.querySelector('[data-field="dismissal"]')?.value || '',
        isNotOut: row.querySelector('[data-field="isNotOut"]')?.checked || false,
        didBat: true,
      }));
      const bowling = [...card.querySelectorAll('.sc-bowl-row')].map(row => ({
        name: row.querySelector('.sc-bat-name')?.textContent || '',
        overs: row.querySelector('[data-field="overs"]')?.value || '',
        maidens: row.querySelector('[data-field="maidens"]')?.value || '',
        runs: row.querySelector('[data-field="runs"]')?.value || '',
        wickets: row.querySelector('[data-field="wickets"]')?.value || '',
        didBowl: true,
      }));
      const extras = {};
      card.querySelectorAll('[data-extra]').forEach(el => { extras[el.dataset.extra] = parseInt(el.value) || 0; });
      const totalRuns = card.querySelector('[data-field="totalRuns"]')?.value;
      const wickets = card.querySelector('[data-field="wickets"]')?.value;
      const overs = card.querySelector('[data-field="overs"]')?.value;
      this.scorecardMgr.updateInnings(matchId, num, { batting, bowling, extras, totalRuns, wickets, overs });
    });

    // Save toss
    const tossWinner = editor.querySelector('[data-field="tossWinner"]')?.value || '';
    const tossDecision = editor.querySelector('[data-field="tossDecision"]')?.value || '';
    this.scorecardMgr.updateMatchInfo(matchId, { tossWinner, tossDecision });

    // Save result
    const winner = editor.querySelector('.sc-result-card [data-field="winner"]')?.value || '';
    const margin = editor.querySelector('.sc-result-card [data-field="margin"]')?.value || '';
    const potm = editor.querySelector('.sc-result-card [data-field="playerOfMatch"]')?.value || '';
    if (winner) {
      this.scorecardMgr.setResult(matchId, winner, margin, potm, '');
    }

    this.saveState();
    this.broadcastState();
    this.ui.showToast('💾 Scorecard saved!', 'success');
    this._renderScorecard();
  }

  // ── Token Draw for Group Division ──
  handleTokenDraw() {
    if (!this.engine) return;

    const FIXED_A = 'bfcl';  // BFC Legends
    const FIXED_B = 'bfc';   // BFC
    const state = this.engine.getState();

    // Get all team IDs except the fixed ones
    const allTeamIds = state.teams.map(t => t.id);
    const drawableTeams = allTeamIds.filter(id => id !== FIXED_A && id !== FIXED_B);

    // Shuffle (Fisher-Yates)
    for (let i = drawableTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [drawableTeams[i], drawableTeams[j]] = [drawableTeams[j], drawableTeams[i]];
    }

    // Assign tokens: Token 1,3,5 → Group A; Token 2,4,6 → Group B
    const tokenMap = {};
    drawableTeams.forEach((id, i) => {
      tokenMap[`token${i + 1}`] = id;
    });

    const groupA = [FIXED_A, tokenMap.token1, tokenMap.token3, tokenMap.token5];
    const groupB = [FIXED_B, tokenMap.token2, tokenMap.token4, tokenMap.token6];

    this.engine.groupDivision = { groupA, groupB, tokenMap };
    this.engine.fixtureSchedule = this._buildDefaultFixtureSchedule(this.engine.groupDivision);

    // Reset all dependent match data on re-draw
    this._resetAllMatchData();

    this.saveState();
    this.broadcastState();
    this.ui.showToast('🎲 Tokens drawn! Groups assigned. Match data reset.', 'success');
    this.resultsTab = 'fixtures';
    this._renderResultsWithPremium();
  }

  _resetAllMatchData() {
    // Clear all scorecard matches
    this.scorecardMgr.matches.clear();
    // Clear all live match localStorage entries
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('npl_live_match_')) {
        localStorage.removeItem(key);
        i--; // adjust index after removal
      }
    }
    // Clear active live engine
    this.liveMatchEngine = null;
  }

  // ── Download HD Fixtures as PNG ──
  async downloadFixturesHD() {
    const dashboard = document.querySelector('.fixtures-dashboard');
    if (!dashboard) return;

    this.ui.showToast('📸 Generating HD image...', 'info');

    try {
      // Dynamically load html2canvas if not available
      if (typeof html2canvas === 'undefined') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const canvas = await html2canvas(dashboard, {
        scale: 3,
        backgroundColor: null,
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => {
          const clonedDash = clonedDoc.querySelector('.fixtures-dashboard');
          if (clonedDash) {
            clonedDash.style.background = '#0a0e27';
            clonedDash.style.padding = '32px';
            clonedDash.style.borderRadius = '0';
          }
          // Force opaque backgrounds on all cards
          clonedDoc.querySelectorAll('.fixture-match-card, .fixture-group-card, .fixtures-header, .fixture-token-slot, .knockout-card').forEach(el => {
            const cs = getComputedStyle(el);
            if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor.includes('rgba')) {
              el.style.backgroundColor = '#131836';
            }
          });
          // Hide buttons in export
          clonedDoc.querySelectorAll('#draw-tokens-btn, #clear-tokens-btn, #download-fixtures-btn').forEach(el => {
            el.style.display = 'none';
          });
        },
      });

      const link = document.createElement('a');
      link.download = 'NPL_3.0_Match_Fixtures_HD.png';
      link.href = canvas.toDataURL('image/png');
      link.click();

      this.ui.showToast('✅ HD fixtures downloaded!', 'success');
    } catch (err) {
      console.error('Fixtures download failed:', err);
      this.ui.showToast('❌ Download failed', 'error');
    }
  }

  // ── Fixture Drag-Drop ──
  initFixtureDragDrop() {
    const grids = [...document.querySelectorAll('.fixtures-match-grid[data-day]')];
    if (!grids.length) return;
    if (this.fixturesLocked) return;

    let draggedEl = null;

    const clearDragState = () => {
      grids.forEach(g => g.classList.remove('drag-over'));
      if (draggedEl) draggedEl.classList.remove('dragging');
      draggedEl = null;
    };

    grids.forEach(grid => {
      grid.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.fixture-match-card[draggable="true"]');
        if (!card) return;
        draggedEl = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.matchId || card.dataset.matchNum || 'fixture-match');
      });

      grid.addEventListener('dragenter', (e) => {
        if (!draggedEl) return;
        e.preventDefault();
        grid.classList.add('drag-over');
      });

      grid.addEventListener('dragend', () => {
        clearDragState();
      });

      grid.addEventListener('dragover', (e) => {
        if (!draggedEl) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        grid.classList.add('drag-over');
        this._previewFixtureCardPosition(grid, draggedEl, e.clientX, e.clientY);
      });

      grid.addEventListener('dragleave', (e) => {
        if (this._isFixtureDragInsideGrid(grid, e.relatedTarget)) return;
        grid.classList.remove('drag-over');
      });

      grid.addEventListener('drop', (e) => {
        e.preventDefault();
        grid.classList.remove('drag-over');
        if (!draggedEl) return;

        this._previewFixtureCardPosition(grid, draggedEl, e.clientX, e.clientY);

        this._persistFixtureScheduleFromDom();
        // Sync updated schedule to the Live match lobby
        this.syncFixturesToLive({ showToast: false, renderCurrent: false });
        clearDragState();
      });
    });
  }

  _isFixtureDragInsideGrid(grid, relatedTarget) {
    return relatedTarget instanceof Element && grid.contains(relatedTarget);
  }

  _getClosestMatchCard(grid, x, y, excludeEl = null) {
    const cards = [...grid.querySelectorAll('.fixture-match-card')].filter(
      card => card !== excludeEl && !card.classList.contains('dragging'),
    );
    let closest = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach(card => {
      const box = card.getBoundingClientRect();
      const centerX = box.left + (box.width / 2);
      const centerY = box.top + (box.height / 2);
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = card;
      }
    });
    return closest;
  }

  _fixtureLeagueSlotsPerDay() {
    return 6;
  }

  _getCombinedFixtureCards(excludeEl = null) {
    return ['fixtures-day1-grid', 'fixtures-day2-grid'].flatMap((gridId) => {
      const grid = document.getElementById(gridId);
      if (!grid) return [];
      return [...grid.querySelectorAll('.fixture-match-card')].filter(card => card !== excludeEl);
    });
  }

  _renderFixtureOrderPreview(orderedCards) {
    const day1Grid = document.getElementById('fixtures-day1-grid');
    const day2Grid = document.getElementById('fixtures-day2-grid');
    if (!day1Grid || !day2Grid) return;

    const day1Slots = this._fixtureLeagueSlotsPerDay();
    orderedCards.slice(0, day1Slots).forEach((card) => day1Grid.appendChild(card));
    orderedCards.slice(day1Slots).forEach((card) => day2Grid.appendChild(card));
    this._updateFixtureTimes();
  }

  _previewFixtureCardPosition(grid, draggedEl, x, y) {
    // Collect all cards from both day grids, EXCLUDING the dragged element
    const day1Grid = document.getElementById('fixtures-day1-grid');
    const day2Grid = document.getElementById('fixtures-day2-grid');
    if (!day1Grid || !day2Grid) return;

    const day1Slots = this._fixtureLeagueSlotsPerDay();

    // Get cards in the TARGET grid only (excluding dragged)
    const targetCards = [...grid.querySelectorAll('.fixture-match-card')]
      .filter(c => c !== draggedEl && !c.classList.contains('dragging'));

    // Find where to insert within the target grid
    let insertBeforeCard = null;
    for (const card of targetCards) {
      const box = card.getBoundingClientRect();
      const midY = box.top + box.height / 2;
      const midX = box.left + box.width / 2;
      if (y < midY || (y < midY + box.height / 2 && x < midX)) {
        insertBeforeCard = card;
        break;
      }
    }

    // Move the dragged element into the target grid at the right position
    if (insertBeforeCard) {
      grid.insertBefore(draggedEl, insertBeforeCard);
    } else {
      grid.appendChild(draggedEl);
    }

    // Now collect the combined ordered list from both grids as they currently are in the DOM
    const day1Cards = [...day1Grid.querySelectorAll('.fixture-match-card')];
    const day2Cards = [...day2Grid.querySelectorAll('.fixture-match-card')];

    // Enforce day1 max slots: overflow cards go to day2
    if (day1Cards.length > day1Slots) {
      const overflow = day1Cards.splice(day1Slots);
      overflow.forEach(card => day2Grid.insertBefore(card, day2Grid.firstChild));
    }
    // If day1 has room and day2 has excess, pull cards up
    if (day1Cards.length < day1Slots && day2Cards.length > day1Slots) {
      // No auto-pull — let user explicitly drag
    }

    this._updateFixtureTimes();
  }

  _shouldInsertAfterFixtureCard(card, x, y) {
    const box = card.getBoundingClientRect();
    const isBelowMidpoint = y > box.top + (box.height / 2);
    const isRightOfMidpoint = x > box.left + (box.width / 2);
    return isBelowMidpoint || isRightOfMidpoint;
  }

  _buildFixtureScheduleFromDom() {
    const dayBuckets = ['fixtures-day1-grid', 'fixtures-day2-grid'].map((gridId) => {
      const grid = document.getElementById(gridId);
      if (!grid) return [];

      return [...grid.querySelectorAll('.fixture-match-card')].map((card) => ({
        teamAId: card.dataset.teamA,
        teamBId: card.dataset.teamB,
        group: card.dataset.group || '',
      })).filter((fixture) => fixture.teamAId && fixture.teamBId);
    });

    return dayBuckets.some((bucket) => bucket.length)
      ? this._buildFixtureScheduleFromDays(...dayBuckets)
      : [];
  }

  _persistFixtureScheduleFromDom() {
    const fixtures = this._buildFixtureScheduleFromDom();
    if (fixtures.length) {
      this._applyFixtureSchedule(fixtures, { immediateSync: true });
    }
  }

  _updateFixtureTimes() {
    const matchTimes = ['8:30 – 9:30','9:30 – 10:30','10:30 – 11:30','11:30 – 12:30','12:30 – 1:30','1:30 – 2:30'];
    let globalMatchNum = 1;

    ['fixtures-day1-grid', 'fixtures-day2-grid'].forEach((gridId, dayIdx) => {
      const grid = document.getElementById(gridId);
      if (!grid) return;
      const day = dayIdx === 0 ? '25 April 2026' : '26 April 2026';

      const cards = grid.querySelectorAll('.fixture-match-card[draggable]');
      cards.forEach((card, i) => {
        // Update time
        const infoEl = card.querySelector('.fixture-match-info');
        if (infoEl) {
          infoEl.textContent = `${day} • ${matchTimes[i] || ''}`;
        }
        // Update match number display
        const numEl = card.querySelector('.fixture-match-num');
        if (numEl) {
          numEl.textContent = `Match ${globalMatchNum}`;
        }
        card.dataset.matchNum = globalMatchNum;
        globalMatchNum++;
      });
    });
  }

  handleRecallBid() {
    if (!this.engine || !this.engine.canRecall()) return;

    const state = this.engine.getState();
    const playerName = state.lastSalePlayer;
    const teamName = state.lastSaleTeam;

    // Send recall phase to projector (before engine resets state)
    this._broadcastProjectorPhase('recall', state);

    const player = this.engine.recallLastSale();
    if (player) {
      this.sounds.playNominate();
      this.lastTickSecond = null;

      this.ui.showToast(
        `↩ RECALLED: ${playerName} sale to ${teamName} reversed — re-bidding open!`,
        'warning',
        5000
      );

      this.render();
      this.startTimerTick();
      this.broadcastState();
      this.saveState();
    }
  }

  /** Send a phase-override state only to projector clients (for celebration animations) */
  _broadcastProjectorPhase(phase, engineState) {
    const projState = this._filterStateForProjector(engineState);
    projState.phase = phase;

    // BroadcastChannel (local tabs)
    try {
      if (!this._projectorChannel) {
        this._projectorChannel = new BroadcastChannel('npl-projector');
      }
      this._projectorChannel.postMessage({
        type: 'state-update',
        state: projState
      });
    } catch (e) {}

    // WebSocket (remote projectors only — bypasses mobile clients)
    if (this.wsClient.connected) {
      this.wsClient.sendProjectorEvent({
        type: 'state-update',
        state: projState
      });
    }
  }

  sellPlayer() {
    if (!this.engine || !this.engine.currentBidder) return;

    const state = this.engine.getState();
    const teamName = state.currentBidderTeam?.shortName || 'Unknown';
    const playerName = state.currentPlayer?.name || 'Unknown';
    const price = state.currentBid;

    this.stopTimerTick();
    this.sounds.playSold();

    // Broadcast SOLD state to projector (before engine resets player/bidder)
    this._broadcastProjectorPhase('sold', state);

    // Show overlay animation
    this.ui.showSoldOverlay();
    this.ui.showToast(
      `🎉 SOLD! ${playerName} → ${teamName} for ${AuctionEngine.formatPoints(price)}`,
      'sold',
      4000
    );

    // Commentary: player sold (before engine state changes)
    const bidCount = state.bidHistory.length;
    this.commentary.onSold(
      playerName,
      state.currentPlayer?.role,
      teamName,
      state.currentBidderTeam?.name || teamName,
      price,
      bidCount,
      state.currentBidderTeam,
      null // will send auction state after sell
    );

    // Execute the sale
    this.engine.sellPlayer();

    // Commentary: post-sale analytics with updated state
    const postSaleState = this.engine.getState();
    this.commentary.generateAnalytics(postSaleState);

    this.broadcastState();
    this.saveState();

    // Re-render after a short delay for the animation
    setTimeout(() => this.render(), 1200);
  }

  markUnsold() {
    if (!this.engine || !this.engine.currentPlayer) return;

    const playerName = this.engine.currentPlayer.name;

    this.stopTimerTick();
    this.sounds.playUnsold();

    // Broadcast UNSOLD state to projector (before engine resets player)
    this._broadcastProjectorPhase('unsold', this.engine.getState());

    // Show overlay animation
    this.ui.showUnsoldOverlay();
    this.ui.showToast(`${playerName} went UNSOLD`, 'unsold', 3000);

    // Execute
    this.engine.markUnsold();

    // Commentary: player unsold
    const state = this.engine.getState();
    this.commentary.onUnsold(playerName, '', state);

    this.broadcastState();
    this.saveState();

    // Re-render after animation
    setTimeout(() => this.render(), 1000);
  }

  // ═══════════════════════════════════════════
  // BID TIMER
  // ═══════════════════════════════════════════

  /** Start the timer tick interval (called when auction view renders) */
  startTimerTick() {
    this.stopTimerTick(); // clear any existing
    if (!this.engine || !this.engine.timerEnabled) return;

    this.timerInterval = setInterval(() => {
      if (!this.engine || this.engine.phase !== 'bidding') {
        this.stopTimerTick();
        return;
      }

      const remaining = this.engine.getTimerRemaining();
      if (remaining === null) return;

      // Update timer display
      this.ui.updateTimerDisplay(remaining, this.engine.timerDuration);

      // Tick sound for last 5 seconds
      const sec = Math.ceil(remaining);
      if (sec <= 5 && sec > 0 && sec !== this.lastTickSecond) {
        this.lastTickSecond = sec;
        this.sounds.playTimerTick();
      }

      // Commentary: timer tick at key thresholds
      this.commentary.onTimerTick(
        remaining,
        this.engine.timerDuration,
        this.engine.currentPlayer?.name || 'Player',
        this.engine.currentBidder,
        this.engine.currentBid
      );

      // Timer expired
      if (remaining <= 0) {
        this.stopTimerTick();
        this.sounds.playTimerExpired();

        if (this.engine.currentBidder) {
          // Auto-sell
          this.sellPlayer();
        } else {
          // Auto-unsold
          this.markUnsold();
        }
      }
    }, 100); // update 10 times per second for smooth animation
  }

  /** Stop the timer tick interval */
  stopTimerTick() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /** Bind the timer duration setting on setup page */
  bindTimerSetting() {
    const timerInput = document.getElementById('timer-duration');
    if (timerInput) {
      timerInput.addEventListener('change', (e) => {
        this.timerDuration = parseInt(e.target.value, 10) || 30;
      });
    }
  }

  // ═══════════════════════════════════════════
  // LIVE COMMENTARY MANAGEMENT
  // ═══════════════════════════════════════════

  /** Toggle commentary panel visibility */
  toggleCommentary() {
    this.commentaryVisible = !this.commentaryVisible;
    if (this.commentaryVisible) {
      this.commentary.setSpeechEnabled(true);
      this.ui.renderCommentaryPanel(this.commentary.getLines());
      this.startIdleCommentary();
      this.ui.showToast('🎙️ Commentary enabled', 'info', 1500);
    } else {
      this.commentary.setSpeechEnabled(false);
      this.ui.removeCommentaryPanel();
      this.stopIdleCommentary();
      this.ui.showToast('🎙️ Commentary disabled', 'info', 1500);
    }
    this.render();
  }

  /** Start idle/analytics commentary interval */
  startIdleCommentary() {
    this.stopIdleCommentary();
    if (!this.engine || !this.commentaryVisible) return;

    this.idleCommentaryInterval = setInterval(() => {
      if (!this.engine || this.currentView !== 'auction') {
        this.stopIdleCommentary();
        return;
      }

      const state = this.engine.getState();

      if (state.phase === 'waiting') {
        // Generate idle commentary during waiting phase
        this.commentary.generateIdle(state);
      } else if (state.phase === 'bidding') {
        // Generate analytics insights during bidding
        this.commentary.generateAnalytics(state);
      }
    }, 10000); // Every 10 seconds
  }

  /** Stop idle commentary interval */
  stopIdleCommentary() {
    if (this.idleCommentaryInterval) {
      clearInterval(this.idleCommentaryInterval);
      this.idleCommentaryInterval = null;
    }
  }

  // ═══════════════════════════════════════════
  // BID BUTTON STATE MANAGEMENT
  // ═══════════════════════════════════════════

  updateBidButtonStates() {
    if (!this.engine) return;

    document.querySelectorAll('.team-bid-btn').forEach(btn => {
      const teamId = btn.dataset.teamId;
      const canBid = this.engine.canTeamBid(teamId);
      const isCurrentBidder = this.engine.currentBidder === teamId;
      const teamLabel = btn.dataset.teamLabel || btn.title || btn.textContent.trim();

      btn.disabled = !canBid;
      btn.classList.toggle('current-bidder', isCurrentBidder);
      btn.dataset.teamLabel = teamLabel;
      btn.dataset.bidState = isCurrentBidder ? 'locked' : canBid ? 'ready' : 'disabled';
      btn.setAttribute('aria-disabled', (!canBid).toString());
      btn.title = isCurrentBidder
        ? `${teamLabel} - Highest bidder (locked)`
        : !canBid
          ? `${teamLabel} - Bid unavailable`
          : teamLabel;
    });
  }

  // ═══════════════════════════════════════════
  // POSTER GENERATION
  // ═══════════════════════════════════════════

  async previewTeamPoster(teamId) {
    if (!this.engine) return;
    const state = this.engine.getState();
    const team = state.teams.find(t => t.id === teamId);
    if (!team) return;

    this.ui.showToast('Generating poster...', 'info', 2000);
    const { generateTeamPoster, showPosterPreview } = await this._ensurePosterTools();
    const canvas = await generateTeamPoster(team);
    showPosterPreview(canvas);
  }

  async downloadTeamPoster(teamId) {
    if (!this.engine) return;
    const state = this.engine.getState();
    const team = state.teams.find(t => t.id === teamId);
    if (!team) return;

    this.ui.showToast(`Generating ${team.shortName} poster...`, 'info', 2000);
    const { generateTeamPoster, downloadCanvas } = await this._ensurePosterTools();
    const canvas = await generateTeamPoster(team);
    downloadCanvas(canvas, `NPL3_2026_${team.shortName}_Squad.png`);
    this.ui.showToast(`${team.shortName} poster downloaded!`, 'success');
  }

  async downloadAllPosters() {
    if (!this.engine) return;
    const state = this.engine.getState();
    this.ui.showToast('Generating all team posters...', 'info', 5000);
    const { downloadAllPosters } = await this._ensurePosterTools();
    await downloadAllPosters(state.teams, (i, total) => {
      if (i < total) {
        this.ui.showToast(`Generating poster ${i + 1} of ${total}...`, 'info', 1000);
      } else {
        this.ui.showToast('All posters downloaded!', 'success', 3000);
      }
    });
  }

  // ═══════════════════════════════════════════
  // PREMIUM: Results with Standings & Stats
  // ═══════════════════════════════════════════

  _renderResultsWithPremium() {
    const state = this.engine ? this.engine.getState() : null;
    const opts = {};

    // Compute standings if on standings tab
    if (this.resultsTab === 'standings') {
      const matches = this.scorecardMgr.getAllMatches();
      const groupDivision = state ? state.groupDivision : null;
      const teams = state ? state.teams : [];
      if (groupDivision && teams.length > 0) {
        opts.standings = StandingsEngine.compute(matches, groupDivision, teams);
      }
    }

    // Compute player stats if on stats tab
    if (this.resultsTab === 'stats') {
      const matches = this.scorecardMgr.getAllMatches();
      const teams = state ? state.teams : [];
      const soldPlayers = state ? state.soldPlayers : [];
      opts.playerStats = PlayerCardsEngine.aggregate(matches, teams, soldPlayers);
    }

    // Scorecard opts
    if (this.resultsTab === 'scorecard') {
      opts.matches = this.scorecardMgr.getAllMatches();
      opts.honours = this.scorecardMgr.computeHonours();
      opts.scorecardView = this.scorecardView;
      if (this.scorecardView === 'edit' && this.activeScorecardId) {
        opts.activeMatch = this.scorecardMgr.getMatch(this.activeScorecardId);
      }
    }

    // Fixtures opts — pass knockout match data so UI can show resolved teams
    if (this.resultsTab === 'fixtures') {
      opts.fixtures = state?.groupDivision ? this._getFixtureMatchList(state.groupDivision, state.teams) : [];
      opts.knockoutMatches = [
        this.scorecardMgr.getMatch('match-13'),
        this.scorecardMgr.getMatch('match-14'),
        this.scorecardMgr.getMatch('match-15'),
        this.scorecardMgr.getMatch('match-16'),
      ].filter(Boolean);
    }

    // Inject fixtures lock state
    if (state) state.fixturesLocked = this.fixturesLocked;

    this.ui.renderResults(state, this.resultsTab, opts);

    // Rebind fixtures drag-drop if needed
    if (this.resultsTab === 'fixtures') {
      setTimeout(() => this.initFixtureDragDrop(), 100);
    }
  }

  // ═══════════════════════════════════════════
  // PREMIUM: Live Match
  // ═══════════════════════════════════════════

  _renderLiveMatchView() {
    if (this.liveMatchEngine) {
      this.ui.renderLiveMatch(this.liveMatchEngine.getState());
    } else {
      // Ensure all fixture matches exist in scorecard
      this._ensureAllFixtureMatches();
      const matches = this.scorecardMgr.getAllMatches();
      this.ui.renderLiveMatch(null, matches);
    }
  }

  _ensureAllFixtureMatches() {
    if (!this.engine) return;
    const state = this.engine.getState();
    const gd = state.groupDivision;
    if (!gd) return;
    const fixtures = this._getFixtureMatchList(gd, state.teams);
    this._syncFixtureMatchesToSchedule(fixtures, state.teams);

    // Also add knockout matches (match-13 through match-16) — always TBD until league is done
    const knockoutSlots = [
      { id: 'match-13', label: 'Qualifier 1', desc: 'A1 vs B1', time: '12:30 – 1:30' },
      { id: 'match-14', label: 'Eliminator', desc: 'A2 vs B2', time: '1:30 – 2:30' },
      { id: 'match-15', label: 'Qualifier 2', desc: 'Loser Q1 vs Winner Elim', time: '2:30 – 3:30' },
      { id: 'match-16', label: 'Final', desc: 'Winner Q1 vs Winner Q2', time: '3:30 – 4:30' },
    ];

    // TBD placeholder team
    const tbdTeam = { id: 'tbd', name: 'TBD', shortName: 'TBD', color: '#666', textColor: '#fff', logo: '', squad: [] };

    // Only create TBD knockout entries — teams are resolved via "Create Knockout" button
    knockoutSlots.forEach(ko => {
      if (!this.scorecardMgr.getMatch(ko.id)) {
        this.scorecardMgr.createMatch(ko.id, tbdTeam, tbdTeam, {
          venue: 'Nakre Ground', date: '26 April 2026', time: ko.time
        });
      }
    });
  }

  async _handleLiveMatchClick(target) {
    // Create Knockout Matches from standings
    if (target.id === 'create-knockout-btn' || target.closest('#create-knockout-btn')) {
      if (!this.engine) return true;
      const state = this.engine.getState();
      const gd = state.groupDivision;
      if (!gd) { this.ui.showToast('\u26A0\uFE0F Draw tokens first!', 'warning'); return true; }

      try {
        const allMatches = this.scorecardMgr.getAllMatches();
        const leagueCompleted = allMatches.filter(m => {
          const num = parseInt(m.matchId.replace('match-',''));
          return num <= 12 && m.status === 'completed';
        }).length;
        if (leagueCompleted < 12) {
          this.ui.showToast(`\u26A0\uFE0F Complete all league matches first! (${leagueCompleted}/12 done)`, 'warning');
          return true;
        }

        const standings = StandingsEngine.compute(allMatches, gd, state.teams);
        if (!standings || !standings.groupA || !standings.groupB || standings.groupA.length < 2 || standings.groupB.length < 2) {
          this.ui.showToast('\u26A0\uFE0F Unable to compute standings.', 'warning');
          return true;
        }

        const gA = standings.groupA, gB = standings.groupB;
        const getTeam = (t) => state.teams.find(tt => tt.id === (t.id || t)) || t;
        const tbdTeam = { id: 'tbd', name: 'TBD', shortName: 'TBD', color: '#666', textColor: '#fff', logo: '', squad: [] };

        // Q1: A1 vs B1
        this._resolveKnockoutSlot('match-13', getTeam(gA[0].team), getTeam(gB[0].team));
        // Eliminator: A2 vs B2
        this._resolveKnockoutSlot('match-14', getTeam(gA[1].team), getTeam(gB[1].team));
        // Q2 and Final: TBD initially (will auto-fill as matches complete)
        this._resolveKnockoutSlot('match-15', tbdTeam, tbdTeam);
        this._resolveKnockoutSlot('match-16', tbdTeam, tbdTeam);

        this.saveState();
        this.ui.showToast(`\uD83C\uDFC6 Knockout matches created! Q1: ${gA[0].team.shortName || gA[0].team.name} vs ${gB[0].team.shortName || gB[0].team.name}`, 'success');
        this._renderLiveMatchView();
      } catch(e) {
        this.ui.showToast('\u26A0\uFE0F Error computing standings: ' + e.message, 'error');
      }
      return true;
    }

    // Select a match to score
    const matchCard = target.closest('[data-live-match]');
    if (matchCard) {
      const matchId = matchCard.dataset.liveMatch;
      const match = this.scorecardMgr.getMatch(matchId);
      if (match) {
        const LiveMatchEngine = await this._ensureLiveMatchEngineClass();
        const saved = localStorage.getItem('npl_live_match_' + matchId);
        if (saved) {
          try { this.liveMatchEngine = LiveMatchEngine.restore(JSON.parse(saved)); }
          catch(e) { await this._createLiveEngine(match); }
        } else {
          await this._createLiveEngine(match);
        }
        this._renderLiveMatchView();
      }
      return true;
    }

    // Setup: Start Match (toss)
    if (target.id === 'lm-start-toss-btn') {
      const winner = document.getElementById('lm-toss-winner')?.value;
      const decision = document.getElementById('lm-toss-decision')?.value;
      const overs = parseInt(document.getElementById('lm-overs-select')?.value) || 5;
      if (!winner || !decision) { this.ui.showToast('Select toss winner and decision', 'warning'); return true; }
      this.liveMatchEngine.setOversLimit(overs);
      this.liveMatchEngine.setToss(winner, decision);
      this._saveLiveMatch();
      this._renderLiveMatchView();
      return true;
    }

    // Batting select: Confirm openers
    if (target.id === 'lm-confirm-openers-btn') {
      const striker = document.getElementById('lm-striker')?.value;
      const nonStriker = document.getElementById('lm-non-striker')?.value;
      const bowler = document.getElementById('lm-bowler')?.value;
      if (!striker || !nonStriker || !bowler) { this.ui.showToast('Select all three players', 'warning'); return true; }
      if (striker === nonStriker) { this.ui.showToast('Striker and non-striker must be different', 'warning'); return true; }
      this.liveMatchEngine.setOpeners(striker, nonStriker, bowler);
      this._saveLiveMatch();
      this._renderLiveMatchView();
      return true;
    }

    // New batsman selection
    const newBat = target.closest('[data-lm-new-batsman]');
    if (newBat && this.liveMatchEngine) {
      this.liveMatchEngine.selectNewBatsman(newBat.dataset.lmNewBatsman);
      this._saveLiveMatch();
      this._closeModal();
      this._renderLiveMatchView();
      return true;
    }

    // Next bowler selection
    const nextBowl = target.closest('[data-lm-next-bowler]');
    if (nextBowl && this.liveMatchEngine) {
      this.liveMatchEngine.selectNextBowler(nextBowl.dataset.lmNextBowler);
      this._saveLiveMatch();
      this._closeModal();
      this._renderLiveMatchView();
      return true;
    }

    // Coin flip winner
    const coinFlip = target.closest('[data-lm-coin-flip]');
    if (coinFlip && this.liveMatchEngine) {
      this.liveMatchEngine.setCoinFlipWinner(coinFlip.dataset.lmCoinFlip);
      this._saveLiveMatch();
      this._syncLiveToScorecard();
      this._renderLiveMatchView();
      return true;
    }

    // Sub-menu toggles
    if (target.id === 'lm-wd-toggle') { this._toggleSubmenu('lm-wd-menu'); return true; }
    if (target.id === 'lm-nb-toggle') { this._toggleSubmenu('lm-nb-menu'); return true; }
    if (target.id === 'lm-bye-toggle') { this._toggleSubmenu('lm-bye-menu'); return true; }
    if (target.id === 'lm-lb-toggle') { this._toggleSubmenu('lm-lb-menu'); return true; }

    // Sub-menu ball buttons
    const subBtn = target.closest('.lm-sub-btn');
    if (subBtn && this.liveMatchEngine) {
      const type = subBtn.dataset.ball;
      if (type === 'WD+RO' || type === 'NB+RO') {
        this._showRunOutModal(type);
      } else {
        this.liveMatchEngine.recordBall(type);
        this._afterBallRecorded();
      }
      return true;
    }

    // Ball scoring (main buttons)
    const ballBtn = target.closest('[data-ball]');
    if (ballBtn && this.liveMatchEngine && !ballBtn.classList.contains('lm-sub-btn')) {
      const type = ballBtn.dataset.ball;
      if (type === 'W') {
        this._showDismissalModal();
      } else {
        this.liveMatchEngine.recordBall(type);
        this._afterBallRecorded();
      }
      return true;
    }

    // Undo
    if (target.id === 'live-undo-btn' && this.liveMatchEngine) {
      this.liveMatchEngine.undoLastBall();
      this._saveLiveMatch();
      this._syncLiveToScorecard();
      this._renderLiveMatchView();
      return true;
    }

    // Manual swap strike in live scoring
    if (target.id === 'lm-swap-strike-btn' && this.liveMatchEngine) {
      // Push snapshot for undo support
      this.liveMatchEngine.undoStack.push(this.liveMatchEngine._snapshot());
      if (this.liveMatchEngine.undoStack.length > 50) this.liveMatchEngine.undoStack.shift();
      this.liveMatchEngine._swapStrike();
      this._saveLiveMatch();
      this._renderLiveMatchView();
      // Play strike change sound and show animation
      this.sounds.playStrikeChange();
      this._showStrikeChangedToast();
      return true;
    }

    // Save to scorecard
    if (target.id === 'live-save-scorecard-btn' && this.liveMatchEngine) {
      // Capture Player of the Match from input if present
      const potmInput = document.getElementById('lm-potm-input');
      if (potmInput && potmInput.value.trim()) {
        this.liveMatchEngine.playerOfMatch = potmInput.value.trim();
        this._saveLiveMatch();
      }
      this._showSaveConfirmModal('Save to Scorecard');
      return true;
    }

    // Back to match list
    if (target.id === 'live-back-btn' || target.closest('#live-back-btn')) {
      this.liveMatchEngine = null;
      this._renderLiveMatchView();
      return true;
    }

    // Dismissal modal clicks
    const dismissBtn = target.closest('[data-lm-dismissal]');
    if (dismissBtn && this.liveMatchEngine) {
      const dtype = dismissBtn.dataset.lmDismissal;
      if (dtype === 'run out') {
        this._closeModal();
        this._showRunOutModal('W');
      } else {
        this.liveMatchEngine.recordBall('W', { dismissalType: dtype, whoOut: 'striker' });
        this._closeModal();
        this._afterBallRecorded();
      }
      return true;
    }

    // Run out: swap strike button
    if (target.id === 'ro-swap-strike-btn') {
      this._handleRunOutSwap();
      return true;
    }

    // Run out: runs completed chip selection
    const roChip = target.closest('[data-ro-runs]');
    if (roChip) {
      this._pendingRunOutRuns = parseInt(roChip.dataset.roRuns) || 0;
      // Update active state on chips
      roChip.closest('.ro-runs-chips')?.querySelectorAll('.ro-chip').forEach(c => c.classList.remove('active'));
      roChip.classList.add('active');
      return true;
    }

    // Run out: who was out
    const roBtn = target.closest('[data-lm-runout]');
    if (roBtn && this.liveMatchEngine) {
      const whoOut = roBtn.dataset.lmRunout;
      const pendingType = this._pendingRunOutType || 'W';
      const runsCompleted = this._pendingRunOutRuns || 0;
      const manualStrikeSwap = this._runOutSwapped || false;
      if (pendingType === 'W') {
        this.liveMatchEngine.recordBall('W', { dismissalType: 'run out', whoOut, runsCompleted, manualStrikeSwap });
      } else {
        this.liveMatchEngine.recordBall(pendingType, { whoOut, runsCompleted, manualStrikeSwap });
      }
      this._pendingRunOutType = null;
      this._pendingRunOutRuns = 0;
      this._runOutSwapped = false;
      this._closeModal();
      this._afterBallRecorded();
      return true;
    }

    // ── Save confirmation modal buttons ──
    if (target.id === 'lm-save-yes-btn') {
      // Capture Player of the Match from input if present
      const potmEl = document.getElementById('lm-potm-input');
      if (potmEl && potmEl.value.trim() && this.liveMatchEngine) {
        this.liveMatchEngine.playerOfMatch = potmEl.value.trim();
        this._saveLiveMatch();
      }
      this._closeModal();
      this._syncLiveToScorecard();
      this.ui.showToast('✅ Saved to scorecard!', 'success');
      return true;
    }
    if (target.id === 'lm-save-no-btn' || target.id === 'lm-save-dismiss-btn') {
      this._closeModal();
      return true;
    }
    if (target.id === 'lm-edit-score-btn') {
      this._closeModal();
      if (this.liveMatchEngine) {
        this.liveMatchEngine.undoLastBall();
        this._saveLiveMatch();
        this._renderLiveMatchView();
        this.ui.showToast('↩ Undone — edit your score', 'info');
      }
      return true;
    }

    // ── Edit Score button on result/innings-break screen ──
    if (target.id === 'live-edit-score-btn') {
      if (this.liveMatchEngine) {
        this.liveMatchEngine.undoLastBall();
        this._saveLiveMatch();
        this._renderLiveMatchView();
        this.ui.showToast('↩ Undone — you can now correct the score', 'info');
      }
      return true;
    }

    return false;
  }

  async _createLiveEngine(match) {
    // Build squad arrays from auction state
    const teamASquad = this._getTeamSquad(match.teamAId);
    const teamBSquad = this._getTeamSquad(match.teamBId);
    const LiveMatchEngine = await this._ensureLiveMatchEngineClass();
    this.liveMatchEngine = new LiveMatchEngine({
      ...match,
      teamASquad, teamBSquad,
      matchType: 'group'
    });
  }

  _getTeamSquad(teamId) {
    if (!this.engine) return [];
    const team = this.engine.getTeamState(teamId);
    if (!team) return [];
    const squad = [];
    // Owner + icon + auctioned players
    if (team.owner) squad.push({ name: team.owner, role: 'All-Rounder' });
    if (team.iconPlayer) squad.push({ name: team.iconPlayer, role: 'All-Rounder' });
    (team.squad || []).forEach(s => squad.push({ name: s.player?.name || s.name, role: s.player?.role || 'All-Rounder' }));
    return squad;
  }

  _afterBallRecorded() {
    this._saveLiveMatch();
    this._syncLiveToScorecard();
    // Check if match just ended or innings just ended — show save prompt
    const st = this.liveMatchEngine.getState();
    if (st.phase === 'result' || st.phase === 'innings-break') {
      this._renderLiveMatchView();
      this._showSaveConfirmModal(st.phase === 'result' ? 'Match Complete!' : 'Innings Complete!');
    } else {
      this._renderLiveMatchView();
    }
  }

  _saveLiveMatch() {
    if (this.liveMatchEngine) {
      localStorage.setItem('npl_live_match_' + this.liveMatchEngine.matchId, JSON.stringify(this.liveMatchEngine.serialize()));
    }
  }

  _syncLiveToScorecard() {
    if (this.liveMatchEngine) {
      // Auto-compute POTM if match is complete but POTM wasn't set
      if (this.liveMatchEngine.isComplete && !this.liveMatchEngine.playerOfMatch) {
        this.liveMatchEngine._autoPickPOTM();
        this._saveLiveMatch();
      }
      this.liveMatchEngine.syncToScorecard(this.scorecardMgr);
      this.saveState();

      // Auto-create knockout matches when all league matches are done
      if (this.liveMatchEngine.isComplete) {
        this._autoCreateKnockoutIfReady();
        // Progress knockout bracket when a knockout match completes
        this._progressKnockoutBracket(this.liveMatchEngine.matchId);
      }
    }
  }

  /**
   * Auto-create knockout matches from standings when all 12 league matches are completed.
   */
  _autoCreateKnockoutIfReady() {
    if (!this.engine) return;
    const state = this.engine.getState();
    const gd = state.groupDivision;
    if (!gd) return;

    const allMatches = this.scorecardMgr.getAllMatches();
    const leagueCompleted = allMatches.filter(m => {
      const num = parseInt(m.matchId.replace('match-',''));
      return num <= 12 && m.status === 'completed';
    }).length;

    if (leagueCompleted < 12) return;

    // Check if knockouts already have real teams (not TBD)
    const q1 = this.scorecardMgr.getMatch('match-13');
    if (q1 && q1.teamAShort !== 'TBD') return; // Already created

    try {
      const standings = StandingsEngine.compute(allMatches, gd, state.teams);
      if (!standings || !standings.groupA || !standings.groupB ||
          standings.groupA.length < 2 || standings.groupB.length < 2) return;

      const gA = standings.groupA, gB = standings.groupB;
      const getTeam = (t) => state.teams.find(tt => tt.id === (t.teamId || t.id || t)) || t;
      const tbdTeam = { id: 'tbd', name: 'TBD', shortName: 'TBD', color: '#666', textColor: '#fff', logo: '', squad: [] };

      // Q1: A1 vs B1
      this._resolveKnockoutSlot('match-13', getTeam(gA[0]), getTeam(gB[0]));
      // Eliminator: A2 vs B2
      this._resolveKnockoutSlot('match-14', getTeam(gA[1]), getTeam(gB[1]));
      // Q2 and Final: TBD initially
      this._resolveKnockoutSlot('match-15', tbdTeam, tbdTeam);
      this._resolveKnockoutSlot('match-16', tbdTeam, tbdTeam);

      this.saveState();
      this.ui.showToast(`\uD83C\uDFC6 Knockout matches auto-created! Q1: ${gA[0].team?.shortName || gA[0].teamId} vs ${gB[0].team?.shortName || gB[0].teamId}`, 'success', 5000);
    } catch(e) {
      console.error('Auto-knockout creation failed:', e);
    }
  }

  /**
   * IPL-style knockout bracket progression.
   * Called after each knockout match completes to auto-fill the next round.
   *
   * Q1 (match-13):  Winner → Final teamA,   Loser → Q2 teamA
   * Eliminator (match-14): Winner → Q2 teamB
   * Q2 (match-15):  Winner → Final teamB
   */
  _progressKnockoutBracket(completedMatchId) {
    if (!this.engine) return;
    const num = parseInt(completedMatchId.replace('match-',''));
    if (num < 13 || num > 16) return; // Not a knockout match

    const match = this.scorecardMgr.getMatch(completedMatchId);
    if (!match || match.status !== 'completed') return;

    const winnerId = match.result?.winner;
    if (!winnerId) return;

    const state = this.engine.getState();
    const getFullTeam = (id) => state.teams.find(t => t.id === id);
    const loserId = winnerId === match.teamAId ? match.teamBId : match.teamAId;
    const winnerTeam = getFullTeam(winnerId);
    const loserTeam = getFullTeam(loserId);

    if (!winnerTeam) return;

    const tbdTeam = { id: 'tbd', name: 'TBD', shortName: 'TBD', color: '#666', textColor: '#fff', logo: '', squad: [] };

    try {
      if (num === 13) {
        // Qualifier 1 complete: Winner → Final (teamA), Loser → Q2 (teamA)
        const q2 = this.scorecardMgr.getMatch('match-15');
        const final_ = this.scorecardMgr.getMatch('match-16');

        // Q2: teamA = Q1 loser, teamB = keep existing (Eliminator winner) or TBD
        const q2TeamB = (q2 && q2.teamBShort !== 'TBD') ? getFullTeam(q2.teamBId) || tbdTeam : tbdTeam;
        if (!q2 || q2.status === 'upcoming') {
          this._resolveKnockoutSlot('match-15', loserTeam, q2TeamB);
        }

        // Final: teamA = Q1 winner, teamB = keep existing (Q2 winner) or TBD
        const finalTeamB = (final_ && final_.teamBShort !== 'TBD') ? getFullTeam(final_.teamBId) || tbdTeam : tbdTeam;
        if (!final_ || final_.status === 'upcoming') {
          this._resolveKnockoutSlot('match-16', winnerTeam, finalTeamB);
        }

        this.saveState();
        this.ui.showToast(`\uD83C\uDFC6 Q1 done! ${winnerTeam.shortName} → Final, ${loserTeam.shortName} → Q2`, 'success', 5000);

      } else if (num === 14) {
        // Eliminator complete: Winner → Q2 (teamB)
        const q2 = this.scorecardMgr.getMatch('match-15');

        // Q2: teamA = keep existing (Q1 loser) or TBD, teamB = Eliminator winner
        const q2TeamA = (q2 && q2.teamAShort !== 'TBD') ? getFullTeam(q2.teamAId) || tbdTeam : tbdTeam;
        if (!q2 || q2.status === 'upcoming') {
          this._resolveKnockoutSlot('match-15', q2TeamA, winnerTeam);
        }

        this.saveState();
        this.ui.showToast(`\uD83D\uDD25 Eliminator done! ${winnerTeam.shortName} → Q2, ${loserTeam.shortName} eliminated`, 'success', 5000);

      } else if (num === 15) {
        // Qualifier 2 complete: Winner → Final (teamB)
        const final_ = this.scorecardMgr.getMatch('match-16');

        // Final: teamA = keep existing (Q1 winner), teamB = Q2 winner
        const finalTeamA = (final_ && final_.teamAShort !== 'TBD') ? getFullTeam(final_.teamAId) || tbdTeam : tbdTeam;
        if (!final_ || final_.status === 'upcoming') {
          this._resolveKnockoutSlot('match-16', finalTeamA, winnerTeam);
        }

        this.saveState();
        this.ui.showToast(`\uD83D\uDD25 Q2 done! ${winnerTeam.shortName} → Final, ${loserTeam.shortName} eliminated`, 'success', 5000);
      }
    } catch(e) {
      console.error('Knockout bracket progression failed:', e);
    }
  }

  /**
   * Helper: Create or re-create a knockout match slot with resolved teams.
   * Preserves squad data by looking up full team info from auction state.
   */
  _resolveKnockoutSlot(matchId, teamA, teamB) {
    const timeMap = { 'match-13': '2:30 \u2013 3:30', 'match-14': '3:30 \u2013 4:30', 'match-15': '4:30 \u2013 5:30', 'match-16': '5:30 \u2013 6:30' };

    // Build full team objects with squads
    const buildTeam = (t) => {
      if (!t || t.id === 'tbd') return { id: 'tbd', name: 'TBD', shortName: 'TBD', color: '#666', textColor: '#fff', logo: '', squad: [] };
      const squad = this._getTeamSquad(t.id);
      return { ...t, squad };
    };

    // Remove existing match
    if (this.scorecardMgr.getMatch(matchId)) {
      this.scorecardMgr.matches.delete(matchId);
    }

    this.scorecardMgr.createMatch(matchId, buildTeam(teamA), buildTeam(teamB), {
      venue: 'Nakre Ground', date: '26 April 2026', time: timeMap[matchId] || ''
    });
  }

  _toggleSubmenu(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    // Close all other submenus first
    document.querySelectorAll('.lm-submenu').forEach(m => { if (m.id !== menuId) m.style.display = 'none'; });
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
  }

  _showDismissalModal() {
    const isFH = this.liveMatchEngine?.isFreeHit;
    const dismissals = isFH
      ? [{ type: 'run out', label: 'Run Out' }]
      : [
          { type: 'bowled', label: 'Bowled' },
          { type: 'caught', label: 'Caught' },
          { type: 'lbw', label: 'LBW' },
          { type: 'stumped', label: 'Stumped' },
          { type: 'hit wicket', label: 'Hit Wicket' },
          { type: 'run out', label: 'Run Out' },
        ];
    const modal = document.createElement('div');
    modal.className = 'lm-modal-overlay';
    modal.id = 'lm-dismissal-modal';
    modal.innerHTML = `<div class="lm-modal"><h3>🏏 Dismissal Type${isFH?' (Free Hit)':''}</h3><button class="lm-modal-close" id="lm-modal-close-btn">&times;</button><div class="lm-modal-list">${dismissals.map(d => `<button class="lm-modal-option" data-lm-dismissal="${d.type}">${d.label}</button>`).join('')}</div><button class="btn btn-ghost btn-sm lm-modal-cancel" id="lm-modal-close-btn" style="margin-top:12px;width:100%;">Cancel</button></div>`;
    document.getElementById('app').appendChild(modal);
  }

  _showRunOutModal(pendingType) {
    this._pendingRunOutType = pendingType;
    this._pendingRunOutRuns = 0;
    this._runOutSwapped = false;
    // Get actual player names from live engine
    let strikerName = 'Striker';
    let nonStrikerName = 'Non-Striker';
    if (this.liveMatchEngine) {
      const lms = this.liveMatchEngine.getState();
      strikerName = lms.striker?.name || 'Striker';
      nonStrikerName = lms.nonStriker?.name || 'Non-Striker';
    }
    this._roStrikerName = strikerName;
    this._roNonStrikerName = nonStrikerName;
    const modal = document.createElement('div');
    modal.className = 'lm-modal-overlay';
    modal.id = 'lm-dismissal-modal';
    modal.innerHTML = `<div class="lm-modal">
      <h3>🏃 Run Out</h3>
      <button class="lm-modal-close" id="lm-modal-close-btn">&times;</button>
      <div class="ro-section">
        <div class="ro-section-label">Runs Completed Before Run Out</div>
        <div class="ro-runs-chips">
          <button class="ro-chip active" data-ro-runs="0">0</button>
          <button class="ro-chip" data-ro-runs="1">1</button>
          <button class="ro-chip" data-ro-runs="2">2</button>
          <button class="ro-chip" data-ro-runs="3">3</button>
          <button class="ro-chip" data-ro-runs="4">4</button>
          <button class="ro-chip" data-ro-runs="5">5</button>
          <button class="ro-chip" data-ro-runs="6">6</button>
        </div>
      </div>
      <div class="ro-section">
        <button class="btn btn-ghost btn-sm ro-swap-btn" id="ro-swap-strike-btn" style="width:100%;margin-bottom:12px;border-color:rgba(99,102,241,0.3);color:var(--accent-indigo);">🔄 Swap Strike</button>
        <div class="ro-section-label">Who was Run Out?</div>
        <div class="lm-modal-list" id="ro-player-list">
          <button class="lm-modal-option" data-lm-runout="striker">
            <span style="font-size:0.7rem;color:var(--text-4);display:block;margin-bottom:2px;">STRIKER</span>${strikerName}
          </button>
          <button class="lm-modal-option" data-lm-runout="nonStriker">
            <span style="font-size:0.7rem;color:var(--text-4);display:block;margin-bottom:2px;">NON-STRIKER</span>${nonStrikerName}
          </button>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm lm-modal-cancel" id="lm-modal-close-btn" style="margin-top:12px;width:100%;">Cancel</button>
    </div>`;
    document.getElementById('app').appendChild(modal);
  }

  _handleRunOutSwap() {
    this._runOutSwapped = !this._runOutSwapped;
    const list = document.getElementById('ro-player-list');
    if (!list) return;
    // Determine displayed names based on swap state
    const topName = this._runOutSwapped ? this._roNonStrikerName : this._roStrikerName;
    const bottomName = this._runOutSwapped ? this._roStrikerName : this._roNonStrikerName;
    // Always use 'striker' for top and 'nonStriker' for bottom since engine also applies swap
    list.innerHTML = `
      <button class="lm-modal-option" data-lm-runout="striker">
        <span style="font-size:0.7rem;color:var(--text-4);display:block;margin-bottom:2px;">STRIKER</span>${topName}
      </button>
      <button class="lm-modal-option" data-lm-runout="nonStriker">
        <span style="font-size:0.7rem;color:var(--text-4);display:block;margin-bottom:2px;">NON-STRIKER</span>${bottomName}
      </button>`;
    // Update swap button style
    const btn = document.getElementById('ro-swap-strike-btn');
    if (btn) {
      btn.style.borderColor = this._runOutSwapped ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.3)';
      btn.style.color = this._runOutSwapped ? 'var(--accent-gold)' : 'var(--accent-indigo)';
      btn.textContent = this._runOutSwapped ? '⚡ Strike Swapped' : '🔄 Swap Strike';
    }
    // Play sound and show "Strike Changed" animation
    this.sounds.playStrikeChange();
    this._showStrikeChangedToast();
  }

  _showStrikeChangedToast() {
    const toast = document.getElementById('strike-changed-toast');
    if (toast) {
      // Reset animation
      toast.classList.remove('active');
      void toast.offsetWidth; // force reflow
      toast.classList.add('active');
      // Auto-remove after animation
      setTimeout(() => toast.classList.remove('active'), 1800);
    }
  }

  _closeModal() {
    const ids = ['lm-dismissal-modal', 'lm-save-confirm-modal', 'lm-batsman-modal', 'lm-bowler-modal', 'share-app-modal'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
  }

  _showShareModal() {
    const existing = document.getElementById('share-app-modal');
    if (existing) existing.remove();

    const appUrl = 'https://deerajnayak1010-star.github.io/auction-app/';

    const waMsg = `🏏 *NAKRE PREMIER LEAGUE 3.0* 🏏
━━━━━━━━━━━━━━━━━━━━━━

🎯 *The Ultimate Village Cricket Tournament Platform*

⚡ *Features:*
🏷️ Live IPL-Style Player Auction
📊 Ball-by-Ball Live Scoring
🏆 Auto Points Table & Standings
📅 Smart Fixture Scheduling
🎖️ Awards Ceremony
📸 Photo Gallery
🎙️ Live Commentary Engine
📽️ Audience Projector Mode

👥 *8 Teams | 90+ Players | 1 Epic Tournament*

🔧 Built with: HTML, CSS, JavaScript
💻 Fully offline — runs on any browser!

🔗 Try it now: ${appUrl}

#NPL3 #CricketApp #VillageCricket`;

    const igMsg = `🏏 Just built something epic! 🚀

Introducing NPL 3.0 — a full-stack cricket tournament management suite for our village league!

✨ What it does:
• Live IPL-style auction with bid timer & commentary
• Ball-by-ball live match scoring with run-out handling
• Auto-generated standings, stats & player cards
• Smart fixture scheduling with drag-and-drop
• Awards ceremony with cinematic reveal animations
• Audience projector mode for live event broadcasting
• HD team poster generation for social media

Built entirely with vanilla HTML/CSS/JS — no frameworks needed! 💪

8 teams. 90+ players. 1 complete platform.

🔗 Link in bio: ${appUrl}

#NPL #CricketApp #WebDevelopment #JavaScript #VillageCricket #SportsApp #BuildInPublic #WebDev #CodingProject #IndianCricket #Cricket #TournamentApp #FullStack #FrontendDev #OpenSource`;

    const modal = document.createElement('div');
    modal.className = 'lm-modal-overlay';
    modal.id = 'share-app-modal';
    modal.innerHTML = `<div class="lm-modal" style="max-width:520px;max-height:85vh;overflow-y:auto;">
      <h3 style="text-align:center;margin-bottom:4px;">📱 Share NPL 3.0</h3>
      <p style="text-align:center;font-size:0.75rem;color:var(--text-3);margin-bottom:16px;">Copy a ready-made message for social media</p>
      <button class="lm-modal-close" id="share-modal-close">&times;</button>
      <div class="share-tabs">
        <button class="share-tab active" id="share-tab-wa">💬 WhatsApp</button>
        <button class="share-tab" id="share-tab-ig">📷 Instagram</button>
      </div>
      <div class="share-content active" id="share-wa-content">
        <textarea class="share-textarea" id="share-wa-text" readonly>${waMsg}</textarea>
        <button class="btn btn-primary btn-sm" id="share-copy-wa-btn" style="width:100%;margin-top:10px;">📋 Copy WhatsApp Message</button>
      </div>
      <div class="share-content" id="share-ig-content">
        <textarea class="share-textarea" id="share-ig-text" readonly>${igMsg}</textarea>
        <button class="btn btn-primary btn-sm" id="share-copy-ig-btn" style="width:100%;margin-top:10px;">📋 Copy Instagram Caption</button>
      </div>
    </div>`;
    document.getElementById('app').appendChild(modal);
  }

  _showSaveConfirmModal(title) {
    // Remove existing if any
    const existing = document.getElementById('lm-save-confirm-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.className = 'lm-modal-overlay';
    modal.id = 'lm-save-confirm-modal';
    modal.innerHTML = `<div class="lm-modal">
      <h3>💾 ${title}</h3>
      <button class="lm-modal-close" id="lm-save-dismiss-btn">&times;</button>
      <p style="color:var(--text-3);margin:12px 0 20px;">Do you want to save to the scorecard?</p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button class="btn btn-primary" id="lm-save-yes-btn">✅ Save Now</button>
        <button class="btn btn-ghost" id="lm-save-no-btn">⏭ Skip</button>
      </div>
      <button class="btn btn-ghost btn-sm" id="lm-edit-score-btn" style="width:100%;margin-top:16px;color:var(--accent-gold);">↩ Undo Last Ball & Edit Score</button>
    </div>`;
    document.getElementById('app').appendChild(modal);
  }

  // ═══════════════════════════════════════════
  // PREMIUM: Gallery
  // ═══════════════════════════════════════════

  _renderGalleryView() {
    const matches = this.scorecardMgr.getAllMatches();
    this.ui.renderGalleryPremium(this.galleryMgr.photos, matches, this.galleryFilter);
    this._bindGalleryEvents();
  }

  _bindGalleryEvents() {
    const zone = document.getElementById('gallery-upload-zone');
    const input = document.getElementById('gallery-file-input');
    if (zone && input) {
      zone.addEventListener('click', () => input.click());
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--accent-indigo)'; });
      zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.style.borderColor = '';
        this._processGalleryFiles(e.dataTransfer.files);
      });
      input.addEventListener('change', (e) => {
        this._processGalleryFiles(e.target.files);
      });
    }
  }

  _processGalleryFiles(files) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.galleryMgr.addPhoto('', e.target.result, file.name, 'Day 1');
        this._saveGallery();
        this._renderGalleryView();
        this.ui.showToast('📷 Photo uploaded!', 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  _saveGallery() {
    try { localStorage.setItem('npl_gallery', JSON.stringify(this.galleryMgr.serialize())); }
    catch(e) { console.warn('Gallery save failed (storage full?):', e); }
  }

  _handleGalleryClick(target) {
    // Filter
    const filterBtn = target.closest('[data-gallery-filter]');
    if (filterBtn) {
      this.galleryFilter = filterBtn.dataset.galleryFilter;
      this._renderGalleryView();
      return true;
    }

    // Delete photo
    const delBtn = target.closest('[data-delete-photo]');
    if (delBtn) {
      this.galleryMgr.removePhoto(parseInt(delBtn.dataset.deletePhoto));
      this._saveGallery();
      this._renderGalleryView();
      this.ui.showToast('Photo removed', 'info');
      return true;
    }

    // Generate social card
    const genBtn = target.closest('[data-generate-card]');
    if (genBtn) {
      const matchId = genBtn.dataset.generateCard;
      const match = this.scorecardMgr.getMatch(matchId);
      if (match) {
        // Find POTM player image from data (players + team owners/icons)
        let potmImage = '';
        if (match.result?.playerOfMatch) {
          const potmName = match.result.playerOfMatch;

          // 1. Check regular players pool (PLAYERS_DATA imported from data.js)
          const potmPlayer = this._getPlayerCatalog().find(p => p.name === potmName);
          if (potmPlayer && potmPlayer.image) {
            potmImage = potmPlayer.image;
          }

          // 2. Check team owners and icon players (TEAMS_DATA imported from data.js)
          if (!potmImage) {
            for (const t of TEAMS_DATA) {
              if (t.owner === potmName && t.ownerImage) {
                potmImage = t.ownerImage;
                break;
              }
              if (t.iconPlayer === potmName && t.iconPlayerImage) {
                potmImage = t.iconPlayerImage;
                break;
              }
            }
          }
        }
        GalleryManager.generateResultCard(match, {}, potmImage).then(canvas => {
          const link = document.createElement('a');
          link.download = `NPL3_Match_${matchId.replace('match-','')}_Result.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          this.ui.showToast('📥 Match result card downloaded!', 'success');
        });
      }
      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════
  // PREMIUM: Awards Ceremony
  // ═══════════════════════════════════════════

  async _renderAwardsView() {
    const requestedView = this.currentView;
    if (this.awardsData.length === 0) {
      const matches = this.scorecardMgr.getAllMatches();
      const teams = this.engine ? this.engine.getState().teams : [];
      const soldPlayers = this.engine ? this.engine.getState().soldPlayers : [];
      const AwardsEngine = await this._ensureAwardsEngine();
      if (requestedView !== this.currentView) return;
      this.awardsData = AwardsEngine.computeAwards(matches, teams, soldPlayers);
    }
    if (requestedView !== this.currentView) return;
    this.ui.renderAwardsPremium(this.awardsData, this.awardsRevealedCount);
    this.ui.enhanceRenderedMedia('awards');
    this.ui.animateViewEntrance();
  }

  _handleAwardsClick(target) {
    if (target.id === 'awards-reveal-next-btn' || target.closest('#awards-reveal-next-btn')) {
      if (this.awardsRevealedCount < this.awardsData.length) {
        this.awardsRevealedCount++;
        this._renderAwardsView();
        this.sounds.play('sold');
      }
      return true;
    }

    if (target.id === 'awards-reset-btn' || target.closest('#awards-reset-btn')) {
      this.awardsRevealedCount = 0;
      this._renderAwardsView();
      return true;
    }

    if (target.id === 'awards-back-btn' || target.closest('#awards-back-btn')) {
      this.navigate('results');
      return true;
    }

    return false;
  }
}

// ── Bootstrap ───────────────────────────────
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
