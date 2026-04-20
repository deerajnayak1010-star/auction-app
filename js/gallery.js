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
  static async generateResultCard(match, teamLogos = {}) {
    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0a0e27');
    grad.addColorStop(0.5, '#131836');
    grad.addColorStop(1, '#0a0e27');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Top accent line
    const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
    accentGrad.addColorStop(0, match.teamAColor || '#3b82f6');
    accentGrad.addColorStop(1, match.teamBColor || '#ef4444');
    ctx.fillStyle = accentGrad;
    ctx.fillRect(0, 0, W, 6);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NAKRE PREMIER LEAGUE 3.0', W / 2, 60);

    ctx.font = '20px Inter, sans-serif';
    ctx.fillStyle = '#a0aec0';
    ctx.fillText(`Match ${match.matchId?.replace('match-', '') || ''} • ${match.date || ''}`, W / 2, 95);

    // Team A section (left)
    ctx.fillStyle = match.teamAColor || '#3b82f6';
    GalleryManager._roundRect(ctx, 60, 140, 440, 280, 16);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(match.teamAShort, 280, 220);

    ctx.font = '18px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(match.teamAName, 280, 260);

    // Score
    ctx.font = 'bold 72px Outfit, sans-serif';
    ctx.fillStyle = '#ffffff';
    const inn1Score = `${match.innings1?.totalRuns || 0}/${match.innings1?.wickets || 0}`;
    ctx.fillText(inn1Score, 280, 360);

    ctx.font = '20px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`(${match.innings1?.overs || '0.0'} ov)`, 280, 400);

    // Team B section (right)
    ctx.fillStyle = match.teamBColor || '#ef4444';
    GalleryManager._roundRect(ctx, 580, 140, 440, 280, 16);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(match.teamBShort, 800, 220);

    ctx.font = '18px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(match.teamBName, 800, 260);

    ctx.font = 'bold 72px Outfit, sans-serif';
    ctx.fillStyle = '#ffffff';
    const inn2Score = `${match.innings2?.totalRuns || 0}/${match.innings2?.wickets || 0}`;
    ctx.fillText(inn2Score, 800, 360);

    ctx.font = '20px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`(${match.innings2?.overs || '0.0'} ov)`, 800, 400);

    // VS divider
    ctx.fillStyle = '#1a1f3d';
    ctx.beginPath();
    ctx.arc(W / 2, 280, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 24px Outfit, sans-serif';
    ctx.fillText('VS', W / 2, 290);

    // Result banner
    if (match.result?.margin) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      GalleryManager._roundRect(ctx, 100, 480, W - 200, 90, 12);
      ctx.fill();

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 2;
      GalleryManager._roundRect(ctx, 100, 480, W - 200, 90, 12);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 32px Outfit, sans-serif';
      ctx.fillText(`🏆 ${match.result.margin}`, W / 2, 535);
    }

    // MOTM section
    if (match.result?.playerOfMatch) {
      ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
      GalleryManager._roundRect(ctx, 100, 600, W - 200, 120, 12);
      ctx.fill();

      ctx.fillStyle = '#a78bfa';
      ctx.font = '18px Inter, sans-serif';
      ctx.fillText('⭐ MAN OF THE MATCH', W / 2, 640);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px Outfit, sans-serif';
      ctx.fillText(match.result.playerOfMatch, W / 2, 695);
    }

    // Key stats section
    const y = 770;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    GalleryManager._roundRect(ctx, 60, y, W - 120, 200, 12);
    ctx.fill();

    // Top performers from innings
    const topBat1 = match.innings1?.batting?.filter(b => b.didBat || parseInt(b.runs) > 0).sort((a, b) => (parseInt(b.runs) || 0) - (parseInt(a.runs) || 0))[0];
    const topBat2 = match.innings2?.batting?.filter(b => b.didBat || parseInt(b.runs) > 0).sort((a, b) => (parseInt(b.runs) || 0) - (parseInt(a.runs) || 0))[0];
    const topBowl1 = match.innings1?.bowling?.filter(b => b.didBowl || parseInt(b.wickets) > 0).sort((a, b) => (parseInt(b.wickets) || 0) - (parseInt(a.wickets) || 0))[0];
    const topBowl2 = match.innings2?.bowling?.filter(b => b.didBowl || parseInt(b.wickets) > 0).sort((a, b) => (parseInt(b.wickets) || 0) - (parseInt(a.wickets) || 0))[0];

    ctx.fillStyle = '#a0aec0';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText('KEY PERFORMERS', W / 2, y + 30);

    ctx.font = '22px Inter, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    const performers = [];
    if (topBat1) performers.push(`🏏 ${topBat1.name}: ${topBat1.runs}(${topBat1.balls})`);
    if (topBat2) performers.push(`🏏 ${topBat2.name}: ${topBat2.runs}(${topBat2.balls})`);
    if (topBowl1 && parseInt(topBowl1.wickets) > 0) performers.push(`🎯 ${topBowl1.name}: ${topBowl1.wickets}/${topBowl1.runs}`);
    if (topBowl2 && parseInt(topBowl2.wickets) > 0) performers.push(`🎯 ${topBowl2.name}: ${topBowl2.wickets}/${topBowl2.runs}`);

    performers.slice(0, 4).forEach((text, i) => {
      ctx.fillText(text, W / 2, y + 70 + i * 36);
    });

    // Footer branding
    ctx.fillStyle = '#4a5568';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText('NPL 3.0 • 2026 • Nakre', W / 2, H - 30);

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
