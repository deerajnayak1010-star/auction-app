// ─────────────────────────────────────────────
// awards.js — Award Ceremony Engine
// Cinematic awards with sequential reveal
// ─────────────────────────────────────────────

export class AwardsEngine {
  /**
   * Compute all award winners from scorecard data + auction data.
   * @param {Array} matches - Completed matches from ScorecardManager
   * @param {Array} teams - Teams from auction state
   * @param {Array} soldPlayers - Sold player records
   * @returns {Array} Award objects for ceremony
   */
  static computeAwards(matches, teams, soldPlayers = []) {
    const completedMatches = matches.filter(m => m.status === 'completed');
    const awards = [];

    // Player aggregation
    const playerStats = new Map();
    const teamMap = new Map(teams.map(t => [t.id, t]));

    // Build player-team mapping
    const playerTeam = new Map();
    teams.forEach(team => {
      if (team.squad) {
        team.squad.forEach(p => playerTeam.set(p.name, { teamId: team.id, team }));
      }
      if (team.owner) playerTeam.set(team.owner, { teamId: team.id, team });
      if (team.iconPlayer) playerTeam.set(team.iconPlayer, { teamId: team.id, team });
    });

    const ensure = (name) => {
      if (!playerStats.has(name)) {
        const t = playerTeam.get(name);
        playerStats.set(name, {
          name,
          team: t?.team || null,
          teamShort: t?.team?.shortName || '?',
          teamColor: t?.team?.color || '#666',
          runs: 0, balls: 0, fours: 0, sixes: 0,
          wickets: 0, overs: 0, runsConceded: 0,
          motmCount: 0, matches: 0,
          highScore: 0, bestWkts: 0, bestRuns: 999,
          innings: 0,
        });
      }
      return playerStats.get(name);
    };

    completedMatches.forEach(match => {
      if (match.result.playerOfMatch) {
        ensure(match.result.playerOfMatch).motmCount++;
      }

      const playersInMatch = new Set();
      [match.innings1, match.innings2].forEach(inn => {
        inn.batting.forEach(b => {
          if (!b.didBat && !b.runs) return;
          const runs = parseInt(b.runs) || 0;
          if (runs === 0 && !b.didBat) return;
          const p = ensure(b.name);
          p.runs += runs;
          p.balls += parseInt(b.balls) || 0;
          p.fours += parseInt(b.fours) || 0;
          p.sixes += parseInt(b.sixes) || 0;
          p.innings++;
          if (runs > p.highScore) p.highScore = runs;
          playersInMatch.add(b.name);
        });
        inn.bowling.forEach(b => {
          if (!b.didBowl && !b.wickets) return;
          const wkts = parseInt(b.wickets) || 0;
          const runs = parseInt(b.runs) || 0;
          const overs = parseFloat(b.overs) || 0;
          if (overs === 0 && wkts === 0) return;
          const p = ensure(b.name);
          p.wickets += wkts;
          p.overs += overs;
          p.runsConceded += runs;
          if (wkts > p.bestWkts || (wkts === p.bestWkts && runs < p.bestRuns)) {
            p.bestWkts = wkts;
            p.bestRuns = runs;
          }
          playersInMatch.add(b.name);
        });
      });
      playersInMatch.forEach(name => ensure(name).matches++);
    });

    const all = [...playerStats.values()].filter(p => p.matches > 0);

    // ── 1. Champion Team ──
    // Placeholder — needs to be set manually or computed from knockout results
    awards.push({
      id: 'champion',
      icon: '🏆',
      title: 'CHAMPION TEAM',
      category: 'Team Award',
      gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
      winner: null, // To be set during ceremony
      stat: '',
      desc: 'NPL 3.0 Champions',
      isTeamAward: true,
      isRevealed: false,
    });

    // ── 2. Man of the Series ──
    const mots = [...all].sort((a, b) => (b.runs + b.wickets * 25) - (a.runs + a.wickets * 25))[0];
    awards.push({
      id: 'mots',
      icon: '⭐',
      title: 'MAN OF THE SERIES',
      category: 'Individual Award',
      gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
      winner: mots?.name || null,
      team: mots?.teamShort || '',
      teamColor: mots?.teamColor || '#666',
      stat: mots ? `${mots.runs} runs, ${mots.wickets} wkts` : '',
      desc: 'Best Overall Performer',
      isRevealed: false,
    });

    // ── 3. Best Batsman (Orange Cap) ──
    const orangeCap = [...all].sort((a, b) => b.runs - a.runs)[0];
    awards.push({
      id: 'orange-cap',
      icon: '🏏',
      title: 'ORANGE CAP',
      subtitle: 'Best Batsman',
      category: 'Batting Award',
      gradient: 'linear-gradient(135deg, #f97316, #ea580c)',
      winner: orangeCap?.name || null,
      team: orangeCap?.teamShort || '',
      teamColor: orangeCap?.teamColor || '#666',
      stat: orangeCap ? `${orangeCap.runs} runs (SR: ${orangeCap.balls > 0 ? ((orangeCap.runs/orangeCap.balls)*100).toFixed(1) : '0'})` : '',
      desc: 'Most Tournament Runs',
      isRevealed: false,
    });

    // ── 4. Best Bowler (Purple Cap) ──
    const purpleCap = [...all].filter(p => p.wickets > 0).sort((a, b) => {
      if (b.wickets !== a.wickets) return b.wickets - a.wickets;
      const ecoA = a.overs > 0 ? a.runsConceded / a.overs : 999;
      const ecoB = b.overs > 0 ? b.runsConceded / b.overs : 999;
      return ecoA - ecoB;
    })[0];
    awards.push({
      id: 'purple-cap',
      icon: '🎯',
      title: 'PURPLE CAP',
      subtitle: 'Best Bowler',
      category: 'Bowling Award',
      gradient: 'linear-gradient(135deg, #a855f7, #7c3aed)',
      winner: purpleCap?.name || null,
      team: purpleCap?.teamShort || '',
      teamColor: purpleCap?.teamColor || '#666',
      stat: purpleCap ? `${purpleCap.wickets} wkts (Best: ${purpleCap.bestWkts}/${purpleCap.bestRuns})` : '',
      desc: 'Most Tournament Wickets',
      isRevealed: false,
    });

    // ── 5. Best All-Rounder ──
    const bestAR = all.filter(p => p.runs > 0 && p.wickets > 0)
      .sort((a, b) => (b.runs + b.wickets * 25) - (a.runs + a.wickets * 25))[0];
    awards.push({
      id: 'best-ar',
      icon: '💫',
      title: 'BEST ALL-ROUNDER',
      category: 'All-Round Award',
      gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
      winner: bestAR?.name || null,
      team: bestAR?.teamShort || '',
      teamColor: bestAR?.teamColor || '#666',
      stat: bestAR ? `${bestAR.runs} runs & ${bestAR.wickets} wkts` : '',
      desc: 'Best Combined Performance',
      isRevealed: false,
    });

    // ── 6. Most Sixes ──
    const mostSixes = [...all].filter(p => p.sixes > 0).sort((a, b) => b.sixes - a.sixes)[0];
    awards.push({
      id: 'most-sixes',
      icon: '💥',
      title: 'MAXIMUM SIXES',
      category: 'Power Hitting Award',
      gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
      winner: mostSixes?.name || null,
      team: mostSixes?.teamShort || '',
      teamColor: mostSixes?.teamColor || '#666',
      stat: mostSixes ? `${mostSixes.sixes} sixes in ${mostSixes.matches} matches` : '',
      desc: 'Most Sixes in Tournament',
      isRevealed: false,
    });

    // ── 7. Best Strike Rate ──
    const bestSR = [...all].filter(p => p.balls >= 20)
      .sort((a, b) => (b.runs/b.balls) - (a.runs/a.balls))[0];
    awards.push({
      id: 'best-sr',
      icon: '⚡',
      title: 'FASTEST STRIKER',
      category: 'Batting Award',
      gradient: 'linear-gradient(135deg, #eab308, #ca8a04)',
      winner: bestSR?.name || null,
      team: bestSR?.teamShort || '',
      teamColor: bestSR?.teamColor || '#666',
      stat: bestSR ? `SR: ${((bestSR.runs/bestSR.balls)*100).toFixed(1)} (${bestSR.runs} off ${bestSR.balls})` : '',
      desc: 'Best Strike Rate (min 20 balls)',
      isRevealed: false,
    });

    // ── 8. Most Valuable Auction Pick ──
    const mvpAuction = [...(soldPlayers || [])].sort((a, b) => b.price - a.price)[0];
    awards.push({
      id: 'mvp-auction',
      icon: '💰',
      title: 'AUCTION MVP',
      category: 'Auction Award',
      gradient: 'linear-gradient(135deg, #10b981, #059669)',
      winner: mvpAuction?.player?.name || null,
      team: mvpAuction?.teamShortName || '',
      teamColor: mvpAuction?.teamColor || '#666',
      stat: mvpAuction ? `Bought for ${mvpAuction.price?.toLocaleString('en-IN')} pts` : '',
      desc: 'Highest Auction Price',
      isRevealed: false,
    });

    // ── 9. Best Value Pick ──
    const valuePicks = all.filter(p => {
      const sold = soldPlayers?.find(s => s.player?.name === p.name);
      return sold && sold.price > 0;
    }).map(p => {
      const sold = soldPlayers.find(s => s.player?.name === p.name);
      const impact = p.runs + p.wickets * 25;
      const value = impact / (sold.price / 1000);
      return { ...p, soldPrice: sold.price, impact, value };
    }).sort((a, b) => b.value - a.value);

    const bestValue = valuePicks[0];
    awards.push({
      id: 'best-value',
      icon: '🌟',
      title: 'BEST VALUE PICK',
      category: 'Smart Buy Award',
      gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)',
      winner: bestValue?.name || null,
      team: bestValue?.teamShort || '',
      teamColor: bestValue?.teamColor || '#666',
      stat: bestValue ? `${bestValue.impact} impact @ ${bestValue.soldPrice?.toLocaleString('en-IN')} pts` : '',
      desc: 'Most Impact Per Point Spent',
      isRevealed: false,
    });

    // ── 10. Most MOTM Awards ──
    const mostMotm = [...all].filter(p => p.motmCount > 0).sort((a, b) => b.motmCount - a.motmCount)[0];
    if (mostMotm && mostMotm.motmCount > 1) {
      awards.push({
        id: 'most-motm',
        icon: '🏅',
        title: 'MR. CONSISTENT',
        category: 'Consistency Award',
        gradient: 'linear-gradient(135deg, #f472b6, #ec4899)',
        winner: mostMotm.name,
        team: mostMotm.teamShort,
        teamColor: mostMotm.teamColor,
        stat: `${mostMotm.motmCount} Man of the Match awards`,
        desc: 'Most MOTM Awards',
        isRevealed: false,
      });
    }

    return awards;
  }
}
