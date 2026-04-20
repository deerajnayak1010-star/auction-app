// ─────────────────────────────────────────────
// gallery.js — Photo Gallery & Social Card Manager
// Upload, organize, and generate match result cards
// ─────────────────────────────────────────────

export class GalleryManager {
  constructor() {
    this.photos = []; // { id, matchId, dataUrl, caption, day, timestamp }
    this.nextId = 1;
  }

  addPhoto(matchId, dataUrl, caption = '', day = 'Day 1') {
    const photo = {
      id: this.nextId++,
      matchId,
      dataUrl,
      caption,
      day,
      timestamp: Date.now(),
    };
    this.photos.push(photo);
    return photo;
  }

  removePhoto(id) {
    this.photos = this.photos.filter(p => p.id !== id);
  }

  getPhotos(filter = 'all') {
    if (filter === 'all') return [...this.photos];
    if (filter === 'Day 1' || filter === 'Day 2') return this.photos.filter(p => p.day === filter);
    return this.photos.filter(p => p.matchId === filter);
  }

  /**
   * Generate a match result social media card using Canvas.
   * @returns {HTMLCanvasElement}
   */
  static async generateResultCard(match, teamLogos = {}, potmImagePath = '') {
    const W = 1080, H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#070b1e');
    grad.addColorStop(0.3, '#0d1230');
    grad.addColorStop(0.7, '#131940');
    grad.addColorStop(1, '#070b1e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle radial glow behind teams
    const glow = ctx.createRadialGradient(W / 2, 300, 50, W / 2, 300, 450);
    glow.addColorStop(0, 'rgba(99,102,241,0.06)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Top accent line (team colors gradient)
    const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
    accentGrad.addColorStop(0, match.teamAColor || '#3b82f6');
    accentGrad.addColorStop(0.5, '#f59e0b');
    accentGrad.addColorStop(1, match.teamBColor || '#ef4444');
    ctx.fillStyle = accentGrad;
    ctx.fillRect(0, 0, W, 6);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NAKRE PREMIER LEAGUE 3.0', W / 2, 65);

    ctx.font = '20px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Match ${match.matchId?.replace('match-', '') || ''} • ${match.date || ''}`, W / 2, 100);

    // ── Team A section (left) ──
    ctx.fillStyle = match.teamAColor || '#3b82f6';
    GalleryManager._roundRect(ctx, 60, 140, 440, 300, 20);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(match.teamAShort, 280, 230);

    ctx.font = '18px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(match.teamAName, 280, 265);

    ctx.font = 'bold 80px Outfit, sans-serif';
    ctx.fillStyle = '#ffffff';
    const inn1Score = `${match.innings1?.totalRuns || 0}/${match.innings1?.wickets || 0}`;
    ctx.fillText(inn1Score, 280, 370);

    ctx.font = '22px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`(${match.innings1?.overs || '0.0'} ov)`, 280, 410);

    // ── Team B section (right) ──
    ctx.fillStyle = match.teamBColor || '#ef4444';
    GalleryManager._roundRect(ctx, 580, 140, 440, 300, 20);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(match.teamBShort, 800, 230);

    ctx.font = '18px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(match.teamBName, 800, 265);

    ctx.font = 'bold 80px Outfit, sans-serif';
    ctx.fillStyle = '#ffffff';
    const inn2Score = `${match.innings2?.totalRuns || 0}/${match.innings2?.wickets || 0}`;
    ctx.fillText(inn2Score, 800, 370);

    ctx.font = '22px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`(${match.innings2?.overs || '0.0'} ov)`, 800, 410);

    // ── VS divider ──
    ctx.fillStyle = '#1a1f3d';
    ctx.beginPath();
    ctx.arc(W / 2, 290, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245,158,11,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, 290, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 24px Outfit, sans-serif';
    ctx.fillText('VS', W / 2, 298);

    // ── Result banner ──
    let resultY = 500;
    if (match.result?.margin) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      GalleryManager._roundRect(ctx, 80, resultY, W - 160, 90, 16);
      ctx.fill();

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 2;
      GalleryManager._roundRect(ctx, 80, resultY, W - 160, 90, 16);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 34px Outfit, sans-serif';
      ctx.fillText(`🏆 ${match.result.margin}`, W / 2, resultY + 55);
    }

    // ── Player of the Match section with photo ──
    let potmY = 640;
    if (match.result?.playerOfMatch) {
      // Try to load POTM photo
      let potmImg = null;
      if (potmImagePath) {
        try {
          potmImg = await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = potmImagePath;
            setTimeout(() => resolve(null), 3000);
          });
        } catch(e) { potmImg = null; }
      }

      const potmCardH = potmImg ? 300 : 180;
      // POTM card background
      const potmGrad = ctx.createLinearGradient(120, potmY, W - 120, potmY + potmCardH);
      potmGrad.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
      potmGrad.addColorStop(0.5, 'rgba(139, 92, 246, 0.08)');
      potmGrad.addColorStop(1, 'rgba(99, 102, 241, 0.12)');
      ctx.fillStyle = potmGrad;
      GalleryManager._roundRect(ctx, 120, potmY, W - 240, potmCardH, 16);
      ctx.fill();

      // POTM border
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
      ctx.lineWidth = 1.5;
      GalleryManager._roundRect(ctx, 120, potmY, W - 240, potmCardH, 16);
      ctx.stroke();

      // Star accent line
      const starGrad = ctx.createLinearGradient(200, potmY, W - 200, potmY);
      starGrad.addColorStop(0, 'transparent');
      starGrad.addColorStop(0.5, 'rgba(245,158,11,0.6)');
      starGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = starGrad;
      ctx.fillRect(200, potmY, W - 400, 2);

      if (potmImg) {
        // Layout: Photo on left, text on right
        const photoR = 75;
        const photoCX = 280;
        const photoCY = potmY + 100;

        // Gradient ring around photo
        ctx.save();
        ctx.beginPath();
        ctx.arc(photoCX, photoCY, photoR + 4, 0, Math.PI * 2);
        const ringGrad = ctx.createLinearGradient(photoCX - photoR, photoCY - photoR, photoCX + photoR, photoCY + photoR);
        ringGrad.addColorStop(0, '#f59e0b');
        ringGrad.addColorStop(0.5, '#a78bfa');
        ringGrad.addColorStop(1, '#f59e0b');
        ctx.strokeStyle = ringGrad;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();

        // Circular clip for player photo
        ctx.save();
        ctx.beginPath();
        ctx.arc(photoCX, photoCY, photoR, 0, Math.PI * 2);
        ctx.clip();
        const aspect = potmImg.width / potmImg.height;
        let sx = 0, sy = 0, sw = potmImg.width, sh = potmImg.height;
        if (aspect > 1) { sx = (potmImg.width - potmImg.height) / 2; sw = potmImg.height; }
        else { sy = (potmImg.height - potmImg.width) / 2; sh = potmImg.width; }
        ctx.drawImage(potmImg, sx, sy, sw, sh, photoCX - photoR, photoCY - photoR, photoR * 2, photoR * 2);
        ctx.restore();

        // Text on right side
        const textX = 560;
        ctx.fillStyle = '#a78bfa';
        ctx.font = '16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⭐ PLAYER OF THE MATCH ⭐', textX, potmY + 50);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px Outfit, sans-serif';
        ctx.fillText(match.result.playerOfMatch, textX, potmY + 105);

        ctx.fillStyle = 'rgba(245,158,11,0.4)';
        ctx.fillRect(textX - 50, potmY + 125, 100, 2);

        // Performance stats
        const allBatting = [...(match.innings1?.batting || []), ...(match.innings2?.batting || [])];
        const allBowling = [...(match.innings1?.bowling || []), ...(match.innings2?.bowling || [])];
        const potmBat = allBatting.find(b => b.name === match.result.playerOfMatch && (b.didBat || parseInt(b.runs) > 0));
        const potmBowl = allBowling.find(b => b.name === match.result.playerOfMatch && (b.didBowl || parseInt(b.wickets) > 0));
        let perfParts = [];
        if (potmBat) perfParts.push(`${potmBat.runs}(${potmBat.balls})`);
        if (potmBowl && parseInt(potmBowl.wickets) > 0) perfParts.push(`${potmBowl.wickets}/${potmBowl.runs}`);
        if (perfParts.length > 0) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '22px Inter, sans-serif';
          ctx.fillText(perfParts.join(' • '), textX, potmY + 165);
        }

        // Additional batting/bowling details
        let detailY = potmY + 200;
        if (potmBat) {
          ctx.fillStyle = '#64748b';
          ctx.font = '16px Inter, sans-serif';
          ctx.fillText(`${potmBat.fours || 0}×4  ${potmBat.sixes || 0}×6  SR: ${potmBat.strikeRate || '-'}`, textX, detailY);
          detailY += 28;
        }
        if (potmBowl && parseInt(potmBowl.wickets) > 0) {
          ctx.fillStyle = '#64748b';
          ctx.font = '16px Inter, sans-serif';
          ctx.fillText(`${potmBowl.overs || 0} ov  Eco: ${potmBowl.economy || '-'}`, textX, detailY);
        }
      } else {
        // No photo — centered text layout
        ctx.fillStyle = '#a78bfa';
        ctx.font = '16px Inter, sans-serif';
        ctx.fillText('⭐ PLAYER OF THE MATCH ⭐', W / 2, potmY + 45);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px Outfit, sans-serif';
        ctx.fillText(match.result.playerOfMatch, W / 2, potmY + 110);

        ctx.fillStyle = 'rgba(245,158,11,0.4)';
        ctx.fillRect(W / 2 - 60, potmY + 130, 120, 2);

        const allBatting = [...(match.innings1?.batting || []), ...(match.innings2?.batting || [])];
        const allBowling = [...(match.innings1?.bowling || []), ...(match.innings2?.bowling || [])];
        const potmBat = allBatting.find(b => b.name === match.result.playerOfMatch && (b.didBat || parseInt(b.runs) > 0));
        const potmBowl = allBowling.find(b => b.name === match.result.playerOfMatch && (b.didBowl || parseInt(b.wickets) > 0));
        let perfText = '';
        if (potmBat) perfText += `${potmBat.runs}(${potmBat.balls})`;
        if (potmBowl && parseInt(potmBowl.wickets) > 0) perfText += `${perfText ? ' • ' : ''}${potmBowl.wickets}/${potmBowl.runs}`;
        if (perfText) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '20px Inter, sans-serif';
          ctx.fillText(perfText, W / 2, potmY + 165);
        }
      }
      potmY += (potmImg ? 330 : 210);
    }

    // ── Key performers section ──
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    GalleryManager._roundRect(ctx, 60, potmY, W - 120, 260, 16);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    GalleryManager._roundRect(ctx, 60, potmY, W - 120, 260, 16);
    ctx.stroke();

    // Top performers from innings
    const topBat1 = match.innings1?.batting?.filter(b => b.didBat || parseInt(b.runs) > 0).sort((a, b) => (parseInt(b.runs) || 0) - (parseInt(a.runs) || 0))[0];
    const topBat2 = match.innings2?.batting?.filter(b => b.didBat || parseInt(b.runs) > 0).sort((a, b) => (parseInt(b.runs) || 0) - (parseInt(a.runs) || 0))[0];
    const topBowl1 = match.innings1?.bowling?.filter(b => b.didBowl || parseInt(b.wickets) > 0).sort((a, b) => (parseInt(b.wickets) || 0) - (parseInt(a.wickets) || 0))[0];
    const topBowl2 = match.innings2?.bowling?.filter(b => b.didBowl || parseInt(b.wickets) > 0).sort((a, b) => (parseInt(b.wickets) || 0) - (parseInt(a.wickets) || 0))[0];

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText('KEY PERFORMERS', W / 2, potmY + 35);

    ctx.font = '22px Inter, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    const performers = [];
    if (topBat1) performers.push(`🏏 ${topBat1.name}: ${topBat1.runs}(${topBat1.balls})`);
    if (topBat2) performers.push(`🏏 ${topBat2.name}: ${topBat2.runs}(${topBat2.balls})`);
    if (topBowl1 && parseInt(topBowl1.wickets) > 0) performers.push(`🎯 ${topBowl1.name}: ${topBowl1.wickets}/${topBowl1.runs}`);
    if (topBowl2 && parseInt(topBowl2.wickets) > 0) performers.push(`🎯 ${topBowl2.name}: ${topBowl2.wickets}/${topBowl2.runs}`);

    performers.slice(0, 4).forEach((text, i) => {
      ctx.fillText(text, W / 2, potmY + 80 + i * 42);
    });

    // ── Footer branding ──
    // Bottom accent line
    const bottomGrad = ctx.createLinearGradient(0, 0, W, 0);
    bottomGrad.addColorStop(0, match.teamAColor || '#3b82f6');
    bottomGrad.addColorStop(0.5, '#f59e0b');
    bottomGrad.addColorStop(1, match.teamBColor || '#ef4444');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, H - 6, W, 6);

    ctx.fillStyle = '#475569';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText('NPL 3.0 • 2026 • Nakre', W / 2, H - 25);

    return canvas;
  }

  static _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  serialize() {
    return { photos: this.photos, nextId: this.nextId };
  }

  static restore(data) {
    const mgr = new GalleryManager();
    if (data) {
      mgr.photos = data.photos || [];
      mgr.nextId = data.nextId || 1;
    }
    return mgr;
  }
}
