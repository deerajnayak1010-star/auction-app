// ─────────────────────────────────────────────
// app.js — Main Controller, Routing & Events
// ─────────────────────────────────────────────

import { TEAMS_DATA, PLAYERS_DATA } from './data.js';
import { AuctionEngine } from './auction.js';
import { UI } from './ui.js';
import { generateTeamPoster, downloadCanvas, downloadAllPosters, showPosterPreview } from './poster.js';
import { WSClient } from './ws-client.js';
import { AuctionSounds } from './sounds.js';
import { CommentaryEngine } from './commentary.js';
import { ScorecardManager } from './scorecard.js';
import { StandingsEngine } from './standings.js';
import { PlayerCardsEngine } from './player-cards.js';
import { LiveMatchEngine } from './live-match.js';
import { GalleryManager } from './gallery.js';
import { AwardsEngine } from './awards.js';

class App {
  constructor() {
    this.ui = new UI();
    this.engine = null;
    this.selectedTeamIds = new Set();
    this.selectedPlayerIds = new Set();
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
  }

  async init() {
    // Listen to hash changes for routing
    window.addEventListener('hashchange', () => this.onHashChange());

    // Delegate all click events from #app
    document.getElementById('app').addEventListener('click', (e) => this.onClick(e));

    // Close hamburger menu and More dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('hamburger-dropdown');
      if (dd && dd.style.display !== 'none') {
        const menu = e.target.closest('.hamburger-menu');
        if (!menu) dd.style.display = 'none';
      }
      const moreDd = document.getElementById('nav-more-dropdown');
      if (moreDd && moreDd.style.display !== 'none') {
        const moreMenu = e.target.closest('.nav-more-menu');
        if (!moreMenu) moreDd.style.display = 'none';
      }
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

  // ═══════════════════════════════════════════
  // WEBSOCKET
  // ═══════════════════════════════════════════

  initWebSocket() {
    this.wsClient.connect();

    this.wsClient.on('connected', () => {
      console.log('[App] WebSocket connected');
    });

    this.wsClient.on('session-created', (msg) => {
      this.mobileSessionUrl = msg.url;
      this.showQRModal = true;
      this.ui.showQRModal(msg.url, msg.ip, msg.token);
      this.ui.showToast('📱 Mobile bidding session created!', 'success');
    });

    this.wsClient.on('mobile-connected', (msg) => {
      this.ui.showToast(`📱 ${msg.teamShortName} connected via mobile`, 'info');
      this.render();
    });

    this.wsClient.on('mobile-disconnected', (msg) => {
      this.ui.showToast(`📱 ${msg.teamShortName} disconnected`, 'warning');
      this.render();
    });

    this.wsClient.on('mobile-bid', (msg) => {
      this.handleMobileBid(msg);
    });
  }

  /** Broadcast current auction state to all mobile clients + projector tabs */
  broadcastState() {
    if (!this.engine) return;
    const state = this.engine.getState();

    // WebSocket broadcast (when server is running)
    if (this.wsClient.connected) {
      this.wsClient.broadcastState(state);
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
      if (team && team.squad.length >= 12) error = 'Squad is full';
      else if (this.engine.currentBidder === msg.teamId) error = 'Already highest bidder';
      else error = 'Insufficient budget';
      this.wsClient.sendBidResult(msg.teamId, false, error);
      return;
    }

    const result = this.engine.placeBid(msg.teamId);
    if (result.success) {
      this.wsClient.sendBidResult(msg.teamId, true);
      const state = this.engine.getState();
      this.ui.renderAuction(state, this.wsClient.getConnectedTeams());
      this.updateBidButtonStates();
      this.ui.updateBidDisplay(state);
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
    window.location.hash = view;
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
  saveState() {
    try {
      const state = {
        isLoggedIn: this.isLoggedIn,
        selectedTeamIds: [...this.selectedTeamIds],
        selectedPlayerIds: [...this.selectedPlayerIds],
        currentView: this.currentView,
        engine: this.engine ? this.engine.serialize() : null,
        scorecards: this.scorecardMgr.serialize(),
      };
      const stateStr = JSON.stringify(state);
      localStorage.setItem('npl_auction_state', stateStr);
      
      if (this.isLoggedIn) {
        fetch('/api/state', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (localStorage.getItem('npl_token') || '')
          },
          body: stateStr
        }).catch(e => console.warn('Server sync failed', e));
      }
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  /** Load saved auction state from server/localStorage */
  async loadState() {
    try {
      let raw = null;
      try {
        const res = await fetch('/api/state');
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          raw = await res.text();
        }
      } catch (e) {
        // Server unavailable (GitHub Pages) — will fall back to localStorage
      }

      if (!raw) {
        raw = localStorage.getItem('npl_auction_state');
      }

      if (!raw) return;

      const state = JSON.parse(raw);
      if (state.isLoggedIn !== undefined) {
        this.isLoggedIn = state.isLoggedIn;
      }
      if (state.selectedTeamIds) {
        this.selectedTeamIds = new Set(state.selectedTeamIds);
      }
      if (state.selectedPlayerIds) {
        this.selectedPlayerIds = new Set(state.selectedPlayerIds);
      }
      if (state.currentView) {
        this.currentView = state.currentView;
      }
      if (state.engine) {
        this.engine = AuctionEngine.restore(state.engine);
        console.log('[App] Auction state restored from localStorage');
      }
      if (state.scorecards) {
        this.scorecardMgr = ScorecardManager.restore(state.scorecards);
        console.log('[App] Scorecards restored');
      }

      // Restore gallery
      const galleryRaw = localStorage.getItem('npl_gallery');
      if (galleryRaw) {
        try { this.galleryMgr = GalleryManager.restore(JSON.parse(galleryRaw)); }
        catch(e) { console.warn('Gallery restore failed:', e); }
      }
    } catch (e) {
      console.warn('Failed to load state:', e);
      localStorage.removeItem('npl_auction_state');
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

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  render() {
    const stats = this.engine ? {
      remaining: this.engine.getState().remainingPlayers,
      sold: this.engine.getState().soldCount,
      unsold: this.engine.getState().unsoldCount,
    } : {};

    this.ui.renderHeader(this.currentView, stats, this.sounds.muted, this.commentaryVisible);
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
        this.ui.renderPlayerSelect(PLAYERS_DATA, this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
        this.bindPlayerSelectEvents();
        break;
      case 'rules':
        this.ui.renderRules();
        break;
      case 'players':
        this.ui.renderPlayerPool(PLAYERS_DATA, this.poolFilter, this.poolSearch);
        this.bindPoolEvents();
        break;
      case 'auction':
        if (!this.engine) {
          this.ui.showToast('Please set up the auction first', 'warning');
          this.navigate('setup');
          return;
        }
        this.ui.renderAuction(this.engine.getState());
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
  }

  bindPoolEvents() {
    const searchInput = document.getElementById('player-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.poolSearch = e.target.value;
        const cursorPos = e.target.selectionStart;
        this.ui.renderPlayerPool(PLAYERS_DATA, this.poolFilter, this.poolSearch);
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
        this.ui.renderPlayerSelect(PLAYERS_DATA, this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
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
    const target = e.target.closest('[data-team-id], [data-view], [data-role], [data-player-name], [data-ball], [data-live-match], [data-lm-new-batsman], [data-lm-next-bowler], [data-lm-coin-flip], [data-lm-dismissal], [data-lm-runout], [data-ro-runs], [data-gallery-filter], [data-delete-photo], [data-generate-card], #login-btn, #logout-btn, #start-auction-btn, #nominate-btn, #sold-btn, #unsold-btn, #goto-auction-btn, #view-results-btn, #goto-setup-btn, #reauction-btn, #reauction-yes-btn, #reauction-no-btn, #download-all-posters-btn, #select-all-players-btn, #confirm-players-btn, #quick-bid-btn, #undo-bid-btn, #redo-bid-btn, #fullscreen-btn, #generate-qr-btn, #close-qr-modal, #copy-link-btn, #proceed-rules-btn, #reset-auction-btn, #reset-confirm-yes, #reset-confirm-no, #recall-bid-btn, #recall-confirm-yes, #recall-confirm-no, #select-all-teams-btn, #download-rules-pdf-btn, #sound-toggle-btn, #results-tab-squads, #results-tab-analytics, #results-tab-standings, #results-tab-stats, #results-tab-scorecard, #results-tab-fixtures, #draw-tokens-btn, #clear-tokens-btn, #clear-tokens-yes, #clear-tokens-no, #download-fixtures-btn, #lock-fixtures-btn, #create-knockout-btn, #sc-back-btn, #sc-back-btn2, #sc-save-btn, .sc-open-btn, #commentary-toggle-btn, #commentary-header, #open-projector-btn, #hamburger-toggle, #nav-more-toggle, .nav-more-item, .qr-modal-overlay, .filter-btn, .team-bid-btn, .poster-preview-btn, .poster-download-btn, #live-undo-btn, #live-back-btn, #live-save-scorecard-btn, #lm-start-toss-btn, #lm-confirm-openers-btn, #lm-wd-toggle, #lm-nb-toggle, #lm-bye-toggle, #lm-lb-toggle, #lm-wicket-btn, #lm-modal-close-btn, #lm-save-yes-btn, #lm-save-no-btn, #lm-save-dismiss-btn, #lm-edit-score-btn, #live-edit-score-btn, #ro-swap-strike-btn, #lm-swap-strike-btn, #share-app-btn, #share-copy-wa-btn, #share-copy-ig-btn, #share-tab-wa, #share-tab-ig, #share-modal-close, #awards-reveal-next-btn, #awards-reset-btn, #awards-back-btn, .score-btn, .lm-sub-btn, .lm-modal-option, .lm-modal-close');
    if (!target) return;

    // ── Premium Features Click Routing ──
    if (this.currentView === 'live-match' && this._handleLiveMatchClick(target)) return;
    if (this.currentView === 'gallery' && this._handleGalleryClick(target)) return;
    if (this.currentView === 'awards' && this._handleAwardsClick(target)) return;

    // ── Login: submit ──
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
              this.isLoggedIn = true;
              localStorage.setItem('npl_token', data.token || 'npl-auth-token');
              this.saveState();
              this.ui.showToast('Login successful!', 'success');
              this.navigate('setup');
            } else {
              this.ui.showToast('Invalid username or password', 'error');
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
            this.saveState();
            this.ui.showToast('Login successful!', 'success');
            this.navigate('setup');
          } else {
            this.ui.showToast('Invalid username or password', 'error');
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
        this.ui.renderPlayerSelect(PLAYERS_DATA, this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
        this.bindPlayerSelectEvents();
      } else {
        this.poolFilter = target.dataset.role;
        this.ui.renderPlayerPool(PLAYERS_DATA, this.poolFilter, this.poolSearch);
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
      const dd = document.getElementById('hamburger-dropdown');
      if (dd) dd.style.display = dd.style.display === 'none' ? 'flex' : 'none';
      // Close More dropdown if open
      const moreDd = document.getElementById('nav-more-dropdown');
      if (moreDd) moreDd.style.display = 'none';
      return;
    }

    // ── Nav More dropdown toggle ──
    if (target.id === 'nav-more-toggle' || target.closest('#nav-more-toggle')) {
      const dd = document.getElementById('nav-more-dropdown');
      if (dd) dd.style.display = dd.style.display === 'none' ? 'flex' : 'none';
      // Close hamburger if open
      const hdd = document.getElementById('hamburger-dropdown');
      if (hdd) hdd.style.display = 'none';
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
      const dd = document.getElementById('hamburger-dropdown');
      if (dd) dd.style.display = 'none';
      this.render();
      return;
    }

    // ── Share App ──
    if (target.id === 'share-app-btn' || target.closest('#share-app-btn')) {
      const dd = document.getElementById('hamburger-dropdown');
      if (dd) dd.style.display = 'none';
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
      if (this.fixturesLocked) {
        this.ui.showToast('🔒 Fixtures are locked. Unlock first.', 'warning');
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
      const st = this.engine.getState(); st.fixturesLocked = this.fixturesLocked;
      this.ui.renderResults(st, 'fixtures');
      setTimeout(() => this.initFixtureDragDrop(), 100);
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
        this._resetAllMatchData();
        this.saveState();
        this.broadcastState();
        this.ui.showToast('🗑️ Token draw cleared. All match data reset.', 'info');
        const st2 = this.engine.getState(); st2.fixturesLocked = this.fixturesLocked;
        this.ui.renderResults(st2, 'fixtures');
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
    this.selectedPlayerIds = new Set(PLAYERS_DATA.map(p => p.name));
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
    this.ui.renderPlayerSelect(PLAYERS_DATA, this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
    this.bindPlayerSelectEvents();
  }

  selectAllPlayers() {
    // Get currently filtered players
    let filtered = PLAYERS_DATA;
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
    this.ui.renderPlayerSelect(PLAYERS_DATA, this.selectedPlayerIds, this.playerSelectFilter, this.playerSelectSearch);
    this.bindPlayerSelectEvents();
  }

  confirmPlayerSelection() {
    if (this.selectedPlayerIds.size === 0) {
      this.ui.showToast('Select at least 1 player', 'warning');
      return;
    }

    const selectedTeams = TEAMS_DATA.filter(t => this.selectedTeamIds.has(t.id));
    const selectedPlayers = PLAYERS_DATA.filter(p => this.selectedPlayerIds.has(p.name));
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

    const result = this.engine.placeDirectBid(teamId, amount);
    if (result.success) {
      const state = this.engine.getState();
      this.ui.renderAuction(state, this.wsClient.getConnectedTeams());
      this.updateBidButtonStates();
      this.ui.updateBidDisplay(state);
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
      const state = this.engine.getState();
      this.ui.renderAuction(state, this.wsClient.getConnectedTeams());
      this.updateBidButtonStates();
      this.ui.showToast('Bid undone', 'info');
      this.broadcastState();
      this.saveState();
    }
  }

  handleRedoBid() {
    if (!this.engine) return;
    if (this.engine.redoBid()) {
      const state = this.engine.getState();
      this.ui.renderAuction(state, this.wsClient.getConnectedTeams());
      this.updateBidButtonStates();
      this.ui.showToast('Bid redone', 'info');
      this.broadcastState();
      this.saveState();
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
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
      if (team && team.squad.length >= 12) {
        this.ui.showToast(`${team.shortName}: Squad is full (12/12)`, 'error');
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

      // Full re-render to update sidebar, info panel, and buttons
      this.ui.renderAuction(state, this.wsClient.getConnectedTeams());
      this.updateBidButtonStates();
      // Flash the bid amount
      this.ui.updateBidDisplay(state);
      this.broadcastState();
      this.saveState();
    }
  }

  // ── Scorecard Helpers ──
  _renderScorecard() {
    if (!this.engine) return;
    const state = this.engine.getState();
    const gd = state.groupDivision;

    // Auto-create scorecard entries from fixtures if they don't exist
    if (gd && this.scorecardMgr.getAllMatches().length === 0) {
      const fixtures = this._getFixtureMatchList(gd, state.teams);
      const getTeam = (id) => state.teams.find(t => t.id === id) || { id, name: id, shortName: id, color: '#666', textColor: '#fff', logo: '', squad: [] };
      fixtures.forEach(f => {
        if (!this.scorecardMgr.getMatch(f.matchId)) {
          this.scorecardMgr.createMatch(f.matchId, getTeam(f.teamAId), getTeam(f.teamBId), { venue: 'Nakre Ground', date: f.date, time: f.time });
        }
      });
    }

    this.resultsTab = 'scorecard';
    this._renderResultsWithPremium();
  }

  _ensureScorecardMatch(matchId) {
    if (this.scorecardMgr.getMatch(matchId)) return;
    const state = this.engine.getState();
    const gd = state.groupDivision;
    if (!gd) return;
    // Find the fixture info from the matchId
    const allTeams = state.teams;
    const getTeam = (id) => {
      const t = allTeams.find(t => t.id === id);
      return t || { id, name: id, shortName: id, color: '#666', textColor: '#fff', logo: '', squad: [] };
    };
    // Build fixtures from groups
    const fixtures = this._getFixtureMatchList(gd, allTeams);
    const fix = fixtures.find(f => f.matchId === matchId);
    if (!fix) return;
    const tA = getTeam(fix.teamAId);
    const tB = getTeam(fix.teamBId);
    this.scorecardMgr.createMatch(matchId, tA, tB, {
      venue: 'Nakre Ground', date: fix.date, time: fix.time,
    });
  }

  _getFixtureMatchList(gd, teams) {
    if (!gd) return [];

    // Time slots: each match = 1 hour, starting 8:30 AM
    const day1Times = ['8:30 – 9:30','9:30 – 10:30','10:30 – 11:30','11:30 – 12:30','12:30 – 1:30','1:30 – 2:30'];
    const day2Times = ['8:30 – 9:30','9:30 – 10:30','10:30 – 11:30','11:30 – 12:30','12:30 – 1:30','1:30 – 2:30'];

    // Round-robin pairs for 4 teams [0,1,2,3]
    // Round 1: 0v1, 2v3  |  Round 2: 0v2, 1v3  |  Round 3: 0v3, 1v2
    const rrPairs = (g) => [
      [g[0],g[1]], [g[2],g[3]],  // Round 1
      [g[0],g[2]], [g[1],g[3]],  // Round 2
      [g[0],g[3]], [g[1],g[2]]   // Round 3
    ];

    const pA = rrPairs(gd.groupA);
    const pB = rrPairs(gd.groupB);

    // Day 1 (6 matches): Interleave A,B from Round 1 & 2
    // Day 2 (6 matches): Interleave A,B from Round 2 & 3
    // Ordering ensures no team plays back-to-back (groups alternate)
    const day1 = [
      { pair: pA[0], group: 'A' }, // R1-M1
      { pair: pB[0], group: 'B' }, // R1-M1
      { pair: pA[1], group: 'A' }, // R1-M2
      { pair: pB[1], group: 'B' }, // R1-M2
      { pair: pA[2], group: 'A' }, // R2-M1
      { pair: pB[2], group: 'B' }, // R2-M1
    ];
    const day2 = [
      { pair: pA[3], group: 'A' }, // R2-M2
      { pair: pB[3], group: 'B' }, // R2-M2
      { pair: pA[4], group: 'A' }, // R3-M1
      { pair: pB[4], group: 'B' }, // R3-M1
      { pair: pA[5], group: 'A' }, // R3-M2
      { pair: pB[5], group: 'B' }, // R3-M2
    ];

    const scheduled = [...day1, ...day2];

    return scheduled.map((s, i) => {
      const dayIdx = i < 6 ? 0 : 1;
      const slotIdx = dayIdx === 0 ? i : i - 6;
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

    // Reset all dependent match data on re-draw
    this._resetAllMatchData();

    this.saveState();
    this.broadcastState();
    this.ui.showToast('🎲 Tokens drawn! Groups assigned. Match data reset.', 'success');
    const stDraw = this.engine.getState(); stDraw.fixturesLocked = this.fixturesLocked;
    this.ui.renderResults(stDraw, 'fixtures');
    // Init drag-drop after render
    setTimeout(() => this.initFixtureDragDrop(), 100);
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
    const grids = document.querySelectorAll('.fixtures-match-grid[data-day]');
    if (!grids.length) return;

    let draggedEl = null;

    grids.forEach(grid => {
      grid.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.fixture-match-card[draggable]');
        if (!card) return;
        draggedEl = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.matchNum);
      });

      grid.addEventListener('dragend', (e) => {
        const card = e.target.closest('.fixture-match-card');
        if (card) card.classList.remove('dragging');
        grids.forEach(g => g.classList.remove('drag-over'));
        draggedEl = null;
      });

      grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        grid.classList.add('drag-over');
      });

      grid.addEventListener('dragleave', () => {
        grid.classList.remove('drag-over');
      });

      grid.addEventListener('drop', (e) => {
        e.preventDefault();
        grid.classList.remove('drag-over');
        if (!draggedEl) return;

        // Move the card to the new grid
        const closestCard = this._getClosestMatchCard(grid, e.clientY);
        if (closestCard) {
          grid.insertBefore(draggedEl, closestCard);
        } else {
          grid.appendChild(draggedEl);
        }

        // Update times based on new positions
        this._updateFixtureTimes();
        draggedEl.classList.remove('dragging');
        draggedEl = null;
      });
    });
  }

  _getClosestMatchCard(grid, y) {
    const cards = [...grid.querySelectorAll('.fixture-match-card:not(.dragging)')];
    let closest = null;
    let closestOffset = Number.NEGATIVE_INFINITY;

    cards.forEach(card => {
      const box = card.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) {
        closestOffset = offset;
        closest = card;
      }
    });
    return closest;
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
      btn.disabled = !canBid;
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
    const canvas = await generateTeamPoster(team);
    showPosterPreview(canvas);
  }

  async downloadTeamPoster(teamId) {
    if (!this.engine) return;
    const state = this.engine.getState();
    const team = state.teams.find(t => t.id === teamId);
    if (!team) return;

    this.ui.showToast(`Generating ${team.shortName} poster...`, 'info', 2000);
    const canvas = await generateTeamPoster(team);
    downloadCanvas(canvas, `NPL3_2026_${team.shortName}_Squad.png`);
    this.ui.showToast(`${team.shortName} poster downloaded!`, 'success');
  }

  async downloadAllPosters() {
    if (!this.engine) return;
    const state = this.engine.getState();
    this.ui.showToast('Generating all team posters...', 'info', 5000);
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
    const getTeam = (id) => state.teams.find(t => t.id === id) || { id, name: id, shortName: id, color: '#666', textColor: '#fff', logo: '', squad: [] };
    fixtures.forEach(f => {
      if (!this.scorecardMgr.getMatch(f.matchId)) {
        this.scorecardMgr.createMatch(f.matchId, getTeam(f.teamAId), getTeam(f.teamBId), { venue: 'Nakre Ground', date: f.date, time: f.time });
      }
    });

    // Also add knockout matches (match-13 through match-16) — always TBD until league is done
    const knockoutSlots = [
      { id: 'match-13', label: 'Qualifier 1', desc: 'A1 vs B1', time: '2:30 – 3:30' },
      { id: 'match-14', label: 'Eliminator', desc: 'A2 vs B2', time: '3:30 – 4:30' },
      { id: 'match-15', label: 'Qualifier 2', desc: 'Loser Q1 vs Winner Elim', time: '4:30 – 5:30' },
      { id: 'match-16', label: 'Final', desc: 'Winner Q1 vs Winner Q2', time: '5:30 – 6:30' },
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

  _handleLiveMatchClick(target) {
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
        const saved = localStorage.getItem('npl_live_match_' + matchId);
        if (saved) {
          try { this.liveMatchEngine = LiveMatchEngine.restore(JSON.parse(saved)); }
          catch(e) { this._createLiveEngine(match); }
        } else {
          this._createLiveEngine(match);
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
      this._renderLiveMatchView();
      return true;
    }

    // Next bowler selection
    const nextBowl = target.closest('[data-lm-next-bowler]');
    if (nextBowl && this.liveMatchEngine) {
      this.liveMatchEngine.selectNextBowler(nextBowl.dataset.lmNextBowler);
      this._saveLiveMatch();
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

  _createLiveEngine(match) {
    // Build squad arrays from auction state
    const teamASquad = this._getTeamSquad(match.teamAId);
    const teamBSquad = this._getTeamSquad(match.teamBId);
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
      btn.textContent = this._runOutSwapped ? '🔄 Strike Swapped' : '🔄 Swap Strike';
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
    this.ui.renderGallery(this.galleryMgr.photos, matches, this.galleryFilter);
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
          const potmPlayer = PLAYERS_DATA.find(p => p.name === potmName);
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

  _renderAwardsView() {
    if (this.awardsData.length === 0) {
      const matches = this.scorecardMgr.getAllMatches();
      const teams = this.engine ? this.engine.getState().teams : [];
      const soldPlayers = this.engine ? this.engine.getState().soldPlayers : [];
      this.awardsData = AwardsEngine.computeAwards(matches, teams, soldPlayers);
    }
    this.ui.renderAwards(this.awardsData, this.awardsRevealedCount);
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
