// ─────────────────────────────────────────────
// scorecard.js — Cricket Match Scorecard Manager
// Full match scoring: batting, bowling, extras, FOW, results, honours
// ─────────────────────────────────────────────

export class ScorecardManager {
  constructor() {
    this.matches = new Map(); // matchId → matchData
  }

  /**
   * Create a blank scorecard for a match.
   * Pre-populates teams and players from auction squads.
   */
  createMatch(matchId, teamA, teamB, opts = {}) {
    const blankInnings = (battingTeamId, bowlingTeamId, battingSquad, bowlingSquad) => ({
      battingTeamId,
      bowlingTeamId,
      totalRuns: 0,
      wickets: 0,
      overs: '0.0',
      runRate: 0,
      target: null,
      batting: battingSquad.map(p => ({
        playerId: p.id || p.name,
        name: p.name,
        runs: '',
        balls: '',
        fours: '',
        sixes: '',
        strikeRate: '',
        dismissal: '',
        isNotOut: false,
        didBat: false,
      })),
      bowling: bowlingSquad.map(p => ({
        playerId: p.id || p.name,
        name: p.name,
        overs: '',
        maidens: '',
        runs: '',
        wickets: '',
        economy: '',
        didBowl: false,
      })),
      extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0, total: 0 },
      fallOfWickets: [],
    });

    const match = {
      matchId,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      teamAShort: teamA.shortName,
      teamBShort: teamB.shortName,
      teamAColor: teamA.color,
      teamBColor: teamB.color,
      teamATextColor: teamA.textColor,
      teamBTextColor: teamB.textColor,
      teamALogo: teamA.logo,
      teamBLogo: teamB.logo,

      venue: opts.venue || 'Nakre Ground',
      date: opts.date || '',
      time: opts.time || '',
      matchType: opts.matchType || 'T20',
      oversLimit: opts.oversLimit || 20,
      tossWinner: '',
      tossDecision: '',

      innings1: blankInnings(teamA.id, teamB.id, teamA.squad || [], teamB.squad || []),
      innings2: blankInnings(teamB.id, teamA.id, teamB.squad || [], teamA.squad || []),

      result: {
        winner: '',
        margin: '',
        playerOfMatch: '',
        playerOfMatchTeam: '',
      },

      status: 'upcoming', // upcoming | live | completed
    };

    this.matches.set(matchId, match);
    return match;
  }

  syncFixtureMatch(matchId, teamA, teamB, opts = {}) {
    const existing = this.matches.get(matchId);
    if (!existing || existing.status === 'upcoming') {
      return this.createMatch(matchId, teamA, teamB, opts);
    }

    this.updateMatchInfo(matchId, opts);
    return existing;
  }

  getMatch(matchId) {
    return this.matches.get(matchId) || null;
  }

  getAllMatches() {
    return [...this.matches.values()];
  }

  /**
   * Update an innings with form data.
   * data = { batting: [...], bowling: [...], extras: {...}, totalRuns, wickets, overs }
   */
  updateInnings(matchId, inningsNum, data) {
    const match = this.matches.get(matchId);
    if (!match) return false;

    const inn = inningsNum === 1 ? match.innings1 : match.innings2;

    if (data.batting) inn.batting = data.batting;
    if (data.bowling) inn.bowling = data.bowling;
    if (data.extras) {
      inn.extras = { ...data.extras };
      inn.extras.total = (parseInt(data.extras.wides) || 0) +
                         (parseInt(data.extras.noBalls) || 0) +
                         (parseInt(data.extras.byes) || 0) +
                         (parseInt(data.extras.legByes) || 0) +
                         (parseInt(data.extras.penalty) || 0);
    }
    if (data.totalRuns !== undefined) inn.totalRuns = parseInt(data.totalRuns) || 0;
    if (data.wickets !== undefined) inn.wickets = parseInt(data.wickets) || 0;
    if (data.overs !== undefined) inn.overs = data.overs;
    if (data.fallOfWickets) inn.fallOfWickets = data.fallOfWickets;

    // Calculate run rate
    const oversNum = parseFloat(inn.overs) || 0;
    inn.runRate = oversNum > 0 ? (inn.totalRuns / oversNum).toFixed(2) : '0.00';

    // 2nd innings target
    if (inningsNum === 2) {
      inn.target = match.innings1.totalRuns + 1;
    }

    return true;
  }

  /**
   * Set match result.
   */
  setResult(matchId, winner, margin, potmName, potmTeam) {
    const match = this.matches.get(matchId);
    if (!match) return false;

    match.result = {
      winner,
      margin,
      playerOfMatch: potmName,
      playerOfMatchTeam: potmTeam,
    };
    match.status = 'completed';
    return true;
  }

  setMatchStatus(matchId, status) {
    const match = this.matches.get(matchId);
    if (match) match.status = status;
  }

  /**
   * Update match header info.
   */
  updateMatchInfo(matchId, info) {
    const match = this.matches.get(matchId);
    if (!match) return;
    if (info.date !== undefined) match.date = info.date;
    if (info.time !== undefined) match.time = info.time;
    if (info.venue !== undefined) match.venue = info.venue;
    if (info.tossWinner !== undefined) match.tossWinner = info.tossWinner;
    if (info.tossDecision !== undefined) match.tossDecision = info.tossDecision;
    if (info.matchType !== undefined) match.matchType = info.matchType;
    if (info.oversLimit !== undefined) match.oversLimit = info.oversLimit;
  }

  /**
   * Compute tournament-wide Individual Honours from completed match data.
   * Returns { motm, mots, bestBatsman, bestBowler, bestAllRounder }
   */
  computeHonours() {
    const completedMatches = this.getAllMatches().filter(m => m.status === 'completed');
    if (completedMatches.length === 0) return null;

    // Aggregate player stats across all matches
    const playerStats = new Map(); // name → { runs, wickets, motmCount, matches, teamId }

    completedMatches.forEach(match => {
      // Man of the Match counts
      if (match.result.playerOfMatch) {
        const key = match.result.playerOfMatch;
        if (!playerStats.has(key)) playerStats.set(key, { runs: 0, wickets: 0, motmCount: 0, matches: 0, team: '' });
        playerStats.get(key).motmCount++;
        playerStats.get(key).team = match.result.playerOfMatchTeam || '';
      }

      // Aggregate batting/bowling from both innings
      [match.innings1, match.innings2].forEach(inn => {
        inn.batting.forEach(b => {
          if (!b.didBat && !b.runs) return;
          const runs = parseInt(b.runs) || 0;
          if (!playerStats.has(b.name)) playerStats.set(b.name, { runs: 0, wickets: 0, motmCount: 0, matches: 0, team: '' });
          const ps = playerStats.get(b.name);
          ps.runs += runs;
          ps.matches++;
        });

        inn.bowling.forEach(b => {
          if (!b.didBowl && !b.wickets) return;
          const wkts = parseInt(b.wickets) || 0;
          if (!playerStats.has(b.name)) playerStats.set(b.name, { runs: 0, wickets: 0, motmCount: 0, matches: 0, team: '' });
          playerStats.get(b.name).wickets += wkts;
        });
      });
    });

    const entries = [...playerStats.entries()].map(([name, stats]) => ({ name, ...stats }));

    // Man of the Match: player with most MOTM awards
    const motm = entries.filter(e => e.motmCount > 0).sort((a, b) => b.motmCount - a.motmCount)[0] || null;

    // Man of the Series: best overall performer (runs + wickets*25)
    const mots = [...entries].sort((a, b) => (b.runs + b.wickets * 25) - (a.runs + a.wickets * 25))[0] || null;

    // Best Batsman: most runs
    const bestBatsman = [...entries].sort((a, b) => b.runs - a.runs)[0] || null;

    // Best Bowler: most wickets
    const bestBowler = [...entries].sort((a, b) => b.wickets - a.wickets)[0] || null;

    // Best All-Rounder: best combined (runs + wickets*25), must have both
    const bestAllRounder = entries.filter(e => e.runs > 0 && e.wickets > 0)
      .sort((a, b) => (b.runs + b.wickets * 25) - (a.runs + a.wickets * 25))[0] || null;

    return { motm, mots, bestBatsman, bestBowler, bestAllRounder, completedCount: completedMatches.length };
  }

  // ── Serialization ──

  serialize() {
    const arr = [];
    for (const [id, match] of this.matches) {
      arr.push({ ...match });
    }
    return arr;
  }

  static restore(data) {
    const mgr = new ScorecardManager();
    if (Array.isArray(data)) {
      data.forEach(m => mgr.matches.set(m.matchId, { ...m }));
    }
    return mgr;
  }
}
