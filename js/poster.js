// ─────────────────────────────────────────────
// poster.js — HD Team Poster Generator
// ─────────────────────────────────────────────

import { ROLE_CONFIG } from './data.js';
import { AuctionEngine } from './auction.js';

const POSTER_W = 1200;
const POSTER_H = 1800;

const ROLE_COLORS = {
  'Batsman':     '#3b82f6',
  'Bowler':      '#ef4444',
  'All-Rounder': '#f59e0b',
};

function fmt(pts) {
  return AuctionEngine.formatPoints(pts);
}

/** Load an image from a URL, returns a promise */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // resolve null on error so poster still generates
    img.src = src;
  });
}

/** Draw rounded rectangle */
function roundRect(ctx, x, y, w, h, r) {
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

/** Draw circular clipped image */
function drawCircularImage(ctx, img, cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // Draw image covering the circle, positioned from top
  const size = radius * 2;
  ctx.drawImage(img, cx - radius, cy - radius, size, size);
  ctx.restore();
}

/** Hex to RGBA */
function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Generate an HD team poster canvas.
 * @param {Object} team - Team state object (with squad, purse, totalSpent, etc.)
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function generateTeamPoster(team) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');

  // ── Background ────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, POSTER_H);
  bgGrad.addColorStop(0, '#070b1e');
  bgGrad.addColorStop(0.3, '#0d1230');
  bgGrad.addColorStop(1, '#070b1e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  // Subtle team color glow at top
  const glowGrad = ctx.createRadialGradient(POSTER_W / 2, 0, 50, POSTER_W / 2, 0, 600);
  glowGrad.addColorStop(0, hexToRgba(team.color, 0.3));
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, POSTER_W, 500);

  // ── Top accent bar ────────────────────────
  ctx.fillStyle = team.color;
  ctx.fillRect(0, 0, POSTER_W, 8);

  const PAD = 60; // consistent side padding

  // ── Preload team images ────────────────────
  const [logoImg, ownerImg, iconPlayerImg] = await Promise.all([
    team.logo ? loadImage(team.logo) : Promise.resolve(null),
    team.ownerImage ? loadImage(team.ownerImage) : Promise.resolve(null),
    team.iconPlayerImage ? loadImage(team.iconPlayerImage) : Promise.resolve(null),
  ]);

  // ── Header: Badge + Team Name (centered) ──
  const headerCenterY = 90;

  // Badge circle — use logo if available
  const badgeR = 42;
  const badgeCx = PAD + badgeR;
  const badgeCy = headerCenterY;

  if (logoImg) {
    // Draw logo image in circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const logoSize = badgeR * 2;
    ctx.drawImage(logoImg, badgeCx - badgeR, badgeCy - badgeR, logoSize, logoSize);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = team.color;
    ctx.fill();
    ctx.fillStyle = team.textColor || '#fff';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(team.shortName, badgeCx, badgeCy);
  }

  // Badge border
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR + 2, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(team.color, 0.4);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Team name — to the right of badge
  const nameX = badgeCx + badgeR + 24;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 42px "Segoe UI", Arial, sans-serif';
  ctx.fillText(team.name, nameX, headerCenterY - 14);

  // Owner + Icon under team name
  ctx.font = '18px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textBaseline = 'top';
  ctx.fillText(`Owner: ${team.owner || '—'}   •   Icon: ${team.iconPlayer || '—'}`, nameX, headerCenterY + 16);

  // ── Owner & Icon Player photos at top-right corner ──
  const avatarR = 28;
  const avatarY = headerCenterY;
  const avatarSpacing = 66;
  const avatarStartX = POSTER_W - PAD - avatarR;

  // Icon Player photo (rightmost)
  if (iconPlayerImg) {
    const ipX = avatarStartX;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ipX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(iconPlayerImg, ipX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();
    // Gold border for icon player
    ctx.beginPath();
    ctx.arc(ipX, avatarY, avatarR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Label
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ICON', ipX, avatarY + avatarR + 6);
  }

  // Owner photo (to the left of icon player)
  if (ownerImg) {
    const ownerX = avatarStartX - avatarSpacing;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ownerX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(ownerImg, ownerX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();
    // White border for owner
    ctx.beginPath();
    ctx.arc(ownerX, avatarY, avatarR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Label
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('OWNER', ownerX, avatarY + avatarR + 6);
  }

  // ── Stats Bar ─────────────────────────────
  const statsY = 170;
  const statsH = 80;
  roundRect(ctx, PAD, statsY, POSTER_W - PAD * 2, statsH, 14);
  ctx.fillStyle = hexToRgba(team.color, 0.1);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(team.color, 0.25);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const stats = [
    { label: 'SQUAD', value: `${team.squad.length} / 14` },
    { label: 'TOTAL SPENT', value: fmt(team.totalSpent) },
    { label: 'PURSE LEFT', value: fmt(team.purse) },
  ];
  const statAreaW = POSTER_W - PAD * 2;
  const statSlotW = statAreaW / stats.length;

  stats.forEach((s, i) => {
    const sx = PAD + statSlotW * i + statSlotW / 2;
    const scy = statsY + statsH / 2;

    // Label above center
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#64748b';
    ctx.font = '600 12px "Segoe UI", Arial, sans-serif';
    ctx.fillText(s.label, sx, scy - 4);

    // Value below center
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText(s.value, sx, scy + 2);

    // Vertical divider between stats (not after last)
    if (i < stats.length - 1) {
      const divX = PAD + statSlotW * (i + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(divX, statsY + 16, 1, statsH - 32);
    }
  });

  // ── Section Title ─────────────────────────
  const sectionY = 285;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
  ctx.fillText('SQUAD', PAD, sectionY);

  // Accent underline
  ctx.fillStyle = team.color;
  ctx.fillRect(PAD, sectionY + 36, 70, 3);

  // ── Player Grid ───────────────────────────
  const gridStartY = sectionY + 56;
  const cols = 2;
  const colGap = 16;
  const cellW = (POSTER_W - PAD * 2 - colGap) / cols;
  const cellH = 120;
  const rowGap = 12;
  const photoR = 48;

  // Preload all player images
  const imagePromises = team.squad.map(p =>
    p.image ? loadImage(p.image) : Promise.resolve(null)
  );
  const playerImages = await Promise.all(imagePromises);

  for (let i = 0; i < team.squad.length; i++) {
    const player = team.squad[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = PAD + col * (cellW + colGap);
    const cy = gridStartY + row * (cellH + rowGap);

    // Card background
    roundRect(ctx, cx, cy, cellW, cellH, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Player photo
    const photoCx = cx + 16 + photoR;
    const photoCy = cy + cellH / 2;
    const playerImg = playerImages[i];

    if (playerImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(photoCx, photoCy, photoR, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const imgAspect = playerImg.width / playerImg.height;
      let dw = photoR * 2, dh = photoR * 2;
      if (imgAspect > 1) dw = dh * imgAspect;
      else dh = dw / imgAspect;
      ctx.drawImage(playerImg, photoCx - dw / 2, photoCy - photoR, dw, dh);
      ctx.restore();
    } else {
      const rc = ROLE_COLORS[player.role] || '#6366f1';
      ctx.beginPath();
      ctx.arc(photoCx, photoCy, photoR, 0, Math.PI * 2);
      ctx.fillStyle = rc;
      ctx.fill();
      const parts = player.name.split(' ');
      const ini = parts.length === 1 ? parts[0][0] : (parts[0][0] + parts[parts.length - 1][0]);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ini.toUpperCase(), photoCx, photoCy);
    }

    // Photo ring — thick and visible
    ctx.beginPath();
    ctx.arc(photoCx, photoCy, photoR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(team.color, 0.7);
    ctx.lineWidth = 3;
    ctx.stroke();

    // Text area (right of photo)
    const textX = photoCx + photoR + 18;
    const textMaxW = cellW - (textX - cx) - 14;

    // Player name — bigger font
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    // Truncate name if too long
    let dispName = player.name;
    while (ctx.measureText(dispName).width > textMaxW && dispName.length > 3) {
      dispName = dispName.slice(0, -1);
    }
    if (dispName !== player.name) dispName += '…';
    ctx.fillText(dispName, textX, cy + 22);

    // Role + WK badge
    const roleColor = ROLE_COLORS[player.role] || '#6366f1';
    const roleIcon = ROLE_CONFIG[player.role]?.icon || '';
    ctx.fillStyle = roleColor;
    ctx.font = '15px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`${roleIcon} ${player.role}${player.isWK ? ' 🧤' : ''}`, textX, cy + 50);

    // Price — right-aligned within cell
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(fmt(player.soldPrice), cx + cellW - 14, cy + 78);
    ctx.textAlign = 'left'; // reset
  }

  // ── Empty slots ───────────────────────────
  if (team.squad.length < 14) {
    const emptyCount = 14 - team.squad.length;
    const emptyY = gridStartY + Math.ceil(team.squad.length / cols) * (cellH + rowGap) + 16;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#475569';
    ctx.font = '15px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`${emptyCount} slot${emptyCount > 1 ? 's' : ''} remaining`, POSTER_W / 2, emptyY);
  }

  // ── Footer ────────────────────────────────
  const footerY = POSTER_H - 80;

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(PAD, footerY, POSTER_W - PAD * 2, 1);

  // Branding
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px "Segoe UI", Arial, sans-serif';
  ctx.fillText('NAKRE PREMIER LEAGUE  •  2025 AUCTION', POSTER_W / 2, footerY + 24);

  // Bottom accent
  ctx.fillStyle = team.color;
  ctx.fillRect(0, POSTER_H - 6, POSTER_W, 6);

  // Bottom glow
  const bottomGlow = ctx.createRadialGradient(POSTER_W / 2, POSTER_H, 50, POSTER_W / 2, POSTER_H, 350);
  bottomGlow.addColorStop(0, hexToRgba(team.color, 0.12));
  bottomGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, POSTER_H - 350, POSTER_W, 350);

  return canvas;
}

/**
 * Download a canvas as a PNG file.
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename
 */
export function downloadCanvas(canvas, filename) {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * Generate and download all team posters as individual PNGs.
 * @param {Array} teams - Array of team state objects
 * @param {Function} onProgress - Callback(teamIndex, total) for progress
 */
export async function downloadAllPosters(teams, onProgress) {
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    if (onProgress) onProgress(i, teams.length);
    const canvas = await generateTeamPoster(team);
    downloadCanvas(canvas, `NPL_2025_${team.shortName}_Squad.png`);
    // Small delay between downloads so browser doesn't block
    await new Promise(r => setTimeout(r, 500));
  }
  if (onProgress) onProgress(teams.length, teams.length);
}

/**
 * Show a poster preview in a modal overlay.
 * @param {HTMLCanvasElement} canvas
 */
export function showPosterPreview(canvas) {
  const overlay = document.createElement('div');
  overlay.id = 'poster-preview-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:10000;
    background:rgba(0,0,0,0.85);
    display:flex; align-items:center; justify-content:center;
    flex-direction:column; gap:16px;
    animation: fadeIn 0.3s ease;
    cursor:pointer;
  `;

  const img = document.createElement('img');
  img.src = canvas.toDataURL('image/png');
  img.style.cssText = `
    max-height:85vh; max-width:90vw;
    border-radius:12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  `;

  const hint = document.createElement('div');
  hint.textContent = 'Click anywhere to close • Right-click image to save';
  hint.style.cssText = 'color:#94a3b8; font-size:14px; font-family:Inter,sans-serif;';

  overlay.appendChild(img);
  overlay.appendChild(hint);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => overlay.remove());
}
