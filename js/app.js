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
      if (['setup', 'player-select', 'rules', 'players', 'auction', 'results'].includes(hash)) {
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

  /** Broadcast current auction state to all mobile clients */
  broadcastState() {
    if (!this.engine || !this.wsClient.connected) return;
    this.wsClient.broadcastState(this.engine.getState());
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
      if (team && team.squad.length >= 14) error = 'Squad is full';
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

    if (['login', 'setup', 'player-select', 'rules', 'players', 'auction', 'results'].includes(hash)) {
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
    const target = e.target.closest('[data-team-id], [data-view], [data-role], [data-player-name], #login-btn, #logout-btn, #start-auction-btn, #nominate-btn, #sold-btn, #unsold-btn, #goto-auction-btn, #view-results-btn, #goto-setup-btn, #reauction-btn, #reauction-yes-btn, #reauction-no-btn, #download-all-posters-btn, #select-all-players-btn, #confirm-players-btn, #quick-bid-btn, #undo-bid-btn, #redo-bid-btn, #fullscreen-btn, #generate-qr-btn, #close-qr-modal, #copy-link-btn, #proceed-rules-btn, #reset-auction-btn, #reset-confirm-yes, #reset-confirm-no, #select-all-teams-btn, #download-rules-pdf-btn, #sound-toggle-btn, #results-tab-squads, #results-tab-analytics, #commentary-toggle-btn, #commentary-header, #open-projector-btn, .qr-modal-overlay, .filter-btn, .team-bid-btn, .poster-preview-btn, .poster-download-btn');
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
      if (team && team.squad.length >= 14) {
        this.ui.showToast(`${team.shortName}: Squad is full (14/14)`, 'error');
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

  sellPlayer() {
    if (!this.engine || !this.engine.currentBidder) return;

    const state = this.engine.getState();
    const teamName = state.currentBidderTeam?.shortName || 'Unknown';
    const playerName = state.currentPlayer?.name || 'Unknown';
    const price = state.currentBid;

    this.stopTimerTick();
    this.sounds.playSold();

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
