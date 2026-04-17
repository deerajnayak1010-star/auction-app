// ─────────────────────────────────────────────
// poster.js — HD Team Poster Generator (1080×1080)
// Square format optimized for Instagram & WhatsApp
// ─────────────────────────────────────────────

import { ROLE_CONFIG } from './data.js';
import { AuctionEngine } from './auction.js';

const POSTER_W = 1080;
const POSTER_H = 1080;

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

/** Draw square clipped image with rounded corners */
function drawSquareImage(ctx, img, x, y, size, radius = 8) {
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  // Cover-fit: crop to fill square from top
  const imgAspect = img.width / img.height;
  let dw = size, dh = size;
  if (imgAspect > 1) {
    dw = size * imgAspect;
  } else {
    dh = size / imgAspect;
  }
  const dx = x + (size - dw) / 2;
  const dy = y; // align from top
  ctx.drawImage(img, dx, dy, dw, dh);
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
 * Generate an HD team poster canvas (1080×1080 square).
 * @param {Object} team - Team state object (with squad, purse, totalSpent, etc.)
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function generateTeamPoster(team) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');

  // Enable high-quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // ── Background ────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, POSTER_H);
  bgGrad.addColorStop(0, '#070b1e');
  bgGrad.addColorStop(0.4, '#0d1230');
  bgGrad.addColorStop(1, '#070b1e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  // Subtle team color glow at top
  const glowGrad = ctx.createRadialGradient(POSTER_W / 2, 0, 30, POSTER_W / 2, 0, 500);
  glowGrad.addColorStop(0, hexToRgba(team.color, 0.25));
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, POSTER_W, 400);

  // ── Top accent bar ────────────────────────
  ctx.fillStyle = team.color;
  ctx.fillRect(0, 0, POSTER_W, 6);

  const PAD = 40; // side padding

  // ── Preload team images ────────────────────
  const [logoImg, ownerImg, iconPlayerImg] = await Promise.all([
    team.logo ? loadImage(team.logo) : Promise.resolve(null),
    team.ownerImage ? loadImage(team.ownerImage) : Promise.resolve(null),
    team.iconPlayerImage ? loadImage(team.iconPlayerImage) : Promise.resolve(null),
  ]);

  // ── Header: Badge + Team Name ──────────────
  const headerCenterY = 60;

  // Badge circle — use logo if available
  const badgeR = 32;
  const badgeCx = PAD + badgeR;
  const badgeCy = headerCenterY;

  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logoImg, badgeCx - badgeR, badgeCy - badgeR, badgeR * 2, badgeR * 2);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = team.color;
    ctx.fill();
    ctx.fillStyle = team.textColor || '#fff';
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(team.shortName, badgeCx, badgeCy);
  }

  // Badge border
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR + 2, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(team.color, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Team name
  const nameX = badgeCx + badgeR + 16;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
  ctx.fillText(team.name, nameX, headerCenterY - 10);

  // Owner + Icon under team name
  ctx.font = '14px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textBaseline = 'top';
  ctx.fillText(`Owner: ${team.owner || '—'}   •   Icon: ${team.iconPlayer || '—'}`, nameX, headerCenterY + 12);

  // ── Owner & Icon Player photos at top-right corner ──
  const avatarR = 22;
  const avatarY = headerCenterY;
  const avatarSpacing = 52;
  const avatarStartX = POSTER_W - PAD - avatarR;

  if (iconPlayerImg) {
    const ipX = avatarStartX;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ipX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(iconPlayerImg, ipX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(ipX, avatarY, avatarR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ICON', ipX, avatarY + avatarR + 4);
  }

  if (ownerImg) {
    const ownerX = avatarStartX - avatarSpacing;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ownerX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(ownerImg, ownerX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(ownerX, avatarY, avatarR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('OWNER', ownerX, avatarY + avatarR + 4);
  }

  // ── Stats Bar ─────────────────────────────
  const statsY = 115;
  const statsH = 60;
  roundRect(ctx, PAD, statsY, POSTER_W - PAD * 2, statsH, 12);
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

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#64748b';
    ctx.font = '600 10px "Segoe UI", Arial, sans-serif';
    ctx.fillText(s.label, sx, scy - 2);

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillText(s.value, sx, scy + 2);

    if (i < stats.length - 1) {
      const divX = PAD + statSlotW * (i + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(divX, statsY + 12, 1, statsH - 24);
    }
  });

  // ── Section Title ─────────────────────────
  const sectionY = 195;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
  ctx.fillText('SQUAD', PAD, sectionY);

  // Accent underline
  ctx.fillStyle = team.color;
  ctx.fillRect(PAD, sectionY + 28, 56, 3);

  // ── Player Grid (square images) ───────────
  const gridStartY = sectionY + 44;
  const cols = 2;
  const colGap = 12;
  const cellW = (POSTER_W - PAD * 2 - colGap) / cols;
  const photoSize = 72; // square photo size
  const cellH = photoSize + 16; // padding around photo
  const rowGap = 8;

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
    roundRect(ctx, cx, cy, cellW, cellH, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Player photo — SQUARE with rounded corners
    const photoX = cx + 10;
    const photoY = cy + (cellH - photoSize) / 2;
    const playerImg = playerImages[i];

    if (playerImg) {
      drawSquareImage(ctx, playerImg, photoX, photoY, photoSize, 8);
    } else {
      // Fallback: colored square with initials
      const rc = ROLE_COLORS[player.role] || '#6366f1';
      roundRect(ctx, photoX, photoY, photoSize, photoSize, 8);
      ctx.fillStyle = rc;
      ctx.fill();
      const parts = player.name.split(' ');
      const ini = parts.length === 1 ? parts[0][0] : (parts[0][0] + parts[parts.length - 1][0]);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ini.toUpperCase(), photoX + photoSize / 2, photoY + photoSize / 2);
    }

    // Photo border — square ring
    roundRect(ctx, photoX - 1, photoY - 1, photoSize + 2, photoSize + 2, 9);
    ctx.strokeStyle = hexToRgba(team.color, 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Text area (right of photo)
    const textX = photoX + photoSize + 12;
    const textMaxW = cellW - (textX - cx) - 10;

    // Player name
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    let dispName = player.name;
    while (ctx.measureText(dispName).width > textMaxW && dispName.length > 3) {
      dispName = dispName.slice(0, -1);
    }
    if (dispName !== player.name) dispName += '…';
    ctx.fillText(dispName, textX, cy + 14);

    // Role + WK badge
    const roleColor = ROLE_COLORS[player.role] || '#6366f1';
    const roleIcon = ROLE_CONFIG[player.role]?.icon || '';
    ctx.fillStyle = roleColor;
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`${roleIcon} ${player.role}${player.isWK ? ' 🧤' : ''}`, textX, cy + 36);

    // Price — right-aligned within cell
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(fmt(player.soldPrice), cx + cellW - 10, cy + 60);
    ctx.textAlign = 'left'; // reset
  }

  // ── Empty slots ───────────────────────────
  if (team.squad.length < 14) {
    const emptyCount = 14 - team.squad.length;
    const emptyY = gridStartY + Math.ceil(team.squad.length / cols) * (cellH + rowGap) + 10;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#475569';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`${emptyCount} slot${emptyCount > 1 ? 's' : ''} remaining`, POSTER_W / 2, emptyY);
  }

  // ── Footer ────────────────────────────────
  const footerY = POSTER_H - 55;

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(PAD, footerY, POSTER_W - PAD * 2, 1);

  // Branding
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#64748b';
  ctx.font = '600 12px "Segoe UI", Arial, sans-serif';
  ctx.fillText('NAKRE PREMIER LEAGUE 3.0  •  2026 AUCTION', POSTER_W / 2, footerY + 16);

  // Bottom accent
  ctx.fillStyle = team.color;
  ctx.fillRect(0, POSTER_H - 5, POSTER_W, 5);

  // Bottom glow
  const bottomGlow = ctx.createRadialGradient(POSTER_W / 2, POSTER_H, 30, POSTER_W / 2, POSTER_H, 300);
  bottomGlow.addColorStop(0, hexToRgba(team.color, 0.1));
  bottomGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, POSTER_H - 300, POSTER_W, 300);

  return canvas;
}

/**
 * Download a canvas as a high-quality PNG file.
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
  }, 'image/png', 1.0); // max quality PNG
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
    downloadCanvas(canvas, `NPL3_2026_${team.shortName}_Squad.png`);
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
  img.src = canvas.toDataURL('image/png', 1.0);
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
