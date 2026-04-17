// ─────────────────────────────────────────────
// commentary.js — Live Auction Commentary Engine
// Generates natural-language commentary for every
// auction event, analytics, and ambient filler.
// ─────────────────────────────────────────────

import { AuctionEngine } from './auction.js';

/** Format points shorthand */
function fmt(pts) {
  return AuctionEngine.formatPoints(pts);
}

/** Pick a random item from an array */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Commentary line types — used for color-coding in UI
 *   nominate | bid | sold | unsold | timer | analytics | squad | progress | idle
 */

export class CommentaryEngine {
  constructor() {
    this.lines = [];         // { id, type, text, timestamp }
    this.maxLines = 100;
    this.lineId = 0;
    this.lastAnalyticsTime = 0;
    this.lastIdleTime = 0;
    this.bidCountThisPlayer = 0;
    this.lastBidTeam = null;
    this.announcedTimerThresholds = new Set();
    this.listeners = [];     // onChange callbacks

    // ── Text-to-Speech ────────────────────────
    this.speechEnabled = false;
    this.speechRate = 1.15;      // slightly fast for commentator energy
    this.speechPitch = 1.05;     // slightly high for excitement
    this.speechVolume = 1.0;
    this.speechQueue = [];       // queued utterances
    this.isSpeaking = false;
    this.selectedVoice = null;
    this._initSpeech();
  }

  // ── Text-to-Speech Setup ────────────────────

  /** Initialize speech synthesis and pick best voice */
  _initSpeech() {
    if (!('speechSynthesis' in window)) {
      console.warn('[Commentary] Speech synthesis not supported');
      this.speechEnabled = false;
      return;
    }

    this.synth = window.speechSynthesis;

    // Pick voice once voices are loaded
    const pickVoice = () => {
      const voices = this.synth.getVoices();
      if (voices.length === 0) return;

      // Prefer English male voices for commentator feel
      const preferred = [
        'Google UK English Male',
        'Microsoft David',
        'Google US English',
        'Microsoft Mark',
        'Microsoft Zira',
        'Google UK English Female',
        'en-US',
        'en-GB',
        'en-IN',
      ];

      for (const pref of preferred) {
        const match = voices.find(v =>
          v.name.includes(pref) || v.lang.startsWith(pref)
        );
        if (match) {
          this.selectedVoice = match;
          console.log(`[Commentary] Voice selected: ${match.name} (${match.lang})`);
          return;
        }
      }

      // Fallback: any English voice
      const english = voices.find(v => v.lang.startsWith('en'));
      if (english) {
        this.selectedVoice = english;
        console.log(`[Commentary] Fallback voice: ${english.name}`);
      }
    };

    // Voices may load async
    if (this.synth.getVoices().length > 0) {
      pickVoice();
    }
    this.synth.addEventListener('voiceschanged', pickVoice);
  }

  /** Clean text for speech — remove emoji, fix symbols for natural reading */
  _cleanForSpeech(text) {
    return text
      // Remove common emoji (broad pattern)
      .replace(/[\u{1F300}-\u{1FEFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, '')
      .replace(/[\u{E0020}-\u{E007F}]/gu, '')
      // Replace symbols with spoken words
      .replace(/→/g, ' goes to ')
      .replace(/—/g, ', ')
      .replace(/–/g, ', ')
      .replace(/#(\d+)/g, 'number $1')
      // Make numbers sound better
      .replace(/(\d),(\d{2},\d{3})/g, '$1$2')    // handle Indian notation
      .replace(/(\d),(\d{3})/g, '$1$2')           // remove comma in numbers for speech
      .replace(/\bpts\b/g, 'points')
      .replace(/\//g, ' out of ')
      // Cleanup whitespace
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /** Speak a commentary line using Web Speech API */
  _speak(line) {
    if (!this.speechEnabled || !this.synth) return;

    const cleanText = this._cleanForSpeech(line.text);
    if (!cleanText || cleanText.length < 3) return;

    // If currently speaking and this is a high-priority line, interrupt
    const isHighPriority = ['nominate', 'sold', 'unsold'].includes(line.type);
    if (isHighPriority && this.isSpeaking) {
      this.synth.cancel();
      this.speechQueue = [];
      this.isSpeaking = false;
    }

    // Skip idle/analytics if we're already busy with a queue
    const isLowPriority = ['idle', 'analytics'].includes(line.type);
    if (isLowPriority && (this.isSpeaking || this.speechQueue.length >= 2)) {
      return;
    }

    // Add to queue
    this.speechQueue.push({ text: cleanText, type: line.type });

    // Keep queue manageable — drop oldest low-priority if too long
    while (this.speechQueue.length > 4) {
      const idxLow = this.speechQueue.findIndex(q => ['idle', 'analytics', 'squad'].includes(q.type));
      if (idxLow >= 0) {
        this.speechQueue.splice(idxLow, 1);
      } else {
        this.speechQueue.shift(); // drop oldest
      }
    }

    this._processQueue();
  }

  /** Process the speech queue — speak next utterance */
  _processQueue() {
    if (this.isSpeaking || this.speechQueue.length === 0 || !this.synth) return;

    // Chrome bug workaround: if synth is paused or stuck, resume it
    if (this.synth.paused) {
      this.synth.resume();
    }

    const item = this.speechQueue.shift();

    const utterance = new SpeechSynthesisUtterance(item.text);
    if (this.selectedVoice) utterance.voice = this.selectedVoice;
    utterance.volume = this.speechVolume;

    // Adjust rate and pitch based on event type for commentator feel
    switch (item.type) {
      case 'nominate':
        utterance.rate = 1.1;
        utterance.pitch = 1.1;
        break;
      case 'bid':
        utterance.rate = 1.2;
        utterance.pitch = 1.05;
        break;
      case 'sold':
        utterance.rate = 1.0;    // slower, dramatic
        utterance.pitch = 1.15;  // excited
        break;
      case 'unsold':
        utterance.rate = 0.95;
        utterance.pitch = 0.95;  // somber
        break;
      case 'timer':
        utterance.rate = 1.3;    // urgent
        utterance.pitch = 1.1;
        break;
      case 'idle':
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        break;
      default:
        utterance.rate = 1.1;
        utterance.pitch = 1.0;
        break;
    }

    this.isSpeaking = true;

    utterance.onend = () => {
      this.isSpeaking = false;
      // Short pause between lines for natural feel
      setTimeout(() => this._processQueue(), 250);
    };

    utterance.onerror = (e) => {
      console.warn('[Commentary] Speech error:', e.error);
      this.isSpeaking = false;
      setTimeout(() => this._processQueue(), 100);
    };

    try {
      this.synth.speak(utterance);
    } catch (e) {
      console.warn('[Commentary] Failed to speak:', e);
      this.isSpeaking = false;
    }

    // Chrome bug workaround: Chrome stops speaking after ~15s
    // Periodically resume to keep it alive
    this._startKeepAlive();
  }

  /** Chrome workaround — periodically resume speechSynthesis to prevent freezing */
  _startKeepAlive() {
    if (this._keepAliveTimer) return;
    this._keepAliveTimer = setInterval(() => {
      if (this.synth && this.synth.speaking) {
        this.synth.pause();
        this.synth.resume();
      } else if (!this.synth?.speaking && this.speechQueue.length === 0) {
        clearInterval(this._keepAliveTimer);
        this._keepAliveTimer = null;
      }
    }, 5000);
  }

  /** Toggle speech on/off */
  toggleSpeech() {
    this.speechEnabled = !this.speechEnabled;
    if (!this.speechEnabled) {
      this.stopSpeaking();
    }
    return this.speechEnabled;
  }

  /** Set speech enabled state */
  setSpeechEnabled(enabled) {
    this.speechEnabled = enabled;
    if (!enabled) this.stopSpeaking();
  }

  /** Stop all speech immediately */
  stopSpeaking() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.speechQueue = [];
    this.isSpeaking = false;
    if (this._keepAliveTimer) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
    }
  }

  // ── Subscription ────────────────────────────

  /** Register a callback for when new lines are added */
  onChange(fn) {
    this.listeners.push(fn);
  }

  _emit(line) {
    this.listeners.forEach(fn => fn(line));
  }

  // ── Core: Add a commentary line ─────────────

  _addLine(type, text) {
    const line = {
      id: this.lineId++,
      type,
      text,
      timestamp: Date.now(),
    };
    this.lines.push(line);

    // Prune old lines
    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines);
    }

    this._emit(line);
    this._speak(line);
    return line;
  }

  /** Get all lines (newest last) */
  getLines() {
    return [...this.lines];
  }

  /** Clear all lines */
  clear() {
    this.lines = [];
    this.lineId = 0;
  }

  // ═══════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════

  // ── Player Nominated ───────────────────────

  onNominate(player, playerIndex, totalPlayers, remainingPlayers) {
    this.bidCountThisPlayer = 0;
    this.lastBidTeam = null;
    this.announcedTimerThresholds.clear();

    const roleLabel = player.isWK ? `${player.role} / Wicket-Keeper` : player.role;
    const locationTag = player.location !== 'Others' ? ` from ${player.location}` : '';

    const templates = [
      `🏏 Next up — ${player.name}, a ${roleLabel}${locationTag}! Base price: ${fmt(player.basePrice)}. Let the bidding begin!`,
      `🏏 Player #${playerIndex} steps into the spotlight! It's ${player.name}, ${roleLabel}${locationTag}. Who wants this talent?`,
      `🏏 And here comes ${player.name}! A ${roleLabel}${locationTag} with a base price of ${fmt(player.basePrice)}. Teams, raise your paddles!`,
      `🏏 Ladies and gentlemen, ${player.name} is up for auction! ${roleLabel}${locationTag}. Starting at ${fmt(player.basePrice)}!`,
      `🏏 The spotlight falls on ${player.name}! ${roleLabel}${locationTag}. Base: ${fmt(player.basePrice)}. Who'll make the first move?`,
      `🏏 All eyes on ${player.name}! A ${player.role} talent${locationTag}. ${remainingPlayers} players still waiting in the wings!`,
    ];

    this._addLine('nominate', pick(templates));

    // Add batting/bowling info as a follow-up
    if (player.batting && player.batting !== 'N/A') {
      const details = [];
      details.push(`${player.batting} bat`);
      if (player.bowling && player.bowling !== 'N/A') details.push(`${player.bowling} bowl`);
      if (player.isWK) details.push('can keep wickets');
      this._addLine('nominate', `📋 Quick stats: ${details.join(', ')}. Player ${playerIndex} of ${totalPlayers}.`);
    }
  }

  // ── Bid Placed ─────────────────────────────

  onBid(teamShortName, teamName, amount, playerName, bidHistory, teamState) {
    this.bidCountThisPlayer++;
    const bidNum = this.bidCountThisPlayer;

    // Standard bid commentary
    if (bidNum === 1) {
      // First bid
      const templates = [
        `💰 First bid! ${teamShortName} opens with ${fmt(amount)} for ${playerName}!`,
        `💰 ${teamShortName} makes the first move — ${fmt(amount)} on the table for ${playerName}!`,
        `💰 And we have a bid! ${teamShortName} kicks things off at ${fmt(amount)}!`,
        `💰 ${teamShortName} breaks the ice! ${fmt(amount)} for ${playerName}. Any challengers?`,
      ];
      this._addLine('bid', pick(templates));
    } else if (bidNum === 2) {
      // Counter bid
      const templates = [
        `💰 ${teamShortName} fires back! ${fmt(amount)} — it's a fight now!`,
        `💰 Here comes ${teamShortName} with a counter! ${fmt(amount)}! The battle begins!`,
        `💰 Not so fast! ${teamShortName} enters the race at ${fmt(amount)}!`,
        `💰 ${teamShortName} says "I want this one!" — ${fmt(amount)}!`,
      ];
      this._addLine('bid', pick(templates));
    } else {
      // Ongoing bidding war
      const templates = [
        `💰 ${teamShortName} raises to ${fmt(amount)}! That's bid #${bidNum} for ${playerName}!`,
        `💰 ${teamShortName} is NOT backing down — ${fmt(amount)}!`,
        `💰 Another bid from ${teamShortName}! ${fmt(amount)}. This one's getting expensive!`,
        `💰 ${teamShortName} ups the ante to ${fmt(amount)}! The price keeps climbing!`,
        `💰 ${fmt(amount)} from ${teamShortName}! ${playerName} is proving to be a hot commodity!`,
      ];
      this._addLine('bid', pick(templates));
    }

    // Bidding war commentary at milestones
    if (bidNum === 4) {
      this._addLine('bid', `🔥 We've got a BIDDING WAR! 4 bids already for ${playerName}! The teams really want this one!`);
    } else if (bidNum === 6) {
      this._addLine('bid', `🔥🔥 SIX bids and counting! This is the most heated contest so far! Who will blink first?`);
    } else if (bidNum >= 8 && bidNum % 2 === 0) {
      this._addLine('bid', `🔥🔥🔥 INCREDIBLE! ${bidNum} bids! ${playerName} is breaking records at this auction!`);
    }

    // Price milestone commentary
    if (amount >= 20000 && amount - 2000 < 20000) {
      this._addLine('analytics', `📈 ${playerName} just crossed the 20,000 pts mark! Premium territory!`);
    } else if (amount >= 10000 && amount - 1000 < 10000) {
      this._addLine('analytics', `📈 Into five figures! ${playerName} breaks the 10,000 pts barrier!`);
    } else if (amount >= 50000 && amount - 2000 < 50000) {
      this._addLine('analytics', `📈 FIFTY THOUSAND! ${playerName} is one of the most expensive players ever in NPL history!`);
    }

    // Team budget commentary
    if (teamState) {
      const remainingPurse = teamState.purse - amount;
      const pct = (remainingPurse / 100000) * 100;
      if (pct < 20 && pct > 10) {
        this._addLine('squad', `⚠️ ${teamShortName} is running low on budget — only ${fmt(remainingPurse)} left after this bid!`);
      } else if (pct <= 10) {
        this._addLine('squad', `🚨 Danger zone for ${teamShortName}! Just ${fmt(remainingPurse)} remaining if they win this!`);
      }
    }
  }

  // ── Player Sold ────────────────────────────

  onSold(playerName, playerRole, teamShortName, teamName, price, bidCount, teamState, auctionState) {
    // Main sold line
    const templates = [
      `🎉 SOLD! ${playerName} goes to ${teamShortName} for ${fmt(price)}! What a pick!`,
      `🎉 And it's a DEAL! ${teamShortName} bags ${playerName} for ${fmt(price)}!`,
      `🎉 SOLD to ${teamShortName}! ${playerName} — ${fmt(price)}! Great acquisition!`,
      `🎉 ${teamShortName} celebrates! They've got ${playerName} for ${fmt(price)}!`,
      `🎉 The hammer falls! ${playerName} → ${teamShortName} for ${fmt(price)}! Done deal!`,
      `🎉 Going, going, GONE! ${playerName} is now a ${teamShortName} player! Price: ${fmt(price)}!`,
    ];
    this._addLine('sold', pick(templates));

    // Bidding war recap
    if (bidCount > 3) {
      this._addLine('sold', `🔥 What a battle! ${bidCount} bids were placed for ${playerName}. Intense stuff!`);
    }

    // Value commentary
    if (price === 1000) {
      this._addLine('analytics', `💎 Steal of the auction! ${playerName} goes at base price. ${teamShortName} got a bargain!`);
    } else if (price >= 20000) {
      this._addLine('analytics', `💰 Premium buy! ${playerName} at ${fmt(price)} — one of the priciest picks today!`);
    }

    // Team squad update
    if (teamState) {
      const squadSize = teamState.squad.length;
      const remaining = teamState.purse;
      const slotsLeft = 12 - squadSize;

      const squadTemplates = [
        `👥 ${teamShortName} squad update: ${squadSize}/12 players, ${fmt(remaining)} in the kitty. ${slotsLeft} slots to fill.`,
        `👥 ${teamShortName} now has ${squadSize} players with ${fmt(remaining)} remaining. Building nicely!`,
      ];
      this._addLine('squad', pick(squadTemplates));

      // Role composition analysis
      const roles = { Batsman: 0, Bowler: 0, 'All-Rounder': 0 };
      teamState.squad.forEach(p => {
        if (roles[p.role] !== undefined) roles[p.role]++;
      });

      if (roles.Bowler === 0 && squadSize >= 4) {
        this._addLine('squad', `🎯 Interesting — ${teamShortName} hasn't picked a single bowler yet! They'll need some firepower!`);
      } else if (roles.Batsman === 0 && squadSize >= 4) {
        this._addLine('squad', `🏏 ${teamShortName} still searching for batting talent! No specialist batsmen in their squad yet.`);
      }

      // Squad full warning
      if (squadSize >= 12) {
        this._addLine('squad', `📢 ${teamShortName} almost full! Only ${slotsLeft} spot${slotsLeft !== 1 ? 's' : ''} left in the squad!`);
      }
    }

    // Auction progress milestones
    if (auctionState) {
      const sold = auctionState.soldCount;
      const total = auctionState.totalPlayers;
      const pct = Math.round((sold / total) * 100);

      if (sold === Math.ceil(total / 4) && sold > 2) {
        this._addLine('progress', `📈 Quarter mark reached! ${sold} out of ${total} players sold (${pct}% done).`);
      } else if (sold === Math.ceil(total / 2)) {
        this._addLine('progress', `📈 🎯 HALFWAY! ${sold} players sold out of ${total}! We're at the midpoint of this auction!`);
      } else if (sold === Math.ceil(total * 3 / 4)) {
        this._addLine('progress', `📈 Three quarters done! ${sold}/${total} players sold. The home stretch approaches!`);
      } else if (sold % 10 === 0 && sold > 0) {
        this._addLine('progress', `📈 Milestone: ${sold} players sold so far. ${auctionState.remainingPlayers} still to go!`);
      }

      // Total spending update every 5 sales
      if (sold % 5 === 0 && sold > 0) {
        const totalSpent = auctionState.teams.reduce((sum, t) => sum + t.totalSpent, 0);
        this._addLine('analytics', `💵 Total auction spending so far: ${fmt(totalSpent)} across all teams!`);
      }
    }
  }

  // ── Player Unsold ──────────────────────────

  onUnsold(playerName, playerRole, auctionState) {
    const templates = [
      `❌ No takers! ${playerName} goes UNSOLD. Tough luck!`,
      `❌ And ${playerName} goes unsold! Nobody stepped up. Moving on...`,
      `❌ UNSOLD! ${playerName} didn't find a home this round. Maybe in the re-auction?`,
      `❌ The crowd goes quiet... ${playerName} is unsold. Surprising!`,
      `❌ Not a single bid! ${playerName} will have to wait. UNSOLD!`,
    ];
    this._addLine('unsold', pick(templates));

    if (auctionState) {
      if (auctionState.unsoldCount >= 3) {
        this._addLine('analytics', `📊 ${auctionState.unsoldCount} players unsold so far. Teams being very selective today!`);
      }
      this._addLine('progress', `📋 ${auctionState.remainingPlayers} players remaining in the pool. Let's keep moving!`);
    }
  }

  // ── Timer Commentary ───────────────────────

  onTimerTick(remaining, duration, playerName, currentBidder, currentBid) {
    const sec = Math.ceil(remaining);

    // Avoid duplicate announcements for the same second
    if (this.announcedTimerThresholds.has(sec)) return;

    if (sec === 20 && duration >= 30) {
      this.announcedTimerThresholds.add(sec);
      if (!currentBidder) {
        this._addLine('timer', `⏱️ 20 seconds left... Still no bids for ${playerName}. Any takers?`);
      } else {
        this._addLine('timer', `⏱️ 20 seconds on the clock. Current bid: ${fmt(currentBid)}. Time is ticking!`);
      }
    } else if (sec === 15) {
      this.announcedTimerThresholds.add(sec);
      if (!currentBidder) {
        this._addLine('timer', `⏱️ 15 seconds! ${playerName} might go unsold if nobody steps up!`);
      } else {
        this._addLine('timer', `⏱️ 15 seconds remaining! Going once at ${fmt(currentBid)}...`);
      }
    } else if (sec === 10) {
      this.announcedTimerThresholds.add(sec);
      const templates = currentBidder ? [
        `⏱️ 10 SECONDS! Going once... going twice at ${fmt(currentBid)}!`,
        `⏱️ TEN seconds left! Any last-minute counter-bids? Currently ${fmt(currentBid)}!`,
      ] : [
        `⏱️ 10 seconds! Surely someone wants ${playerName}?!`,
        `⏱️ Just 10 seconds! ${playerName} heading towards unsold...`,
      ];
      this._addLine('timer', pick(templates));
    } else if (sec === 5) {
      this.announcedTimerThresholds.add(sec);
      const templates = currentBidder ? [
        `⏱️ FIVE SECONDS! Last chance to outbid! ${fmt(currentBid)} going... going...`,
        `⏱️ 5... 4... Final call! ${fmt(currentBid)} on the line!`,
      ] : [
        `⏱️ 5 seconds! Going UNSOLD in 5... 4... 3...`,
        `⏱️ FIVE seconds! It's now or never for ${playerName}!`,
      ];
      this._addLine('timer', pick(templates));
    } else if (sec === 3) {
      this.announcedTimerThresholds.add(sec);
      if (currentBidder) {
        this._addLine('timer', `⏱️ THREE... TWO... Almost done!`);
      }
    }
  }

  // ── Analytics / Insights ───────────────────

  /** Generate analytics commentary. Call periodically (~every 15-20s) */
  generateAnalytics(auctionState) {
    if (!auctionState || auctionState.soldCount < 3) return;

    const now = Date.now();
    if (now - this.lastAnalyticsTime < 15000) return; // throttle
    this.lastAnalyticsTime = now;

    const insights = [];

    // Most expensive player so far
    if (auctionState.soldPlayers.length > 0) {
      const mostExpensive = auctionState.soldPlayers.reduce((max, s) => s.price > max.price ? s : max, auctionState.soldPlayers[0]);
      insights.push(`📊 Most expensive player so far: ${mostExpensive.player.name} at ${fmt(mostExpensive.price)} (${mostExpensive.teamShortName})!`);
    }

    // Team spending leaders
    const topSpender = [...auctionState.teams].sort((a, b) => b.totalSpent - a.totalSpent)[0];
    if (topSpender && topSpender.totalSpent > 0) {
      insights.push(`📊 Big spender alert! ${topSpender.shortName} leads with ${fmt(topSpender.totalSpent)} spent!`);
    }

    // Budget leaders (most budget remaining)
    const richest = [...auctionState.teams].sort((a, b) => b.purse - a.purse)[0];
    const poorest = [...auctionState.teams].sort((a, b) => a.purse - b.purse)[0];
    if (richest && poorest && richest.id !== poorest.id) {
      insights.push(`📊 Budget gap: ${richest.shortName} has ${fmt(richest.purse)} while ${poorest.shortName} has just ${fmt(poorest.purse)}!`);
    }

    // Average spend per player
    const teamsWithPlayers = auctionState.teams.filter(t => t.squad.length > 0);
    if (teamsWithPlayers.length >= 2) {
      const avgSpends = teamsWithPlayers.map(t => ({
        team: t,
        avg: Math.round(t.totalSpent / t.squad.length),
      }));
      const highestAvg = avgSpends.sort((a, b) => b.avg - a.avg)[0];
      insights.push(`📊 Highest average spend: ${highestAvg.team.shortName} at ${fmt(highestAvg.avg)} per player!`);
    }

    // Squad size comparison
    const maxSquad = [...auctionState.teams].sort((a, b) => b.squad.length - a.squad.length)[0];
    const minSquad = [...auctionState.teams].sort((a, b) => a.squad.length - b.squad.length)[0];
    if (maxSquad && minSquad && maxSquad.squad.length > minSquad.squad.length + 2) {
      insights.push(`📊 Squad sizes vary! ${maxSquad.shortName} has ${maxSquad.squad.length} players while ${minSquad.shortName} has only ${minSquad.squad.length}!`);
    }

    // Player with most bids
    if (auctionState.maxBidsPlayer) {
      insights.push(`📊 Most contested player: ${auctionState.maxBidsPlayer.name} with ${auctionState.maxBidsPlayer.bidCount} bids!`);
    }

    // Base price steals
    const basePriceBuys = auctionState.soldPlayers.filter(s => s.price === 1000);
    if (basePriceBuys.length >= 3) {
      insights.push(`📊 ${basePriceBuys.length} players sold at base price! Smart shopping by some teams!`);
    }

    // Pick one random insight
    if (insights.length > 0) {
      this._addLine('analytics', pick(insights));
    }
  }

  // ── Idle / Ambient Commentary ──────────────

  /** Generate idle commentary during waiting phases. Call every ~8s. */
  generateIdle(auctionState) {
    if (!auctionState) return;

    const now = Date.now();
    if (now - this.lastIdleTime < 8000) return; // throttle
    this.lastIdleTime = now;

    const idleLines = [];

    // Teams that haven't bought anyone yet
    const emptyTeams = auctionState.teams.filter(t => t.squad.length === 0);
    if (emptyTeams.length > 0 && auctionState.soldCount > 5) {
      const team = pick(emptyTeams);
      idleLines.push(`🤔 ${team.shortName} hasn't made a single purchase yet! Are they holding out for the big names?`);
    }

    // Teams with full budget
    const fullBudget = auctionState.teams.filter(t => t.purse === 100000);
    if (fullBudget.length > 0 && auctionState.soldCount > 5) {
      const team = pick(fullBudget);
      idleLines.push(`💰 ${team.shortName} still has their full ${fmt(100000)} purse intact! A big spending spree incoming?`);
    }

    // Auction trivia
    if (auctionState.soldCount > 0) {
      const avgPrice = Math.round(auctionState.soldPlayers.reduce((s, p) => s + p.price, 0) / auctionState.soldCount);
      idleLines.push(`🎯 Average selling price so far: ${fmt(avgPrice)}. Will the next player beat it?`);
    }

    // Role distribution
    if (auctionState.soldCount >= 5) {
      const roleCounts = { Batsman: 0, Bowler: 0, 'All-Rounder': 0 };
      auctionState.soldPlayers.forEach(s => {
        if (roleCounts[s.player.role] !== undefined) roleCounts[s.player.role]++;
      });
      const mostSold = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0];
      if (mostSold[1] > 0) {
        idleLines.push(`📋 ${mostSold[0]}s are in demand! ${mostSold[1]} out of ${auctionState.soldCount} sold players are ${mostSold[0]}s.`);
      }
    }

    // Random encouragement
    const fillers = [
      `🎙️ What a thrilling auction so far! Stay tuned for more action!`,
      `🎙️ The tension is palpable! Who's going to be the next big buy?`,
      `🎙️ NPL 3.0 is delivering drama! Every bid matters, every player counts!`,
      `🎙️ This is what cricket auctions are all about — strategy, surprises, and big moves!`,
      `🎙️ Keep your eyes on the purse strings — the real chess game is in the budget management!`,
    ];

    if (idleLines.length > 0 && Math.random() > 0.4) {
      this._addLine('idle', pick(idleLines));
    } else {
      this._addLine('idle', pick(fillers));
    }
  }

  // ── Auction Start / End ────────────────────

  onAuctionStart(teamCount, playerCount) {
    this._addLine('progress', `🏟️ Welcome to NAKRE PREMIER LEAGUE 3.0 AUCTION 2026!`);
    this._addLine('progress', `🏟️ ${teamCount} teams ready, ${playerCount} players in the pool. Let the auction begin!`);
    this._addLine('progress', `🎙️ May the best strategies win! Good luck to all teams!`);
  }

  onAuctionComplete(soldCount, unsoldCount) {
    this._addLine('progress', `🏆 AUCTION COMPLETE! ${soldCount} players sold, ${unsoldCount} unsold.`);
    if (unsoldCount > 0) {
      this._addLine('progress', `♻️ ${unsoldCount} players went unsold — a re-auction round may follow!`);
    }
    this._addLine('progress', `🎙️ What an incredible auction! Thank you for joining NPL 3.0 2026!`);
  }

  onReauction(count) {
    this._addLine('progress', `♻️ RE-AUCTION ROUND! ${count} previously unsold players get another chance! Let's go!`);
  }
}
