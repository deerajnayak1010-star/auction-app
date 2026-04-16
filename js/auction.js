// ─────────────────────────────────────────────
// auction.js — IPL Auction Engine (pure logic)
// ─────────────────────────────────────────────

export class AuctionEngine {
  /**
   * @param {Array} teams - Team objects from selected teams
   * @param {Array} players - Player objects to auction
   */
  constructor(teams, players) {
    this.teams = new Map();
    teams.forEach(t => {
      this.teams.set(t.id, {
        ...t,
        purse: t.purse ?? 100000,
        squad: [],
        totalSpent: 0,
      });
    });

    this.playerPool = this._shuffle([...players]);
    this.currentPlayer = null;
    this.currentBid = 0;
    this.currentBidder = null;
    this.bidHistory = [];       // bids for current player
    this.bidUndoStack = [];     // undo snapshots
    this.bidRedoStack = [];     // redo snapshots
    this.soldPlayers = [];      // all sold results
    this.unsoldPlayers = [];    // unsold player objects
    this.auctionLog = [];       // full activity log
    this.playerIndex = 0;       // how many players have been nominated
    this.phase = 'waiting';     // waiting | bidding | complete
  }

  // ── Helpers ───────────────────────────────────

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Get the bid increment based on the current bid amount.
   * Up to 10,000 → +500 | 10,000–20,000 → +1,000 | 20,000+ → +2,000
   */
  getIncrement(bid) {
    if (bid < 10000) return 500;
    if (bid < 20000) return 1000;
    return 2000;
  }

  /** Format points for display: 1000 → "1,000 pts" */
  static formatPoints(pts) {
    return pts.toLocaleString('en-IN') + ' pts';
  }

  // ── Nomination ────────────────────────────────

  /** Nominate the next player from the pool. Returns the player or null if done. */
  nominateNext() {
    if (this.playerPool.length === 0) {
      this.phase = 'complete';
      return null;
    }

    this.currentPlayer = this.playerPool.shift();
    this.currentBid = this.currentPlayer.basePrice;
    this.currentBidder = null;
    this.bidHistory = [];
    this.bidUndoStack = [];
    this.bidRedoStack = [];
    this.phase = 'bidding';
    this.playerIndex++;

    this._log('nominate', {
      player: this.currentPlayer,
      index: this.playerIndex,
    });

    return this.currentPlayer;
  }

  // ── Bidding ───────────────────────────────────

  /** The amount the next bid will be (base for first bid, current + increment otherwise). */
  getNextBidAmount() {
    if (!this.currentBidder) return this.currentBid; // first bid is at base price
    return this.currentBid + this.getIncrement(this.currentBid);
  }

  /** Check if a team is eligible to place a bid right now. */
  canTeamBid(teamId) {
    if (this.phase !== 'bidding') return false;

    const team = this.teams.get(teamId);
    if (!team) return false;
    if (team.squad.length >= 14) return false;             // max squad
    if (this.currentBidder === teamId) return false;       // already highest bidder

    const nextBid = this.getNextBidAmount();

    // Reserve enough purse for remaining minimum squad slots at base price
    const slotsAfterThis = Math.max(0, 12 - team.squad.length - 1);
    const reserve = slotsAfterThis * 1000;

    return team.purse >= nextBid + reserve;
  }

  /** Get list of team IDs that can currently bid. */
  getEligibleTeams() {
    const eligible = [];
    for (const [id] of this.teams) {
      if (this.canTeamBid(id)) eligible.push(id);
    }
    return eligible;
  }

  /**
   * Place a bid for a team. Returns { success, bid, bidder } or { success: false, error }.
   */
  /** Save a snapshot of the current bid state for undo. */
  _saveBidSnapshot() {
    this.bidUndoStack.push({
      bid: this.currentBid,
      bidder: this.currentBidder,
      bidHistory: [...this.bidHistory],
    });
    this.bidRedoStack = [];
  }

  placeBid(teamId) {
    if (!this.canTeamBid(teamId)) {
      return { success: false, error: 'Team cannot bid' };
    }

    // Save state for undo before mutating
    this._saveBidSnapshot();

    // Increase bid if not the first bidder
    if (this.currentBidder !== null) {
      this.currentBid += this.getIncrement(this.currentBid);
    }

    this.currentBidder = teamId;
    const team = this.teams.get(teamId);

    const entry = {
      teamId,
      teamName: team.shortName,
      teamColor: team.color,
      amount: this.currentBid,
      timestamp: Date.now(),
    };

    this.bidHistory.push(entry);

    this._log('bid', {
      ...entry,
      playerName: this.currentPlayer.name,
    });

    return { success: true, bid: this.currentBid, bidder: teamId };
  }

  /**
   * Place a direct bid with a specific amount.
   * @param {string} teamId
   * @param {number} amount - Must be greater than currentBid (or equal to base if first bid)
   */
  placeDirectBid(teamId, amount) {
    if (this.phase !== 'bidding') return { success: false, error: 'Not in bidding phase' };

    const team = this.teams.get(teamId);
    if (!team) return { success: false, error: 'Team not found' };
    if (team.squad.length >= 14) return { success: false, error: 'Squad full' };

    // Amount must be >= base price
    if (amount < this.currentPlayer.basePrice) {
      return { success: false, error: 'Bid below base price' };
    }

    // If there's already a bid, amount must exceed current
    if (this.currentBidder !== null && amount <= this.currentBid) {
      return { success: false, error: 'Bid must exceed current bid' };
    }

    // Same bidder can't outbid themselves
    if (this.currentBidder === teamId) {
      return { success: false, error: 'Already highest bidder' };
    }

    // Reserve check
    const slotsAfterThis = Math.max(0, 12 - team.squad.length - 1);
    const reserve = slotsAfterThis * 1000;
    if (team.purse < amount + reserve) {
      return { success: false, error: 'Insufficient budget' };
    }

    // Save state for undo
    this._saveBidSnapshot();

    this.currentBid = amount;
    this.currentBidder = teamId;

    const entry = {
      teamId,
      teamName: team.shortName,
      teamColor: team.color,
      amount: this.currentBid,
      timestamp: Date.now(),
    };

    this.bidHistory.push(entry);

    this._log('bid', {
      ...entry,
      playerName: this.currentPlayer.name,
    });

    return { success: true, bid: this.currentBid, bidder: teamId };
  }

  // ── Undo / Redo ───────────────────────────────

  canUndo() { return this.bidUndoStack.length > 0 && this.phase === 'bidding'; }
  canRedo() { return this.bidRedoStack.length > 0 && this.phase === 'bidding'; }

  undoBid() {
    if (!this.canUndo()) return false;
    // Push current state to redo
    this.bidRedoStack.push({
      bid: this.currentBid,
      bidder: this.currentBidder,
      bidHistory: [...this.bidHistory],
    });
    // Restore previous
    const prev = this.bidUndoStack.pop();
    this.currentBid = prev.bid;
    this.currentBidder = prev.bidder;
    this.bidHistory = prev.bidHistory;
    return true;
  }

  redoBid() {
    if (!this.canRedo()) return false;
    // Push current state to undo
    this.bidUndoStack.push({
      bid: this.currentBid,
      bidder: this.currentBidder,
      bidHistory: [...this.bidHistory],
    });
    // Restore redo
    const next = this.bidRedoStack.pop();
    this.currentBid = next.bid;
    this.currentBidder = next.bidder;
    this.bidHistory = next.bidHistory;
    return true;
  }

  // ── Resolution ────────────────────────────────

  /** Sell the current player to the highest bidder. Returns the sale result or null. */
  sellPlayer() {
    if (this.phase !== 'bidding' || !this.currentBidder || !this.currentPlayer) {
      return null;
    }

    const team = this.teams.get(this.currentBidder);
    team.purse -= this.currentBid;
    team.totalSpent += this.currentBid;
    team.squad.push({
      ...this.currentPlayer,
      soldPrice: this.currentBid,
    });

    const result = {
      player: { ...this.currentPlayer },
      teamId: this.currentBidder,
      teamName: team.name,
      teamShortName: team.shortName,
      teamColor: team.color,
      price: this.currentBid,
    };

    this.soldPlayers.push(result);
    this._log('sold', result);
    this._resetCurrent();

    return result;
  }

  /** Mark the current player as unsold. Returns the player or null. */
  markUnsold() {
    if (this.phase !== 'bidding' || !this.currentPlayer) return null;

    const player = { ...this.currentPlayer };
    this.unsoldPlayers.push(player);
    this._log('unsold', { player });
    this._resetCurrent();

    return player;
  }

  _resetCurrent() {
    this.phase = 'waiting';
    this.currentPlayer = null;
    this.currentBid = 0;
    this.currentBidder = null;
    this.bidHistory = [];
    this.bidUndoStack = [];
    this.bidRedoStack = [];
  }

  /** Move all unsold players back into the active pool to be auctioned again */
  reauctionUnsold() {
    if (this.unsoldPlayers.length === 0) return false;
    
    this.playerPool = this._shuffle([...this.unsoldPlayers]);
    this.unsoldPlayers = [];
    this.phase = 'waiting';
    
    this._log('reauction', { count: this.playerPool.length });
    return true;
  }

  // ── State Snapshot ────────────────────────────

  /** Return a full snapshot of the auction state. */
  getState() {
    const teamsArr = [];
    for (const [, team] of this.teams) {
      teamsArr.push({ ...team });
    }

    return {
      phase: this.phase,
      currentPlayer: this.currentPlayer,
      currentBid: this.currentBid,
      currentBidder: this.currentBidder,
      currentBidderTeam: this.currentBidder ? this.teams.get(this.currentBidder) : null,
      bidHistory: [...this.bidHistory],
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      nextBidAmount: this.phase === 'bidding' ? this.getNextBidAmount() : 0,
      increment: this.phase === 'bidding' ? this.getIncrement(this.currentBid) : 0,
      playerIndex: this.playerIndex,
      totalPlayers: this.playerIndex + this.playerPool.length,
      remainingPlayers: this.playerPool.length,
      soldCount: this.soldPlayers.length,
      unsoldCount: this.unsoldPlayers.length,
      teams: teamsArr,
      soldPlayers: [...this.soldPlayers],
      unsoldPlayers: [...this.unsoldPlayers],
      auctionLog: [...this.auctionLog].reverse(),   // newest first
    };
  }

  getTeamState(teamId) {
    return this.teams.get(teamId) ?? null;
  }

  // ── Internal Log ──────────────────────────────

  _log(type, data) {
    this.auctionLog.push({ type, ...data, timestamp: Date.now() });
  }

  // ── Serialization (for localStorage persistence) ──

  /** Serialize the entire engine to a JSON-safe object */
  serialize() {
    const teamsArr = [];
    for (const [id, team] of this.teams) {
      teamsArr.push({ ...team });
    }
    return {
      teams: teamsArr,
      playerPool: [...this.playerPool],
      currentPlayer: this.currentPlayer,
      currentBid: this.currentBid,
      currentBidder: this.currentBidder,
      bidHistory: [...this.bidHistory],
      bidUndoStack: [...this.bidUndoStack],
      bidRedoStack: [...this.bidRedoStack],
      soldPlayers: [...this.soldPlayers],
      unsoldPlayers: [...this.unsoldPlayers],
      auctionLog: [...this.auctionLog],
      playerIndex: this.playerIndex,
      phase: this.phase,
    };
  }

  /** Restore an AuctionEngine from serialized data */
  static restore(data) {
    // Create a dummy engine then overwrite its internals
    const engine = Object.create(AuctionEngine.prototype);
    engine.teams = new Map();
    data.teams.forEach(t => engine.teams.set(t.id, { ...t }));
    engine.playerPool = data.playerPool || [];
    engine.currentPlayer = data.currentPlayer || null;
    engine.currentBid = data.currentBid || 0;
    engine.currentBidder = data.currentBidder || null;
    engine.bidHistory = data.bidHistory || [];
    engine.bidUndoStack = data.bidUndoStack || [];
    engine.bidRedoStack = data.bidRedoStack || [];
    engine.soldPlayers = data.soldPlayers || [];
    engine.unsoldPlayers = data.unsoldPlayers || [];
    engine.auctionLog = data.auctionLog || [];
    engine.playerIndex = data.playerIndex || 0;
    engine.phase = data.phase || 'waiting';
    return engine;
  }
}
