// ─────────────────────────────────────────────
// app.js — Main Controller, Routing & Events
// ─────────────────────────────────────────────

import { TEAMS_DATA, PLAYERS_DATA } from './data.js';
import { AuctionEngine } from './auction.js';
import { UI } from './ui.js';

class App {
  constructor() {
    this.ui = new UI();
    this.engine = null;
    this.selectedTeamIds = new Set();
    this.currentView = 'setup';
    this.poolFilter = 'All';
    this.poolSearch = '';
  }

  init() {
    // Listen to hash changes for routing
    window.addEventListener('hashchange', () => this.onHashChange());

    // Delegate all click events from #app
    document.getElementById('app').addEventListener('click', (e) => this.onClick(e));

    // Navigate to initial view
    const hash = window.location.hash.slice(1);
    if (['setup', 'players', 'auction', 'results'].includes(hash)) {
      this.currentView = hash;
    }
    this.render();
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
    if (['setup', 'players', 'auction', 'results'].includes(hash)) {
      this.currentView = hash;
      this.render();
    }
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
        this.ui.renderPlayerPool(PLAYERS_DATA, this.poolFilter, this.poolSearch);
        this.bindPoolEvents(); // Rebind after re-render
      });
    }
  }

  onClick(e) {
    const target = e.target.closest('[data-team-id], [data-view], [data-role], #start-auction-btn, #nominate-btn, #sold-btn, #unsold-btn, #goto-auction-btn, #view-results-btn, #goto-setup-btn, .filter-btn, .team-bid-btn');
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

    // ── Pool: filter ──
    if (target.classList.contains('filter-btn')) {
      this.poolFilter = target.dataset.role;
      this.ui.renderPlayerPool(PLAYERS_DATA, this.poolFilter, this.poolSearch);
      this.bindPoolEvents();
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

    // ── Complete: view results ──
    if (target.id === 'view-results-btn') {
      this.navigate('results');
      return;
    }

    // ── Results: go to setup ──
    if (target.id === 'goto-setup-btn') {
      this.navigate('setup');
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

    const selectedTeams = TEAMS_DATA.filter(t => this.selectedTeamIds.has(t.id));
    this.engine = new AuctionEngine(selectedTeams, PLAYERS_DATA);
    this.ui.showToast(`Auction started with ${selectedTeams.length} teams!`, 'success');
    this.navigate('auction');
  }

  nominatePlayer() {
    if (!this.engine) return;

    const player = this.engine.nominateNext();
    if (!player) {
      this.ui.showToast('All players have been auctioned!', 'info');
      this.render();
      return;
    }

    this.render();
    this.ui.showToast(`🏏 ${player.name} is up for auction!`, 'info');
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
      this.ui.renderAuction(state);
      this.updateBidButtonStates();
      // Flash the bid amount
      this.ui.updateBidDisplay(state);
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
}

// ── Bootstrap ───────────────────────────────
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
