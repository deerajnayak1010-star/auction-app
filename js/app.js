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
  }

  async init() {
    // Listen to hash changes for routing
    window.addEventListener('hashchange', () => this.onHashChange());

    // Delegate all click events from #app
    document.getElementById('app').addEventListener('click', (e) => this.onClick(e));

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

    if (['login', 'setup', 'player-select', 'rules', 'players', 'auction', 'results', 'about', 'history'].includes(hash)) {
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
        this.ui.renderResults(this.engine ? this.engine.getState() : null, this.resultsTab);
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
    const target = e.target.closest('[data-team-id], [data-view], [data-role], [data-player-name], #login-btn, #logout-btn, #start-auction-btn, #nominate-btn, #sold-btn, #unsold-btn, #goto-auction-btn, #view-results-btn, #goto-setup-btn, #reauction-btn, #reauction-yes-btn, #reauction-no-btn, #download-all-posters-btn, #select-all-players-btn, #confirm-players-btn, #quick-bid-btn, #undo-bid-btn, #redo-bid-btn, #fullscreen-btn, #generate-qr-btn, #close-qr-modal, #copy-link-btn, #proceed-rules-btn, #reset-auction-btn, #reset-confirm-yes, #reset-confirm-no, #recall-bid-btn, #recall-confirm-yes, #recall-confirm-no, #select-all-teams-btn, #download-rules-pdf-btn, #sound-toggle-btn, #results-tab-squads, #results-tab-analytics, #results-tab-scorecard, #results-tab-fixtures, #draw-tokens-btn, #clear-tokens-btn, #clear-tokens-yes, #clear-tokens-no, #download-fixtures-btn, #sc-back-btn, #sc-back-btn2, #sc-save-btn, .sc-open-btn, #commentary-toggle-btn, #commentary-header, #open-projector-btn, .qr-modal-overlay, .filter-btn, .team-bid-btn, .poster-preview-btn, .poster-download-btn');
    if (!target) return;

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
      this.render();
      return;
    }

    // ── Results tab: squads ──
    if (target.id === 'results-tab-squads' || target.closest('#results-tab-squads')) {
      this.resultsTab = 'squads';
      this.ui.renderResults(this.engine ? this.engine.getState() : null, this.resultsTab);
      return;
    }

    // ── Results tab: analytics ──
    if (target.id === 'results-tab-analytics' || target.closest('#results-tab-analytics')) {
      this.resultsTab = 'analytics';
      this.ui.renderResults(this.engine ? this.engine.getState() : null, this.resultsTab);
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
      this.ui.renderResults(this.engine ? this.engine.getState() : null, this.resultsTab);
      setTimeout(() => this.initFixtureDragDrop(), 100);
      return;
    }

    // ── Draw tokens for fixtures ──
    if (target.id === 'draw-tokens-btn' || target.closest('#draw-tokens-btn')) {
      this.handleTokenDraw();
      return;
    }

    // ── Clear tokens (show confirmation) ──
    if (target.id === 'clear-tokens-btn' || target.closest('#clear-tokens-btn')) {
      this.ui.showClearTokensModal();
      return;
    }
    if (target.id === 'clear-tokens-yes') {
      this.ui.closeClearTokensModal();
      if (this.engine) {
        this.engine.groupDivision = null;
        this.saveState();
        this.broadcastState();
        this.ui.showToast('🗑️ Token draw cleared.', 'info');
        this.ui.renderResults(this.engine.getState(), 'fixtures');
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

    const matches = this.scorecardMgr.getAllMatches();
    const honours = this.scorecardMgr.computeHonours();
    const activeMatch = this.activeScorecardId ? this.scorecardMgr.getMatch(this.activeScorecardId) : null;
    this.ui.renderResults(state, 'scorecard', {
      matches, honours, scorecardView: this.scorecardView, activeMatch,
    });
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
    const matchTimes = ['9:00 AM','10:00 AM','11:15 AM','12:30 PM','2:00 PM','3:15 PM'];

    const getRR = (group) => {
      const pairs = [];
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          pairs.push([group[i], group[j]]);
      return pairs;
    };

    const pairsA = getRR(gd.groupA).map(p => ({ pair: p, group: 'A' }));
    const pairsB = getRR(gd.groupB).map(p => ({ pair: p, group: 'B' }));

    // Day1: [0,3,5]=[AvB,BvC,CvD]; Day2: [1,2,4]=[AvC,AvD,BvD] → 1-2 matches per team per day
    const day1raw = [pairsA[0], pairsB[0], pairsA[3], pairsB[3], pairsA[5], pairsB[5]];
    const day2raw = [pairsA[1], pairsB[1], pairsA[2], pairsB[2], pairsA[4], pairsB[4]];

    const reorderDay = (arr) => {
      const result = [], rem = [...arr];
      while (rem.length > 0) {
        const last = result.length > 0 ? result[result.length - 1].pair : [];
        const idx = rem.findIndex(m => !m.pair.some(t => last.includes(t)));
        result.push(idx >= 0 ? rem.splice(idx, 1)[0] : rem.shift());
      }
      return result;
    };

    const scheduled = [...reorderDay(day1raw), ...reorderDay(day2raw)];

    return scheduled.map((s, i) => {
      const dayIdx = i < 6 ? 0 : 1;
      const slotIdx = dayIdx === 0 ? i : i - 6;
      return {
        matchId: `match-${i + 1}`,
        matchNum: i + 1,
        teamAId: s.pair[0],
        teamBId: s.pair[1],
        group: s.group,
        date: dayIdx === 0 ? '25 April 2026' : '26 April 2026',
        time: matchTimes[slotIdx] || '',
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

    this.saveState();
    this.broadcastState();
    this.ui.showToast('🎲 Tokens drawn! Groups assigned.', 'success');
    this.ui.renderResults(this.engine.getState(), 'fixtures');
    // Init drag-drop after render
    setTimeout(() => this.initFixtureDragDrop(), 100);
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
    const matchTimes = ['9:00 AM', '10:00 AM', '11:15 AM', '12:30 PM', '2:00 PM', '3:15 PM'];
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
}

// ── Bootstrap ───────────────────────────────
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
