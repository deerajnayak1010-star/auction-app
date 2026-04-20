// ─────────────────────────────────────────────
// standings.js — Points Table & Standings Engine
// Computes league standings from completed scorecards
// ─────────────────────────────────────────────

export class StandingsEngine {
  /**
   * Compute full standings from scorecard matches.
   * @param {Array} matches - All matches from ScorecardManager
   * @param {Object} groupDivision - { groupA: [...ids], groupB: [...ids] }
   * @param {Array} teams - Team objects from auction state
   * @returns {Object} { groupA: [...standings], groupB: [...standings], knockouts }
   */
  static compute(matches, groupDivision, teams) {
    if (!groupDivision || !teams || teams.length === 0) return null;

    const teamMap = new Map(teams.map(t => [t.id, t]));

    // Initialize standings for all teams
    const standings = new Map();
    [...groupDivision.groupA, ...groupDivision.groupB].forEach(id => {
      standings.set(id, {
        teamId: id,
        team: teamMap.get(id) || { id, shortName: id, name: id, color: '#666', textColor: '#fff', logo: '' },
        played: 0,
        won: 0,
        lost: 0,
        noResult: 0,
        points: 0,
        runsScored: 0,
        oversFaced: 0,
        runsConceded: 0,
        oversBowled: 0,
        nrr: 0,
        form: [], // last 5 results: 'W', 'L', 'NR'
      });
    });

    // Process completed matches
    const completedMatches = matches.filter(m => m.status === 'completed');
    completedMatches.forEach(match => {
      const teamA = standings.get(match.teamAId);
      const teamB = standings.get(match.teamBId);
      if (!teamA || !teamB) return;

      teamA.played++;
      teamB.played++;

      // Parse overs to balls for NRR calculation
      const parseBalls = (oversStr) => {
        const o = parseFloat(oversStr) || 0;
        const fullOvers = Math.floor(o);
        const extraBalls = Math.round((o - fullOvers) * 10);
        return fullOvers * 6 + extraBalls;
      };

      // Innings 1: teamA bats
      const inn1Runs = match.innings1.totalRuns || 0;
      const inn1Balls = parseBalls(match.innings1.overs);
      // Innings 2: teamB bats
      const inn2Runs = match.innings2.totalRuns || 0;
      const inn2Balls = parseBalls(match.innings2.overs);

      // TeamA: scored inn1Runs in inn1Balls, conceded inn2Runs in inn2Balls
      teamA.runsScored += inn1Runs;
      teamA.oversFaced += inn1Balls;
      teamA.runsConceded += inn2Runs;
      teamA.oversBowled += inn2Balls;

      // TeamB: scored inn2Runs in inn2Balls, conceded inn1Runs in inn1Balls
      teamB.runsScored += inn2Runs;
      teamB.oversFaced += inn2Balls;
      teamB.runsConceded += inn1Runs;
      teamB.oversBowled += inn1Balls;

      // Determine winner
      const winnerId = match.result.winner;
      if (winnerId === match.teamAId) {
        teamA.won++;
        teamA.points += 2;
        teamA.form.push('W');
        teamB.lost++;
        teamB.form.push('L');
      } else if (winnerId === match.teamBId) {
        teamB.won++;
        teamB.points += 2;
        teamB.form.push('W');
        teamA.lost++;
        teamA.form.push('L');
      } else {
        teamA.noResult++;
        teamA.points += 1;
        teamA.form.push('T');
        teamB.noResult++;
        teamB.points += 1;
        teamB.form.push('T');
      }
    });

    // Calculate NRR for each team
    standings.forEach(s => {
      const oversFaced = s.oversFaced / 6;
      const oversBowled = s.oversBowled / 6;
      if (oversFaced > 0 && oversBowled > 0) {
        s.nrr = (s.runsScored / oversFaced) - (s.runsConceded / oversBowled);
      }
      // Keep last 5 form entries
      s.form = s.form.slice(-5);
    });

    // Sort function: Points desc, then NRR desc, then wins desc
    const sortStandings = (ids) => {
      return ids
        .map(id => standings.get(id))
        .filter(Boolean)
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (Math.abs(b.nrr - a.nrr) > 0.001) return b.nrr - a.nrr;
          return b.won - a.won;
        });
    };

    const groupAStandings = sortStandings(groupDivision.groupA);
    const groupBStandings = sortStandings(groupDivision.groupB);

    // Determine knockout bracket (IPL-style playoff)
    const knockouts = {
      qualifier1: { teamA: groupAStandings[0] || null, teamB: groupBStandings[0] || null, label: 'Qualifier 1' },
      eliminator: { teamA: groupAStandings[1] || null, teamB: groupBStandings[1] || null, label: 'Eliminator' },
      qualifier2: { teamA: null, teamB: null, label: 'Qualifier 2' }, // Loser Q1 vs Winner Eliminator
      final: { teamA: null, teamB: null, label: 'FINAL' }, // Winner Q1 vs Winner Q2
    };

    return {
      groupA: groupAStandings,
      groupB: groupBStandings,
      knockouts,
      completedCount: completedMatches.length,
    };
  }

  /**
   * Format NRR for display
   */
  static formatNRR(nrr) {
    if (nrr === 0) return '+0.000';
    const sign = nrr >= 0 ? '+' : '';
    return sign + nrr.toFixed(3);
  }
}
