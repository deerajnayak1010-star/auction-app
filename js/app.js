// ─────────────────────────────────────────────
// app.js — Main Controller, Routing & Events
// ─────────────────────────────────────────────

import { TEAMS_DATA, PLAYERS_DATA } from './data.js';
import { AuctionEngine } from './auction.js';
import { UI } from './ui.js';
import { generateTeamPoster, downloadCanvas, downloadAllPosters, showPosterPreview } from './poster.js';
import { WSClient } from './ws-client.js';

class App {
  constructor() {
    this.ui = new UI();
    this.engine = null;
    this.selectedTeamIds = new Set();
    this.selectedPlayerIds = new Set();
    this.currentView = 'setup';
    this.poolFilter = 'All';
    this.poolSearch = '';
    this.playerSelectFilter = 'All';
    this.playerSelectSearch = '';
    this.wsClient = new WSClient();
    this.mobileSessionUrl = null;
    this.showQRModal = false;
  }

  init() {
    // Listen to hash changes for routing
    window.addEventListener('hashchange', () => this.onHashChange());

    // Delegate all click events from #app
    document.getElementById('app').addEventListener('click', (e) => this.onClick(e));

    // Fullscreen change listener
    document.addEventListener('fullscreenchange', () => this.render());

    // Initialize WebSocket connection
    this.initWebSocket();

    // Try to restore saved state
    this.loadState();

    // Navigate to initial view
    const hash = window.location.hash.slice(1);
    if (['setup', 'player-select', 'rules', 'players', 'auction', 'results'].includes(hash)) {
      this.currentView = hash;
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
    if (['setup', 'player-select', 'rules', 'players', 'auction', 'results'].includes(hash)) {
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
        selectedTeamIds: [...this.selectedTeamIds],
        selectedPlayerIds: [...this.selectedPlayerIds],
        currentView: this.currentView,
        engine: this.engine ? this.engine.serialize() : null,
      };
      localStorage.setItem('npl_auction_state', JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  /** Load saved auction state from localStorage */
  loadState() {
    try {
      const raw = localStorage.getItem('npl_auction_state');
      if (!raw) return;

      const state = JSON.parse(raw);
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

    this.ui.renderHeader(this.currentView, stats);
    this.bindNavEvents();

    switch (this.currentView) {
      case 'setup':
        this.ui.renderSetup(TEAMS_DATA, this.selectedTeamIds);
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
        break;
      case 'results':
        this.ui.renderResults(this.engine ? this.engine.getState() : null);
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

  onClick(e) {
    const target = e.target.closest('[data-team-id], [data-view], [data-role], [data-player-name], #start-auction-btn, #nominate-btn, #sold-btn, #unsold-btn, #goto-auction-btn, #view-results-btn, #goto-setup-btn, #reauction-btn, #reauction-yes-btn, #reauction-no-btn, #download-all-posters-btn, #select-all-players-btn, #confirm-players-btn, #quick-bid-btn, #undo-bid-btn, #redo-bid-btn, #fullscreen-btn, #generate-qr-btn, #close-qr-modal, #copy-link-btn, #proceed-rules-btn, #reset-auction-btn, .qr-modal-overlay, .filter-btn, .team-bid-btn, .poster-preview-btn, .poster-download-btn');
    if (!target) return;

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

    // ── Reset auction ──
    if (target.id === 'reset-auction-btn') {
      this.resetAuction();
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

  startAuction() {
    if (this.selectedTeamIds.size < 2) {
      this.ui.showToast('Select at least 2 teams', 'warning');
      return;
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
    this.engine = new AuctionEngine(selectedTeams, selectedPlayers);
    this.saveState();
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
      this.render();
      this.broadcastState();
      return;
    }

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
      const state = this.engine.getState();
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

    // Show overlay animation
    this.ui.showSoldOverlay();
    this.ui.showToast(
      `🎉 SOLD! ${playerName} → ${teamName} for ${AuctionEngine.formatPoints(price)}`,
      'sold',
      4000
    );

    // Execute the sale
    this.engine.sellPlayer();
    this.broadcastState();
    this.saveState();

    // Re-render after a short delay for the animation
    setTimeout(() => this.render(), 1200);
  }

  markUnsold() {
    if (!this.engine || !this.engine.currentPlayer) return;

    const playerName = this.engine.currentPlayer.name;

    // Show overlay animation
    this.ui.showUnsoldOverlay();
    this.ui.showToast(`${playerName} went UNSOLD`, 'unsold', 3000);

    // Execute
    this.engine.markUnsold();
    this.broadcastState();
    this.saveState();

    // Re-render after animation
    setTimeout(() => this.render(), 1000);
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
    downloadCanvas(canvas, `NPL_2025_${team.shortName}_Squad.png`);
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
