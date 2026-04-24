// ─────────────────────────────────────────────
// preload-data.js — Permanent Preload Data & Snapshot Builder
// ─────────────────────────────────────────────

/**
 * Hardcoded permanent preload data parsed from NPL3_2026_All_Squads.xlsx.
 * All 8 teams with their complete squad data from the completed NPL 3.0 2026 auction.
 */
export const PERMANENT_PRELOAD_DATA = {
  label: 'NPL 3.0 Auction',
  teams: [
    // ── 1. Addalu Javaner (AJ) ──
    {
      teamName: 'Addalu Javaner',
      owner: 'Prashanth Acharya',
      iconPlayer: 'Akshay Acharya',
      players: [
        { name: 'Adarsh A',           role: 'Batsman',     price: 8500 },
        { name: 'Charan IK',          role: 'All-Rounder', price: 20000 },
        { name: 'Harshith',           role: 'All-Rounder', price: 4000 },
        { name: 'Harish Shetty',      role: 'All-Rounder', price: 1500 },
        { name: 'Sunil IK',           role: 'All-Rounder', price: 2500 },
        { name: 'Prakash Kenchal',    role: 'Bowler',      price: 14000 },
        { name: 'Sujith',             role: 'All-Rounder', price: 7000 },
        { name: 'Adarsh Acharya',     role: 'All-Rounder', price: 2500 },
        { name: 'Nagu Parapu',        role: 'All-Rounder', price: 13000 },
        { name: 'Dinesh Shetty',      role: 'All-Rounder', price: 8500 },
        { name: 'Sukesh Posanottu',   role: 'All-Rounder', price: 3500 },
        { name: 'Somesh DFC',         role: 'Batsman',     price: 7500 },
      ],
    },

    // ── 2. B.F.C Legends (BFCL) ──
    {
      teamName: 'B.F.C Legends',
      owner: 'Suraj Shetty',
      iconPlayer: 'Deepak Hegde',
      players: [
        { name: 'Deekshith Acharya',  role: 'Batsman',     price: 3500 },
        { name: 'Manish IK',          role: 'Batsman',     price: 5500 },
        { name: 'Sameeth Shetty',     role: 'All-Rounder', price: 2500 },
        { name: 'Girish Posanottu',   role: 'All-Rounder', price: 6500 },
        { name: 'Arun Shetty',        role: 'All-Rounder', price: 1000 },
        { name: 'Jeevan Shetty',      role: 'All-Rounder', price: 28000 },
        { name: 'Preethu',            role: 'Bowler',      price: 3000 },
        { name: 'Ajith Acharya',      role: 'All-Rounder', price: 2000 },
        { name: 'Sam Nakre',          role: 'All-Rounder', price: 3000 },
        { name: 'Preethesh',          role: 'Batsman',     price: 6000 },
        { name: 'Jags Shetty',        role: 'All-Rounder', price: 3000 },
        { name: 'Rajesh Pollu',       role: 'Batsman',     price: 20000 },
        { name: 'Manvith Nakre',      role: 'Batsman',     price: 1000 },
      ],
    },

    // ── 3. B.F.C ──
    {
      teamName: 'B.F.C',
      owner: 'Deekshith Hegde',
      iconPlayer: 'Sunil Shetty',
      players: [
        { name: 'Ashwath Nakre',      role: 'All-Rounder', price: 1000 },
        { name: 'Arjun Acharya',      role: 'Batsman',     price: 2000 },
        { name: 'Santhosh Mendis',    role: 'All-Rounder', price: 1500 },
        { name: 'Amith Nakre',        role: 'All-Rounder', price: 3000 },
        { name: 'Deeraj Hegde',       role: 'All-Rounder', price: 1000 },
        { name: 'Suresh Chikka',      role: 'All-Rounder', price: 2000 },
        { name: 'Atheeth Kumar',      role: 'Batsman',     price: 1000 },
        { name: 'Rakshith Poojary',   role: 'All-Rounder', price: 26000 },
        { name: 'Akshath Acharya',    role: 'All-Rounder', price: 20000 },
        { name: 'Shailu',             role: 'All-Rounder', price: 3000 },
        { name: 'Nithin Shetty',      role: 'All-Rounder', price: 1000 },
        { name: 'Sukesh Shetty',      role: 'All-Rounder', price: 7000 },
        { name: 'Nagesh Posanottu',   role: 'All-Rounder', price: 20000 },
      ],
    },

    // ── 4. Yuva Sanghama Cricketers (YSC) ──
    {
      teamName: 'Yuva Sanghama Cricketers',
      owner: 'Suresh',
      iconPlayer: 'Santhosh',
      players: [
        { name: 'Lokesh',             role: 'Batsman',     price: 1000 },
        { name: 'Shashi IK',          role: 'Batsman',     price: 1000 },
        { name: 'Keshava',            role: 'Batsman',     price: 1000 },
        { name: 'Prajwith Shetty',    role: 'Batsman',     price: 1000 },
        { name: 'Kiran IK',           role: 'Batsman',     price: 1500 },
        { name: 'Deepu IK',           role: 'All-Rounder', price: 2000 },
        { name: 'Sharath',            role: 'All-Rounder', price: 3500 },
        { name: 'Nithesh Kallamundkur', role: 'All-Rounder', price: 4500 },
        { name: 'Nikil Shetty',       role: 'All-Rounder', price: 76000 },
        { name: 'Vighnesh Kotian',    role: 'Batsman',     price: 1500 },
        { name: 'Ranjan',             role: 'Bowler',      price: 1000 },
        { name: 'Krapal Dsouza',      role: 'Batsman',     price: 1000 },
        { name: 'Ganesh Acharya',     role: 'All-Rounder', price: 1000 },
      ],
    },

    // ── 5. D.F.C Nakre (DFC) ──
    {
      teamName: 'D.F.C Nakre',
      owner: 'Nitesh',
      iconPlayer: 'Rakesh',
      players: [
        { name: 'Sudhakara Sacchu',   role: 'All-Rounder', price: 1000 },
        { name: 'Royson IK',          role: 'All-Rounder', price: 3000 },
        { name: 'Adarsh Nakre',       role: 'Batsman',     price: 1000 },
        { name: 'Ashwath',            role: 'All-Rounder', price: 6500 },
        { name: 'Sanu Manigudde',     role: 'All-Rounder', price: 5500 },
        { name: 'Manish DFC',         role: 'Bowler',      price: 3500 },
        { name: 'Akshath Manigudde',  role: 'All-Rounder', price: 34000 },
        { name: 'Ajay',               role: 'All-Rounder', price: 38000 },
        { name: 'Ganesh Ponnedaguri', role: 'All-Rounder', price: 1000 },
        { name: 'Chiraj Nakre',       role: 'Batsman',     price: 1000 },
        { name: 'Umesh',              role: 'All-Rounder', price: 2000 },
        { name: 'Prajan Shetty',      role: 'All-Rounder', price: 1000 },
        { name: 'Sandeep Bandary',    role: 'Batsman',     price: 1000 },
      ],
    },

    // ── 6. New Eleven Nakre (NEN) ──
    {
      teamName: 'New Eleven Nakre',
      owner: 'Ajay',
      iconPlayer: 'Prajwal',
      players: [
        { name: 'Rakshith',           role: 'All-Rounder', price: 4000 },
        { name: 'Nagraj Kadpa',       role: 'All-Rounder', price: 1000 },
        { name: 'Karthik Rao',        role: 'All-Rounder', price: 4000 },
        { name: 'Preetham',           role: 'All-Rounder', price: 30000 },
        { name: 'Kaushik',            role: 'Batsman',     price: 1000 },
        { name: 'Santhosh Kumar',     role: 'Bowler',      price: 7000 },
        { name: 'Praveen',            role: 'All-Rounder', price: 2500 },
        { name: 'Sukesh Padav',       role: 'All-Rounder', price: 11000 },
        { name: 'Praveen Kumar',      role: 'Batsman',     price: 1500 },
        { name: 'Shreyas B Acharya',  role: 'All-Rounder', price: 18000 },
        { name: 'Samanth',            role: 'All-Rounder', price: 5000 },
        { name: 'Sujith Manigudde',   role: 'Bowler',      price: 9000 },
        { name: 'Ajith',              role: 'All-Rounder', price: 1500 },
      ],
    },

    // ── 7. S.M.C.N ──
    {
      teamName: 'S.M.C.N',
      owner: 'Suresh',
      iconPlayer: 'Sri Ram',
      players: [
        { name: 'Prashanth Putthu',   role: 'Batsman',     price: 2000 },
        { name: 'Dinesh Nakre',       role: 'Batsman',     price: 24000 },
        { name: 'Manish',             role: 'Bowler',      price: 3000 },
        { name: 'Adithya MJ',         role: 'All-Rounder', price: 30000 },
        { name: 'Sandeep Munna',      role: 'All-Rounder', price: 3500 },
        { name: 'Sandesh IK',         role: 'All-Rounder', price: 7500 },
        { name: 'Santhosh Manigudde', role: 'All-Rounder', price: 15000 },
        { name: 'Kishan',             role: 'All-Rounder', price: 1000 },
        { name: 'Sathish',            role: 'All-Rounder', price: 4000 },
        { name: 'Vittal Manigudde',   role: 'All-Rounder', price: 2000 },
        { name: 'Vasanth',            role: 'Bowler',      price: 1500 },
        { name: 'Pradeep',            role: 'All-Rounder', price: 3000 },
        { name: 'Sanjeeva Naik',      role: 'All-Rounder', price: 1000 },
      ],
    },

    // ── 8. Maheshwara Cricketers (MC) ──
    {
      teamName: 'Maheshwara Cricketers',
      owner: 'Rakshan',
      iconPlayer: 'Rakshith (Chippi)',
      players: [
        { name: 'Dinesh',             role: 'All-Rounder', price: 1000 },
        { name: 'Jais',               role: 'All-Rounder', price: 10000 },
        { name: 'Pratheesh Reddy',    role: 'All-Rounder', price: 2500 },
        { name: 'Swasthi IK',         role: 'All-Rounder', price: 4000 },
        { name: 'Samith',             role: 'All-Rounder', price: 7000 },
        { name: 'Vijay',              role: 'All-Rounder', price: 36000 },
        { name: 'Ramesh',             role: 'All-Rounder', price: 19000 },
        { name: 'Santhosh IK',        role: 'All-Rounder', price: 14000 },
        { name: 'Nithin IK',          role: 'Batsman',     price: 2500 },
        { name: 'Abhishek',           role: 'All-Rounder', price: 1000 },
        { name: 'Prashanth',          role: 'All-Rounder', price: 1000 },
        { name: 'Arush Shetty',       role: 'All-Rounder', price: 1000 },
        { name: 'Rakesh Pakku',       role: 'All-Rounder', price: 1000 },
      ],
    },
  ],
};

/**
 * Default fixture data parsed from Cricket_Auction_Fixtures.xlsx.
 * Pool divisions and the complete 12-match schedule.
 */
export const DEFAULT_FIXTURES_DATA = {
  pools: {
    A: ['aj', 'smcn', 'bfcl', 'dfc'],   // AJ, SMCN, BFCL, DFC
    B: ['ysc', 'mc', 'nen', 'bfc'],      // YSC, MC, NEN, BFC
  },
  matches: [
    { matchNum: 1,  date: '25 April 2026', day: 'Saturday', time: '8:30 – 9:30',   pool: 'B', team1: 'ysc',  team2: 'bfc'  },
    { matchNum: 2,  date: '25 April 2026', day: 'Saturday', time: '9:30 – 10:30',  pool: 'A', team1: 'aj',   team2: 'bfcl' },
    { matchNum: 3,  date: '25 April 2026', day: 'Saturday', time: '10:30 – 11:30', pool: 'B', team1: 'mc',   team2: 'nen'  },
    { matchNum: 4,  date: '25 April 2026', day: 'Saturday', time: '11:30 – 12:30', pool: 'A', team1: 'smcn', team2: 'dfc'  },
    { matchNum: 5,  date: '25 April 2026', day: 'Saturday', time: '12:30 – 1:30',  pool: 'B', team1: 'ysc',  team2: 'mc'   },
    { matchNum: 6,  date: '25 April 2026', day: 'Saturday', time: '1:30 – 2:30',   pool: 'A', team1: 'smcn', team2: 'bfcl' },
    { matchNum: 7,  date: '25 April 2026', day: 'Saturday', time: '2:30 – 3:30',   pool: 'B', team1: 'bfc',  team2: 'nen'  },
    { matchNum: 8,  date: '25 April 2026', day: 'Saturday', time: '3:30 – 4:30',   pool: 'A', team1: 'aj',   team2: 'dfc'  },
    { matchNum: 9,  date: '25 April 2026', day: 'Saturday', time: '4:30 – 5:30',   pool: 'B', team1: 'ysc',  team2: 'nen'  },
    { matchNum: 10, date: '25 April 2026', day: 'Saturday', time: '5:30 – 6:30',   pool: 'A', team1: 'bfcl', team2: 'dfc'  },
    { matchNum: 11, date: '26 April 2026', day: 'Sunday',   time: '8:30 – 9:30',   pool: 'B', team1: 'bfc',  team2: 'mc'   },
    { matchNum: 12, date: '26 April 2026', day: 'Sunday',   time: '9:30 – 10:30',  pool: 'A', team1: 'aj',   team2: 'smcn' },
  ],
};

// ── Snapshot Builder ────────────────────────────

/**
 * Normalize a name for matching: lowercase, trim, collapse spaces.
 */
function normalizeName(name = '') {
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Build a preload snapshot from preload data, matching against
 * the known TEAMS_DATA and player catalog.
 *
 * @param {object} preloadData — e.g. PERMANENT_PRELOAD_DATA or a completed auction snapshot
 * @param {Array}  teamsData   — TEAMS_DATA array (team definitions with id, name, etc.)
 * @param {Array}  playerCatalog — full player catalog (allPlayers)
 * @returns {{ teams: Array, autoCreatedPlayers: Array, errors: Array, valid: boolean }}
 */
export function buildPreloadSnapshot(preloadData, teamsData, playerCatalog) {
  const errors = [];
  const autoCreatedPlayers = [];
  const usedPlayerIds = new Set(); // prevent duplicate players across teams

  // Build lookup maps
  const teamByName = new Map();
  teamsData.forEach(t => {
    teamByName.set(normalizeName(t.name), t);
  });

  const playerByName = new Map();
  playerCatalog.forEach(p => {
    playerByName.set(normalizeName(p.name), p);
  });

  let maxPlayerId = playerCatalog.reduce((max, p) => Math.max(max, p.id || 0), 0);

  const teams = [];

  for (const preloadTeam of (preloadData.teams || [])) {
    // Match team
    const teamDef = teamByName.get(normalizeName(preloadTeam.teamName));
    if (!teamDef) {
      errors.push(`Team "${preloadTeam.teamName}" not found in team definitions — skipped`);
      continue;
    }

    const squad = [];
    let totalSpent = 0;

    for (const preloadPlayer of (preloadTeam.players || [])) {
      const playerKey = normalizeName(preloadPlayer.name);

      // Check for duplicates
      if (usedPlayerIds.has(playerKey)) {
        errors.push(`Duplicate player "${preloadPlayer.name}" — already assigned to another team, skipped`);
        continue;
      }

      let catalogPlayer = playerByName.get(playerKey);

      // Auto-create missing player
      if (!catalogPlayer) {
        maxPlayerId++;
        catalogPlayer = {
          id: maxPlayerId,
          name: preloadPlayer.name,
          role: preloadPlayer.role || 'All-Rounder',
          location: 'Nakre',
          batting: 'Right Hand',
          bowling: preloadPlayer.role === 'Bowler' ? 'Right Arm' : (preloadPlayer.role === 'Batsman' ? 'N/A' : 'Right Arm'),
          basePrice: 1000,
          isWK: false,
          image: '',
          detailImage: '',
        };
        autoCreatedPlayers.push(catalogPlayer);
        playerByName.set(playerKey, catalogPlayer);
      }

      usedPlayerIds.add(playerKey);

      const soldPrice = preloadPlayer.price || catalogPlayer.basePrice || 1000;
      totalSpent += soldPrice;

      squad.push({
        ...catalogPlayer,
        soldPrice,
      });
    }

    // Validate icon player (only 1 per team)
    const iconPlayerName = preloadTeam.iconPlayer || teamDef.iconPlayer || '';

    teams.push({
      teamId: teamDef.id,
      teamDef: { ...teamDef },
      owner: preloadTeam.owner || teamDef.owner,
      iconPlayer: iconPlayerName,
      squad,
      totalSpent,
      purse: (teamDef.purse || 100000) - totalSpent,
    });
  }

  return {
    teams,
    autoCreatedPlayers,
    errors,
    valid: teams.length > 0 && errors.filter(e => !e.includes('skipped')).length === 0,
    label: preloadData.label || 'Previous Auction',
  };
}

/**
 * Build preload data from a completed auction engine's serialized state.
 * Converts the engine's team/squad data into the same format as PERMANENT_PRELOAD_DATA.
 *
 * @param {object} engineData — serialized engine state (from engine.serialize())
 * @returns {object} preload data in the standard format
 */
export function buildPreloadDataFromEngine(engineData) {
  if (!engineData || !engineData.teams) return null;

  const teams = engineData.teams
    .filter(t => t.squad && t.squad.length > 0)
    .map(team => ({
      teamName: team.name,
      owner: team.owner || '',
      iconPlayer: team.iconPlayer || '',
      players: team.squad.map(p => ({
        name: p.name,
        role: p.role || 'All-Rounder',
        price: p.soldPrice || p.basePrice || 1000,
      })),
    }));

  return {
    label: `Completed Auction (${new Date().toLocaleDateString('en-IN')})`,
    teams,
  };
}
