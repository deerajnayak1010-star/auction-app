// ─────────────────────────────────────────────
// player-cards.js — Player Performance Cards & Leaderboards
// Aggregates tournament stats from completed scorecards
// ─────────────────────────────────────────────

export class PlayerCardsEngine {
  /**
   * Aggregate all player stats from completed scorecards.
   * @param {Array} matches - All matches from ScorecardManager
   * @param {Array} teams - Team objects from auction state
   * @param {Array} soldPlayers - Sold player records from auction
   * @returns {Object} { players: Map, leaderboards }
   */
  static aggregate(matches, teams, soldPlayers = []) {
    const completedMatches = matches.filter(m => m.status === 'completed');
    const playerStats = new Map(); // name → stats

    // Build team lookup from auction data
    const playerTeamMap = new Map();
    if (teams) {
      teams.forEach(team => {
        if (team.squad) {
          team.squad.forEach(p => {
            playerTeamMap.set(p.name, {
              teamId: team.id,
              teamName: team.name,
              teamShort: team.shortName,
              teamColor: team.color,
              teamLogo: team.logo,
              soldPrice: p.soldPrice || 0,
            });
          });
        }
        // Owner and icon player
        if (team.owner) playerTeamMap.set(team.owner, { teamId: team.id, teamName: team.name, teamShort: team.shortName, teamColor: team.color, teamLogo: team.logo, soldPrice: 0 });
        if (team.iconPlayer) playerTeamMap.set(team.iconPlayer, { teamId: team.id, teamName: team.name, teamShort: team.shortName, teamColor: team.color, teamLogo: team.logo, soldPrice: 0 });
      });
    }

    const ensurePlayer = (name) => {
      if (!playerStats.has(name)) {
        const teamInfo = playerTeamMap.get(name) || {};
        playerStats.set(name, {
          name,
          teamId: teamInfo.teamId || '',
          teamName: teamInfo.teamName || '',
          teamShort: teamInfo.teamShort || '',
          teamColor: teamInfo.teamColor || '#666',
          teamLogo: teamInfo.teamLogo || '',
          soldPrice: teamInfo.soldPrice || 0,
          // Batting
          matches: 0,
          innings: 0,
          runs: 0,
          ballsFaced: 0,
          fours: 0,
          sixes: 0,
          highestScore: 0,
          highestScoreNotOut: false,
          notOuts: 0,
          fifties: 0,
          thirties: 0,
          ducks: 0,
          // Bowling
          bowlingInnings: 0,
          oversBowled: 0,
          runsConceded: 0,
          wickets: 0,
          maidens: 0,
          bestBowlingWkts: 0,
          bestBowlingRuns: 999,
          // Awards
          motmCount: 0,
        });
      }
      return playerStats.get(name);
    };

    completedMatches.forEach(match => {
      // MOTM
      if (match.result.playerOfMatch) {
        ensurePlayer(match.result.playerOfMatch).motmCount++;
      }

      // Process both innings
      [match.innings1, match.innings2].forEach(inn => {
        // Batting
        inn.batting.forEach(b => {
          if (!b.didBat && !b.runs && b.runs !== 0) return;
          const runs = parseInt(b.runs) || 0;
          const balls = parseInt(b.balls) || 0;
          const fours = parseInt(b.fours) || 0;
          const sixes = parseInt(b.sixes) || 0;
          if (runs === 0 && balls === 0 && !b.didBat) return;

          const p = ensurePlayer(b.name);
          p.innings++;
          p.runs += runs;
          p.ballsFaced += balls;
          p.fours += fours;
          p.sixes += sixes;

          if (b.isNotOut) p.notOuts++;
          if (runs >= 50) p.fifties++;
          else if (runs >= 30) p.thirties++;
          if (runs === 0 && !b.isNotOut && b.didBat) p.ducks++;

          if (runs > p.highestScore || (runs === p.highestScore && b.isNotOut && !p.highestScoreNotOut)) {
            p.highestScore = runs;
            p.highestScoreNotOut = b.isNotOut;
          }
        });

        // Bowling
        inn.bowling.forEach(b => {
          if (!b.didBowl && !b.wickets && !b.overs) return;
          const overs = parseFloat(b.overs) || 0;
          const runs = parseInt(b.runs) || 0;
          const wkts = parseInt(b.wickets) || 0;
          const maidens = parseInt(b.maidens) || 0;
          if (overs === 0 && wkts === 0) return;

          const p = ensurePlayer(b.name);
          p.bowlingInnings++;
          p.oversBowled += overs;
          p.runsConceded += runs;
          p.wickets += wkts;
          p.maidens += maidens;

          // Best bowling figures
          if (wkts > p.bestBowlingWkts || (wkts === p.bestBowlingWkts && runs < p.bestBowlingRuns)) {
            p.bestBowlingWkts = wkts;
            p.bestBowlingRuns = runs;
          }
        });
      });

      // Count unique match appearances
      const playersInMatch = new Set();
      [match.innings1, match.innings2].forEach(inn => {
        inn.batting.forEach(b => { if (b.didBat || b.runs) playersInMatch.add(b.name); });
        inn.bowling.forEach(b => { if (b.didBowl || b.overs) playersInMatch.add(b.name); });
      });
      playersInMatch.forEach(name => {
        ensurePlayer(name).matches++;
      });
    });

    // Compute derived stats
    playerStats.forEach(p => {
      p.strikeRate = p.ballsFaced > 0 ? ((p.runs / p.ballsFaced) * 100).toFixed(1) : '0.0';
      p.average = (p.innings - p.notOuts) > 0 ? (p.runs / (p.innings - p.notOuts)).toFixed(1) : (p.runs > 0 ? p.runs.toFixed(1) : '0.0');
      p.economy = p.oversBowled > 0 ? (p.runsConceded / p.oversBowled).toFixed(2) : '0.00';
      p.bowlingAvg = p.wickets > 0 ? (p.runsConceded / p.wickets).toFixed(1) : '-';
      p.bestBowling = p.bestBowlingWkts > 0 ? `${p.bestBowlingWkts}/${p.bestBowlingRuns}` : '-';

      // Impact score for radar chart (0-100 scale)
      p.impactBatting = Math.min(100, (p.runs / Math.max(completedMatches.length * 30, 1)) * 100);
      p.impactBowling = Math.min(100, (p.wickets / Math.max(completedMatches.length * 2, 1)) * 100);
      p.impactFielding = Math.min(100, 40 + Math.random() * 30); // Placeholder since we don't track fielding
      p.impactConsistency = p.innings > 0 ? Math.min(100, (1 - (p.ducks / p.innings)) * (p.thirties + p.fifties) / Math.max(p.innings, 1) * 200) : 0;
      p.impactScore = Math.min(100, ((p.runs * 1) + (p.wickets * 25) + (p.motmCount * 30)) / Math.max(completedMatches.length * 3, 1) * 10);
    });

    // Build leaderboards
    const allPlayers = [...playerStats.values()].filter(p => p.matches > 0);
    const leaderboards = {
      topRunScorers: [...allPlayers].sort((a, b) => b.runs - a.runs).slice(0, 10),
      topWicketTakers: [...allPlayers].filter(p => p.wickets > 0).sort((a, b) => {
        if (b.wickets !== a.wickets) return b.wickets - a.wickets;
        return parseFloat(a.economy) - parseFloat(b.economy);
      }).slice(0, 10),
      bestStrikeRate: [...allPlayers].filter(p => p.ballsFaced >= 10).sort((a, b) => parseFloat(b.strikeRate) - parseFloat(a.strikeRate)).slice(0, 10),
      bestEconomy: [...allPlayers].filter(p => p.oversBowled >= 2).sort((a, b) => parseFloat(a.economy) - parseFloat(b.economy)).slice(0, 10),
      mostSixes: [...allPlayers].filter(p => p.sixes > 0).sort((a, b) => b.sixes - a.sixes).slice(0, 10),
      mostFours: [...allPlayers].filter(p => p.fours > 0).sort((a, b) => b.fours - a.fours).slice(0, 10),
      mostMotm: [...allPlayers].filter(p => p.motmCount > 0).sort((a, b) => b.motmCount - a.motmCount).slice(0, 5),
      bestValue: [...allPlayers].filter(p => p.soldPrice > 0 && p.runs + p.wickets * 25 > 0).sort((a, b) => {
        const valA = (a.runs + a.wickets * 25) / (a.soldPrice / 1000);
        const valB = (b.runs + b.wickets * 25) / (b.soldPrice / 1000);
        return valB - valA;
      }).slice(0, 5),
    };

    return { players: playerStats, leaderboards, matchCount: completedMatches.length };
  }
}
