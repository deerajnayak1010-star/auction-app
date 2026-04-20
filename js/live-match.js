// ─────────────────────────────────────────────
// live-match.js — Ball-by-Ball Live Match Engine
// Full state machine, ICC strike rotation, player tracking
// ─────────────────────────────────────────────

export class LiveMatchEngine {
  constructor(match) {
    this.matchId = match.matchId;
    this.teamA = { id: match.teamAId, name: match.teamAName, short: match.teamAShort, color: match.teamAColor, logo: match.teamALogo, squad: match.teamASquad || [] };
    this.teamB = { id: match.teamBId, name: match.teamBName, short: match.teamBShort, color: match.teamBColor, logo: match.teamBLogo, squad: match.teamBSquad || [] };
    this.oversLimit = 5;
    this.phase = 'setup';
    this.tossWinner = null; this.tossDecision = null;
    this.currentInnings = 1;
    this.battingTeamId = null; this.bowlingTeamId = null;
    this.battingCard = []; this.bowlingCard = [];
    this.battingCard2 = []; this.bowlingCard2 = [];
    this.extras = {wides:0,noBalls:0,byes:0,legByes:0,total:0};
    this.extras2 = {wides:0,noBalls:0,byes:0,legByes:0,total:0};
    this.balls = []; this.balls2 = [];
    this.fallOfWickets = []; this.fallOfWickets2 = [];
    this.isFreeHit = false;
    this.partnershipRuns = 0; this.partnershipBalls = 0;
    this.isComplete = false; this.result = null; this.winnerId = null;
    this.matchType = match.matchType || 'group';
    this.innings1BattingTeamId = null; // tracks which team batted in innings 1
    this.undoStack = [];
  }

  get _balls() { return this.currentInnings===1 ? this.balls : this.balls2; }
  get _bc() { return this.currentInnings===1 ? this.battingCard : this.battingCard2; }
  get _bwc() { return this.currentInnings===1 ? this.bowlingCard : this.bowlingCard2; }
  get _ext() { return this.currentInnings===1 ? this.extras : this.extras2; }
  get _fow() { return this.currentInnings===1 ? this.fallOfWickets : this.fallOfWickets2; }
  _getBattingTeam() { return this.battingTeamId===this.teamA.id ? this.teamA : this.teamB; }
  _getBowlingTeam() { return this.bowlingTeamId===this.teamA.id ? this.teamA : this.teamB; }
  _getStriker() { return this._bc.find(b=>b.isStriker&&!b.isOut); }
  _getNonStriker() { return this._bc.find(b=>!b.isStriker&&!b.isOut); }
  _getCurrentBowler() { return this._bwc.find(b=>b.isCurrent); }
  _getLegalBallCount() { return this._balls.filter(b=>!b.isWide&&!b.isNoBall).length; }
  _getCurrentOverNum() { return Math.floor(this._getLegalBallCount()/6); }
  _getBallsInCurrentOver() { return this._getLegalBallCount()%6; }

  setToss(winnerId, decision) {
    this.tossWinner = winnerId; this.tossDecision = decision;
    if (decision==='bat') { this.battingTeamId=winnerId; this.bowlingTeamId=winnerId===this.teamA.id?this.teamB.id:this.teamA.id; }
    else { this.bowlingTeamId=winnerId; this.battingTeamId=winnerId===this.teamA.id?this.teamB.id:this.teamA.id; }
    this.innings1BattingTeamId = this.battingTeamId;
    this.phase = 'batting-select';
  }
  setOversLimit(n) { this.oversLimit = Math.max(1,Math.min(20,n)); }

  setOpeners(strikerName, nonStrikerName, bowlerName) {
    const bc = this.currentInnings===1?this.battingCard:this.battingCard2;
    bc.length = 0;
    bc.push({name:strikerName,runs:0,balls:0,fours:0,sixes:0,isStriker:true,isOut:false,dismissal:'',didBat:true});
    bc.push({name:nonStrikerName,runs:0,balls:0,fours:0,sixes:0,isStriker:false,isOut:false,dismissal:'',didBat:true});
    const bwc = this.currentInnings===1?this.bowlingCard:this.bowlingCard2;
    bwc.length = 0;
    bwc.push({name:bowlerName,overs:'0',maidens:0,runs:0,wickets:0,balls:0,isCurrent:true});
    this.phase='scoring'; this.partnershipRuns=0; this.partnershipBalls=0; this.isFreeHit=false;
  }

  selectNewBatsman(name) {
    // Determine if the dismissed batsman was striker or non-striker
    // If there's already a non-out striker, new batsman comes as non-striker
    const existingStriker = this._bc.find(b => !b.isOut && b.isStriker);
    const isNewStriker = !existingStriker;
    this._bc.push({name,runs:0,balls:0,fours:0,sixes:0,isStriker:isNewStriker,isOut:false,dismissal:'',didBat:true});
    this.partnershipRuns = 0; this.partnershipBalls = 0;
    this.phase='scoring';
  }

  selectNextBowler(name) {
    this._bwc.forEach(b=>b.isCurrent=false);
    const ex = this._bwc.find(b=>b.name===name);
    if(ex) ex.isCurrent=true;
    else this._bwc.push({name,overs:'0',maidens:0,runs:0,wickets:0,balls:0,isCurrent:true});
    this.phase='scoring';
  }

  getAvailableBatsmen() {
    const used = new Set(this._bc.map(b=>b.name));
    return this._getBattingTeam().squad.filter(p=>!used.has(p.name));
  }

  getAvailableBowlers() {
    const last = this._getCurrentBowler()?.name;
    return this._getBowlingTeam().squad.filter(p=>p.name!==last);
  }

  _shouldSwapStrike(ball) {
    let r=0;
    if(ball.isBoundary||ball.isBatBoundary||ball.isByeBoundary) r=0;
    else if(ball.isWide) r=ball.additionalRuns||0;
    else if(ball.isNoBall) { if(ball.batRuns>0&&!ball.isBatBoundary) r=ball.batRuns; else if(ball.byeRuns>0&&!ball.isByeBoundary) r=ball.byeRuns; else r=0; }
    else if(ball.isBye||ball.isLegBye) r=ball.isBoundary?0:ball.extraRuns;
    else r=ball.isBoundary?0:ball.runs;
    return r%2===1;
  }

  _swapStrike() {
    const s=this._getStriker(), ns=this._getNonStriker();
    if(s) s.isStriker=false; if(ns) ns.isStriker=true;
  }

  _snapshot() {
    return JSON.parse(JSON.stringify({
      currentInnings:this.currentInnings,phase:this.phase,battingTeamId:this.battingTeamId,bowlingTeamId:this.bowlingTeamId,
      battingCard:this.battingCard,bowlingCard:this.bowlingCard,battingCard2:this.battingCard2,bowlingCard2:this.bowlingCard2,
      extras:this.extras,extras2:this.extras2,balls:this.balls,balls2:this.balls2,
      fallOfWickets:this.fallOfWickets,fallOfWickets2:this.fallOfWickets2,
      isFreeHit:this.isFreeHit,partnershipRuns:this.partnershipRuns,partnershipBalls:this.partnershipBalls,
      isComplete:this.isComplete,result:this.result,winnerId:this.winnerId,
      innings1BattingTeamId:this.innings1BattingTeamId
    }));
  }

  undoLastBall() {
    if(this.undoStack.length===0) return null;
    const snap=this.undoStack.pop();
    Object.assign(this,snap);
    return this.getState();
  }

  recordBall(type, opts={}) {
    if(this.phase!=='scoring'||this.isComplete) return null;
    const striker=this._getStriker(), nonStriker=this._getNonStriker(), bowler=this._getCurrentBowler();
    if(!striker||!bowler) return null;
    this.undoStack.push(this._snapshot());
    if(this.undoStack.length>50) this.undoStack.shift();

    const ball={type,runs:0,extraRuns:0,totalRuns:0,isWide:false,isNoBall:false,isBye:false,isLegBye:false,
      isBoundary:false,isBatBoundary:false,isByeBoundary:false,wicket:false,dismissalType:'',whoOut:'',
      batterName:striker.name,bowlerName:bowler.name,batRuns:0,byeRuns:0,additionalRuns:0,
      wasFreeHit:this.isFreeHit,timestamp:Date.now()};
    let isLegal=true, setFreeHit=false;

    // Parse type
    if(type==='0') ball.runs=0;
    else if(type==='1') ball.runs=1;
    else if(type==='2') ball.runs=2;
    else if(type==='3') ball.runs=3;
    else if(type==='4'){ball.runs=4;ball.isBoundary=true;}
    else if(type==='6'){ball.runs=6;ball.isBoundary=true;}
    else if(type==='W'){ball.wicket=true;ball.dismissalType=opts.dismissalType||'bowled';ball.whoOut=opts.whoOut||'striker';if(opts.dismissalType==='run out'){ball.runs=opts.runsCompleted||0;}}
    else if(type==='WD'){ball.isWide=true;ball.extraRuns=1;isLegal=false;}
    else if(type.startsWith('WD+')){
      ball.isWide=true;isLegal=false;const sub=type.slice(3);
      if(sub==='ST'){ball.extraRuns=1;ball.wicket=true;ball.dismissalType='stumped';ball.whoOut='striker';}
      else if(sub==='RO'){ball.extraRuns=1;ball.wicket=true;ball.dismissalType='run out';ball.whoOut=opts.whoOut||'striker';ball.additionalRuns=opts.runsCompleted||0;}
      else{ball.extraRuns=1;ball.additionalRuns=parseInt(sub)||0;}
    }
    else if(type.startsWith('NB+')){
      ball.isNoBall=true;isLegal=false;setFreeHit=true;const sub=type.slice(3);
      if(sub==='RO'){ball.extraRuns=1;ball.wicket=true;ball.dismissalType='run out';ball.whoOut=opts.whoOut||'striker';ball.batRuns=opts.runsCompleted||0;}
      else if(sub.endsWith('B')){const r=parseInt(sub);ball.extraRuns=1;ball.byeRuns=r;ball.isByeBoundary=(r===4);ball.isBye=true;}
      else{const r=parseInt(sub);ball.extraRuns=1;ball.batRuns=r;ball.isBatBoundary=(r>=4);}
    }
    else if(type.startsWith('B')){const r=parseInt(type.slice(1));ball.isBye=true;ball.extraRuns=r;ball.isBoundary=(r===4);}
    else if(type.startsWith('LB')){const r=parseInt(type.slice(2));ball.isLegBye=true;ball.extraRuns=r;ball.isBoundary=(r===4);}

    // Total runs
    if(ball.isWide) ball.totalRuns=ball.extraRuns+(ball.additionalRuns||0);
    else if(ball.isNoBall) ball.totalRuns=ball.extraRuns+ball.batRuns+(ball.byeRuns||0);
    else ball.totalRuns=ball.runs+ball.extraRuns;

    // Update batting card (striker)
    if(!ball.isWide){
      if(isLegal) striker.balls++;
      if(ball.isNoBall&&ball.batRuns>0){striker.runs+=ball.batRuns;if(ball.batRuns>=4&&ball.isBatBoundary&&ball.batRuns===4)striker.fours++;if(ball.batRuns===6)striker.sixes++;}
      else if(!ball.isNoBall&&!ball.isBye&&!ball.isLegBye){striker.runs+=ball.runs;if(ball.isBoundary&&ball.runs===4)striker.fours++;if(ball.isBoundary&&ball.runs===6)striker.sixes++;}
    }

    // Update extras
    const ext=this._ext;
    if(ball.isWide) ext.wides+=ball.totalRuns;
    if(ball.isNoBall){ext.noBalls+=ball.extraRuns;if(ball.byeRuns)ext.byes+=ball.byeRuns;}
    if(ball.isBye&&!ball.isNoBall) ext.byes+=ball.extraRuns;
    if(ball.isLegBye) ext.legByes+=ball.extraRuns;
    ext.total=ext.wides+ext.noBalls+ext.byes+ext.legByes;

    // Wicket
    if(ball.wicket){
      // For run-outs: apply manual strike swap if scorer toggled it in the modal
      if(ball.dismissalType==='run out' && opts.manualStrikeSwap){
        this._swapStrike();
      }
      // After potential swap, re-read current positions for run-outs
      const curStriker = ball.dismissalType==='run out' ? this._getStriker() : striker;
      const curNonStriker = ball.dismissalType==='run out' ? this._getNonStriker() : nonStriker;
      const outBatter=ball.whoOut==='nonStriker'?curNonStriker:curStriker;
      if(outBatter){outBatter.isOut=true;outBatter.dismissal=ball.dismissalType;}
      const t=this._getInningsTotal();
      this._fow.push({score:t.runs,overs:t.overs,wicket:t.wickets,batter:outBatter?.name});
      this.partnershipRuns=0;this.partnershipBalls=0;
    } else {
      this.partnershipRuns+=ball.totalRuns;
      if(isLegal) this.partnershipBalls++;
    }

    this._balls.push(ball);

    // Free hit
    if(setFreeHit) this.isFreeHit=true;
    else if(isLegal) this.isFreeHit=false;

    // Strike rotation
    if(!ball.wicket){ if(this._shouldSwapStrike(ball)) this._swapStrike(); }

    // Over completion
    if(isLegal && this._getBallsInCurrentOver()===0){
      this._swapStrike(); // end-of-over swap
      this._recalcBowlerFigures();
      this.phase='bowler-select';
    }

    // Check innings end
    const total=this._getInningsTotal();
    const maxWk = Math.min(10, this._getBattingTeam().squad.length - 1);
    const allOut=total.wickets>=maxWk;
    const oversComplete=this._getLegalBallCount()>=this.oversLimit*6;

    if(ball.wicket&&!allOut&&!oversComplete&&this.phase==='scoring') this.phase='new-batsman';

    if(allOut||oversComplete){ this._handleInningsEnd(); return this.getState(); }

    // 2nd innings chase
    if(this.currentInnings===2){
      const inn1=this._getInningsTotal1();
      if(total.runs>inn1.runs){
        this.isComplete=true;this.winnerId=this.battingTeamId;
        this.result=`${this._getBattingTeam().short} won by ${maxWk-total.wickets} wickets`;
        this.phase='result';
      }
    }
    return this.getState();
  }

  _handleInningsEnd() {
    this._recalcBowlerFigures();
    if(this.currentInnings===1){
      this.currentInnings=2;
      const tmp=this.battingTeamId;this.battingTeamId=this.bowlingTeamId;this.bowlingTeamId=tmp;
      this.partnershipRuns=0;this.partnershipBalls=0;this.isFreeHit=false;
      this.phase='innings-break';
    } else {
      const inn1=this._getInningsTotal1(), inn2=this._getInningsTotal();
      if(!this.isComplete){
        if(inn1.runs>inn2.runs){
          this.winnerId=this.bowlingTeamId;
          this.result=`${this._getBowlingTeam().short} won by ${inn1.runs-inn2.runs} runs`;
        } else if(inn1.runs===inn2.runs){
          this.result='Match Tied — Points Shared';
          if(this.matchType==='knockout'){ this.phase='super-over'; return; }
          // Group match: share 1 point each, no winner
        } else {
          const maxWk=Math.min(10,this._getBattingTeam().squad.length-1);
          this.winnerId=this.battingTeamId;
          this.result=`${this._getBattingTeam().short} won by ${maxWk-inn2.wickets} wickets`;
        }
        this.isComplete=true;this.phase='result';
      }
    }
  }

  _getInningsTotal() {
    const balls=this._balls;let runs=0,wickets=0,legal=0;
    balls.forEach(b=>{runs+=b.totalRuns||0;if(b.wicket)wickets++;if(!b.isWide&&!b.isNoBall)legal++;});
    return {runs,wickets,overs:`${Math.floor(legal/6)}.${legal%6}`,balls:legal,crr:legal>0?((runs/legal)*6).toFixed(2):'0.00'};
  }

  _getInningsTotal1() {
    let runs=0,wickets=0,legal=0;
    this.balls.forEach(b=>{runs+=b.totalRuns||0;if(b.wicket)wickets++;if(!b.isWide&&!b.isNoBall)legal++;});
    return {runs,wickets,overs:`${Math.floor(legal/6)}.${legal%6}`,balls:legal};
  }

  _recalcBowlerFigures() {
    const bwc=this._bwc;
    bwc.forEach(b=>{b.runs=0;b.wickets=0;b.balls=0;});
    this._balls.forEach(ball=>{
      const bw=bwc.find(b=>b.name===ball.bowlerName);if(!bw)return;
      if(!ball.isWide&&!ball.isNoBall)bw.balls++;
      if(ball.isWide)bw.runs+=ball.totalRuns;
      else if(ball.isNoBall)bw.runs+=ball.extraRuns+(ball.batRuns||0);
      else if(!ball.isBye&&!ball.isLegBye)bw.runs+=ball.runs;
      if(ball.wicket&&ball.dismissalType!=='run out')bw.wickets++;
      bw.overs=`${Math.floor(bw.balls/6)}.${bw.balls%6}`;
    });
  }

  setCoinFlipWinner(teamId) {
    this.winnerId=teamId;
    const team=teamId===this.teamA.id?this.teamA:this.teamB;
    this.result=`${team.short} won by Coin Toss`;
    this.isComplete=true;this.phase='result';
  }

  // Get over-by-over history with ball details
  getOverHistory(inningsNum) {
    const balls = inningsNum === 1 ? this.balls : this.balls2;
    const overs = []; let overBalls = []; let legalInOver = 0; let overRuns = 0; let overNum = 1;
    for (const b of balls) {
      overBalls.push(b); overRuns += b.totalRuns || 0;
      if (!b.isWide && !b.isNoBall) { legalInOver++; if (legalInOver >= 6) { overs.push({ over: overNum, runs: overRuns, balls: [...overBalls] }); overNum++; legalInOver = 0; overRuns = 0; overBalls = []; } }
    }
    // Current incomplete over is NOT included (it's shown in THIS OVER)
    return overs;
  }

  getCurrentOver() {
    const balls = this._balls;
    if (balls.length === 0) return [];
    let legalInOver = 0; let overBalls = [];
    for (const b of balls) {
      overBalls.push(b);
      if (!b.isWide && !b.isNoBall) { legalInOver++; if (legalInOver >= 6) { legalInOver = 0; overBalls = []; } }
    }
    return overBalls;
  }

  getRequiredRunRate() {
    if(this.currentInnings!==2)return null;
    const inn1=this._getInningsTotal1(),target=inn1.runs+1,inn2=this._getInningsTotal();
    const rem=target-inn2.runs,bl=(this.oversLimit*6)-inn2.balls;
    if(bl<=0||rem<=0)return null;
    return {target,remaining:rem,ballsLeft:bl,rrr:((rem/bl)*6).toFixed(2)};
  }

  getManhattan(inningsNum) {
    const balls=inningsNum===1?this.balls:this.balls2;
    const overs=[];let oR=0,legal=0,oN=1;
    balls.forEach(b=>{oR+=b.totalRuns||0;if(!b.isWide&&!b.isNoBall)legal++;if(legal>0&&legal%6===0&&!b.isWide&&!b.isNoBall){overs.push({over:oN,runs:oR});oN++;oR=0;}});
    if(oR>0||(legal%6!==0))overs.push({over:oN,runs:oR});
    return overs;
  }

  syncToScorecard(scorecardMgr) {
    const match=scorecardMgr.getMatch(this.matchId);if(!match)return;
    match.status=this.isComplete?'completed':'live';
    match.tossWinner=this.tossWinner;match.tossDecision=this.tossDecision;match.oversLimit=this.oversLimit;
    const mapInn=(bc,bwc,ext,balls,inn)=>{
      let runs=0,wk=0,lg=0;balls.forEach(b=>{runs+=b.totalRuns||0;if(b.wicket)wk++;if(!b.isWide&&!b.isNoBall)lg++;});
      inn.totalRuns=runs;inn.wickets=wk;inn.overs=`${Math.floor(lg/6)}.${lg%6}`;
      inn.runRate=lg>0?(runs/(lg/6)).toFixed(2):'0.00';
      inn.batting=bc.map(b=>({playerId:b.name,name:b.name,runs:b.didBat?b.runs:'',balls:b.didBat?b.balls:'',
        fours:b.didBat?b.fours:'',sixes:b.didBat?b.sixes:'',strikeRate:b.balls>0?((b.runs/b.balls)*100).toFixed(1):'',
        dismissal:b.dismissal||'',isNotOut:!b.isOut&&b.didBat,didBat:b.didBat}));
      inn.bowling=bwc.map(b=>({playerId:b.name,name:b.name,overs:b.overs,maidens:b.maidens||0,
        runs:b.runs,wickets:b.wickets,economy:parseFloat(b.overs)>0?(b.runs/parseFloat(b.overs)).toFixed(1):'',didBowl:b.balls>0}));
      inn.extras={...ext};inn.extras.total=ext.wides+ext.noBalls+ext.byes+ext.legByes;
    };
    // Map innings data to correct team slot:
    // innings1 in scorecard = teamA's batting, innings2 = teamB's batting
    const inn1BatIsA = this.innings1BattingTeamId === this.teamA.id;
    if (inn1BatIsA) {
      // teamA batted first → battingCard goes to match.innings1
      mapInn(this.battingCard,this.bowlingCard,this.extras,this.balls,match.innings1);
      if(this.currentInnings===2||this.isComplete){
        mapInn(this.battingCard2,this.bowlingCard2,this.extras2,this.balls2,match.innings2);
        match.innings2.target=match.innings1.totalRuns+1;
      }
    } else {
      // teamB batted first → battingCard goes to match.innings2
      mapInn(this.battingCard,this.bowlingCard,this.extras,this.balls,match.innings2);
      if(this.currentInnings===2||this.isComplete){
        mapInn(this.battingCard2,this.bowlingCard2,this.extras2,this.balls2,match.innings1);
        match.innings1.target=match.innings2.totalRuns+1;
      }
    }
    if(this.isComplete){match.result.winner=this.winnerId||'';match.result.margin=this.result||'';}
  }

  getState() {
    const inn1=this._getInningsTotal1();
    let inn2={runs:0,wickets:0,overs:'0.0',balls:0};
    if(this.balls2.length>0){let r=0,w=0,l=0;this.balls2.forEach(b=>{r+=b.totalRuns||0;if(b.wicket)w++;if(!b.isWide&&!b.isNoBall)l++;});inn2={runs:r,wickets:w,overs:`${Math.floor(l/6)}.${l%6}`,balls:l};}
    const current=this._getInningsTotal();
    // Map innings data to correct team
    const inn1BatIsA = this.innings1BattingTeamId === this.teamA.id;
    const teamAScore = inn1BatIsA ? inn1 : inn2;
    const teamBScore = inn1BatIsA ? inn2 : inn1;
    return {
      matchId:this.matchId,teamA:this.teamA,teamB:this.teamB,
      phase:this.phase,currentInnings:this.currentInnings,oversLimit:this.oversLimit,
      battingTeam:this._getBattingTeam(),bowlingTeam:this._getBowlingTeam(),
      tossWinner:this.tossWinner,tossDecision:this.tossDecision,
      innings1:inn1,innings2:inn2,current,
      teamAScore,teamBScore,innings1BattingTeamId:this.innings1BattingTeamId,
      battingCard:this._bc,bowlingCard:this._bwc,extras:this._ext,
      striker:this._getStriker(),nonStriker:this._getNonStriker(),bowler:this._getCurrentBowler(),
      currentOver:this.getCurrentOver(),
      target:this.currentInnings===2?inn1.runs+1:null,
      rrr:this.getRequiredRunRate(),
      partnership:{runs:this.partnershipRuns,balls:this.partnershipBalls},
      fallOfWickets:[...this._fow],
      manhattan1:this.getManhattan(1),manhattan2:this.getManhattan(2),
      overHistory:this.getOverHistory(this.currentInnings),
      isFreeHit:this.isFreeHit,isComplete:this.isComplete,result:this.result,winnerId:this.winnerId,
      matchType:this.matchType,
      availableBatsmen:this.getAvailableBatsmen(),availableBowlers:this.getAvailableBowlers(),
      canUndo:this.undoStack.length>0
    };
  }

  serialize() {
    return {
      matchId:this.matchId,teamA:this.teamA,teamB:this.teamB,oversLimit:this.oversLimit,
      phase:this.phase,currentInnings:this.currentInnings,
      battingTeamId:this.battingTeamId,bowlingTeamId:this.bowlingTeamId,
      tossWinner:this.tossWinner,tossDecision:this.tossDecision,
      battingCard:this.battingCard,bowlingCard:this.bowlingCard,
      battingCard2:this.battingCard2,bowlingCard2:this.bowlingCard2,
      extras:this.extras,extras2:this.extras2,
      balls:this.balls,balls2:this.balls2,
      fallOfWickets:this.fallOfWickets,fallOfWickets2:this.fallOfWickets2,
      isFreeHit:this.isFreeHit,
      partnershipRuns:this.partnershipRuns,partnershipBalls:this.partnershipBalls,
      isComplete:this.isComplete,result:this.result,winnerId:this.winnerId,
      matchType:this.matchType,innings1BattingTeamId:this.innings1BattingTeamId
    };
  }

  static restore(data) {
    const match={matchId:data.matchId,teamAId:data.teamA.id,teamAName:data.teamA.name,teamAShort:data.teamA.short,
      teamAColor:data.teamA.color,teamALogo:data.teamA.logo,teamASquad:data.teamA.squad||[],
      teamBId:data.teamB.id,teamBName:data.teamB.name,teamBShort:data.teamB.short,
      teamBColor:data.teamB.color,teamBLogo:data.teamB.logo,teamBSquad:data.teamB.squad||[],
      oversLimit:data.oversLimit,matchType:data.matchType};
    const e=new LiveMatchEngine(match);
    e.phase=data.phase||'setup';e.currentInnings=data.currentInnings||1;
    e.battingTeamId=data.battingTeamId;e.bowlingTeamId=data.bowlingTeamId;
    e.tossWinner=data.tossWinner;e.tossDecision=data.tossDecision;
    e.battingCard=data.battingCard||[];e.bowlingCard=data.bowlingCard||[];
    e.battingCard2=data.battingCard2||[];e.bowlingCard2=data.bowlingCard2||[];
    e.extras=data.extras||{wides:0,noBalls:0,byes:0,legByes:0,total:0};
    e.extras2=data.extras2||{wides:0,noBalls:0,byes:0,legByes:0,total:0};
    e.balls=data.balls||[];e.balls2=data.balls2||[];
    e.fallOfWickets=data.fallOfWickets||[];e.fallOfWickets2=data.fallOfWickets2||[];
    e.isFreeHit=data.isFreeHit||false;
    e.partnershipRuns=data.partnershipRuns||0;e.partnershipBalls=data.partnershipBalls||0;
    e.isComplete=data.isComplete||false;e.result=data.result||null;e.winnerId=data.winnerId||null;
    e.innings1BattingTeamId=data.innings1BattingTeamId||data.battingTeamId||null;
    return e;
  }
}
