// ─────────────────────────────────────────────
// auction.js — IPL Auction Engine (pure logic)
// ─────────────────────────────────────────────

export class AuctionEngine {
  /**
   * @param {Array} teams - Team objects from selected teams
   * @param {Array} players - Player objects to auction
   */
  constructor(teams, players, options = {}) {
    this.teams = new Map();
    teams.forEach(t => {
      this.teams.set(t.id, {
        ...t,
        purse: t.purse ?? 100000,
        squad: [],
        totalSpent: 0,
      });
    });

    // Shuffle players but pin reserved players at specific positions
    this.playerPool = this._buildPlayerPool([...players]);
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
    this.lastSale = null;       // snapshot of last action (sold/unsold) for recall
    this.phase = 'waiting';     // waiting | bidding | complete

    // Timer settings
    this.timerDuration = options.timerDuration ?? 30; // seconds, 0 = disabled
    this.timerStartTime = null;  // timestamp when timer was last (re)started
    this.timerEnabled = this.timerDuration > 0;

    // Analytics: track bid counts per player sale
    this.maxBidsPlayer = null;  // { name, bidCount }

    // Group division for tournament fixtures
    this.groupDivision = null;  // { groupA: [...teamIds], groupB: [...teamIds], tokenMap: {...} }
    this.fixtureSchedule = null; // persisted league schedule after drag-drop reordering
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
   * Build player pool with reserved players pinned at specific positions.
   * Reserved players: Ajay(pos 83), Nikil Shetty(85), Samith(86), Vijay(88), Rajesh Pollu(92)
   */
  _buildPlayerPool(players) {
    const reservedMap = [
      { name: 'Ajay',          position: 83 },
      { name: 'Nikil Shetty',  position: 85 },
      { name: 'Samith',        position: 86 },
      { name: 'Vijay',         position: 88 },
      { name: 'Rajesh Pollu',  position: 92 },
    ];

    const reservedNames = new Set(reservedMap.map(r => r.name));

    // Separate reserved from regular
    const reserved = [];
    const regular = [];
    for (const p of players) {
      if (reservedNames.has(p.name)) {
        reserved.push(p);
      } else {
        regular.push(p);
      }
    }

    // Shuffle regular players
    this._shuffle(regular);

    // Build final pool — start with regular players
    const pool = [...regular];

    // Insert reserved players at their specific positions (1-indexed → 0-indexed)
    // Sort by position descending so earlier inserts don't shift later positions
    const sortedReserved = reservedMap
      .map(r => ({ ...r, player: reserved.find(p => p.name === r.name) }))
      .filter(r => r.player) // only if player exists in pool
      .sort((a, b) => a.position - b.position);

    for (const r of sortedReserved) {
      const idx = Math.min(r.position - 1, pool.length); // 0-indexed, clamp to pool size
      pool.splice(idx, 0, r.player);
    }

    return pool;
  }

  /**
   * Get the bid increment based on the current bid amount.
   * Up to 10,000 → +500 | 10,000–20,000 → +1,000 | 20,000+ → +2,000
   * Maximum bid for a single player: 87,000 pts
   */
  static MAX_BID = 87000;

  getIncrement(bid) {
    if (bid >= AuctionEngine.MAX_BID) return 0;
    if (bid < 10000) return 500;
    if (bid < 20000) return 1000;
    return Math.min(2000, AuctionEngine.MAX_BID - bid);
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

    // Start timer
    this.resetTimer();

    this._log('nominate', {
      player: this.currentPlayer,
      index: this.playerIndex,
    });

    return this.currentPlayer;
  }

  // ── Timer ─────────────────────────────────────

  /** Reset the timer (called on nominate and each bid) */
  resetTimer() {
    this.timerStartTime = Date.now();
  }

  /** Get remaining seconds on the timer */
  getTimerRemaining() {
    if (!this.timerEnabled || !this.timerStartTime || this.phase !== 'bidding') return null;
    const elapsed = (Date.now() - this.timerStartTime) / 1000;
    return Math.max(0, this.timerDuration - elapsed);
  }

  /** Check if timer has expired */
  isTimerExpired() {
    if (!this.timerEnabled) return false;
    const remaining = this.getTimerRemaining();
    return remaining !== null && remaining <= 0;
  }

  /** Set timer duration (0 = disabled) */
  setTimerDuration(seconds) {
    this.timerDuration = Math.max(0, seconds);
    this.timerEnabled = this.timerDuration > 0;
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
    if (team.squad.length >= 13) return false;             // max squad
    if (this.currentBidder === teamId) return false;       // already highest bidder

    // Max bid cap reached
    if (this.currentBid >= AuctionEngine.MAX_BID) return false;

    const nextBid = this.getNextBidAmount();

    // Reserve enough purse for remaining minimum squad slots at base price
    const slotsAfterThis = Math.max(0, 13 - team.squad.length - 1);
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

    // Reset timer on each bid
    this.resetTimer();

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
    if (team.squad.length >= 13) return { success: false, error: 'Squad full' };

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
    const slotsAfterThis = Math.max(0, 13 - team.squad.length - 1);
    const reserve = slotsAfterThis * 1000;
    if (team.purse < amount + reserve) {
      return { success: false, error: 'Insufficient budget' };
    }

    // Save state for undo
    this._saveBidSnapshot();

    this.currentBid = amount;
    this.currentBidder = teamId;

    // Reset timer on each bid, including direct quick bids
    this.resetTimer();

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
    this.resetTimer();
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
    this.resetTimer();
    return true;
  }

  // ── Resolution ────────────────────────────────

  /** Sell the current player to the highest bidder. Returns the sale result or null. */
  sellPlayer() {
    if (this.phase !== 'bidding' || !this.currentBidder || !this.currentPlayer) {
      return null;
    }

    const team = this.teams.get(this.currentBidder);

    // Save snapshot for recall BEFORE mutating
    this.lastSale = {
      type: 'sold',
      player: { ...this.currentPlayer },
      teamId: this.currentBidder,
      price: this.currentBid,
      bidCount: this.bidHistory.length,
      // Team state before sale
      prevPurse: team.purse,
      prevTotalSpent: team.totalSpent,
      prevSquadLength: team.squad.length,
    };

    team.purse -= this.currentBid;
    team.totalSpent += this.currentBid;
    team.squad.push({
      ...this.currentPlayer,
      soldPrice: this.currentBid,
    });

    const bidCount = this.bidHistory.length;
    const result = {
      player: { ...this.currentPlayer },
      teamId: this.currentBidder,
      teamName: team.name,
      teamShortName: team.shortName,
      teamColor: team.color,
      price: this.currentBid,
      bidCount,
    };

    // Track player with most bids (for analytics)
    if (!this.maxBidsPlayer || bidCount > this.maxBidsPlayer.bidCount) {
      this.maxBidsPlayer = { name: this.currentPlayer.name, bidCount };
    }

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

    // Save snapshot for recall — unsold players can also be recalled
    this.lastSale = {
      type: 'unsold',
      player: { ...player },
    };

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

  // ── Recall Last Sale ─────────────────────────

  /** Check if the last sale can be recalled */
  canRecall() {
    return this.lastSale !== null && this.phase === 'waiting';
  }

  /**
   * Recall (reverse) the most recently sold or unsold player.
   * For sold: refunds the team's purse, removes the player from their squad.
   * For unsold: removes the player from the unsold list.
   * Re-opens bidding for that player at base price.
   * Returns the recalled player, or null if recall isn't possible.
   */
  recallLastSale() {
    if (!this.canRecall()) return null;

    const lastAction = this.lastSale;
    const player = lastAction.player;

    if (lastAction.type === 'unsold') {
      // Remove from unsoldPlayers
      for (let i = this.unsoldPlayers.length - 1; i >= 0; i--) {
        if (this.unsoldPlayers[i].name === player.name) {
          this.unsoldPlayers.splice(i, 1);
          break;
        }
      }

      // Log the recall
      this._log('recall', {
        player: { ...player },
        type: 'unsold',
      });
    } else {
      // type === 'sold' (default / legacy)
      const { teamId, price, prevPurse, prevTotalSpent, prevSquadLength } = lastAction;
      const team = this.teams.get(teamId);

      if (!team) return null;

      // Restore team financials
      team.purse = prevPurse;
      team.totalSpent = prevTotalSpent;

      // Remove the player from squad
      team.squad.length = prevSquadLength;

      // Remove from soldPlayers
      for (let i = this.soldPlayers.length - 1; i >= 0; i--) {
        if (this.soldPlayers[i].player.name === player.name && this.soldPlayers[i].teamId === teamId) {
          this.soldPlayers.splice(i, 1);
          break;
        }
      }

      // Log the recall
      this._log('recall', {
        player: { ...player },
        teamId,
        teamName: team.name,
        teamShortName: team.shortName,
        price,
        type: 'sold',
      });
    }

    // Re-open bidding for this player at base price
    this.currentPlayer = { ...player };
    this.currentBid = player.basePrice;
    this.currentBidder = null;
    this.bidHistory = [];
    this.bidUndoStack = [];
    this.bidRedoStack = [];
    this.phase = 'bidding';

    // Reset timer
    this.resetTimer();

    // Clear lastSale — can only recall once
    this.lastSale = null;

    return player;
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
      // Timer
      timerEnabled: this.timerEnabled,
      timerDuration: this.timerDuration,
      timerRemaining: this.getTimerRemaining(),
      timerStartTime: this.timerStartTime,
      // Analytics
      maxBidsPlayer: this.maxBidsPlayer,
      // Recall
      canRecall: this.canRecall(),
      lastSalePlayer: this.lastSale?.player?.name || null,
      lastSaleTeam: this.lastSale?.teamId ? this.teams.get(this.lastSale.teamId)?.shortName : null,
      lastSaleType: this.lastSale?.type || null,
      maxBid: AuctionEngine.MAX_BID,
      // Group Division
      groupDivision: this.groupDivision,
      fixtureSchedule: this.fixtureSchedule,
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
      timerDuration: this.timerDuration,
      timerEnabled: this.timerEnabled,
      timerStartTime: this.timerStartTime,
      maxBidsPlayer: this.maxBidsPlayer,
      lastSale: this.lastSale ? { ...this.lastSale } : null,
      groupDivision: this.groupDivision || null,
      fixtureSchedule: this.fixtureSchedule || null,
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
    engine.timerDuration = data.timerDuration ?? 30;
    engine.timerEnabled = data.timerEnabled ?? true;
    engine.timerStartTime = data.timerStartTime || null;
    engine.maxBidsPlayer = data.maxBidsPlayer || null;
    engine.lastSale = data.lastSale || null;
    engine.groupDivision = data.groupDivision || null;
    engine.fixtureSchedule = data.fixtureSchedule || null;
    return engine;
  }
}
