// Hats from the coin shop, drawn on the hero's head in the fish's local space (facing right,
// centered on its middle, scaled by its size r), so they grow with it: a crown on a fish that fills
// the screen is part of the fun.

import type { Hat } from "./shop";

const INK = "rgba(20, 20, 30, 0.85)";

export function drawHat(ctx: CanvasRenderingContext2D, hat: Hat, r: number, time: number): void {
  const lw = Math.max(1, r * 0.035);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  if (hat === "shades") {
    shades(ctx, r);
    ctx.restore();
    return;
  }
  // sit on the top of the head, tipped forward a little to follow its slope
  ctx.translate(r * 0.5, r * -0.46);
  ctx.rotate(hat === "bow" ? 0.1 : 0.28);
  const u = r * 0.36; // hat size
  if (hat === "party") party(ctx, u, time);
  else if (hat === "bow") bow(ctx, u);
  else if (hat === "pirate") pirate(ctx, u);
  else if (hat === "tophat") topHat(ctx, u);
  else if (hat === "crown") crown(ctx, u, time); // and an unknown hat draws nothing
  ctx.restore();
}

function party(ctx: CanvasRenderingContext2D, u: number, time: number): void {
  const w = u * 0.55;
  const h = u * 1.6;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(0, -h);
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fillStyle = "#3db7e4";
  ctx.fill();
  // stripes, clipped to the cone
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = u * 0.16;
  for (let i = 0; i < 4; i++) {
    const y = -h * (0.15 + i * 0.25);
    ctx.beginPath();
    ctx.moveTo(-w, y + u * 0.25);
    ctx.lineTo(w, y - u * 0.15);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(0, -h);
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.stroke();
  // pompom, with a little bounce
  const bob = Math.sin(time * 6) * u * 0.04;
  ctx.beginPath();
  ctx.arc(0, -h - u * 0.12 + bob, u * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "#ff5fa2";
  ctx.fill();
  ctx.stroke();
}

function bow(ctx: CanvasRenderingContext2D, u: number): void {
  ctx.fillStyle = "#ff5fa2";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -u * 0.2);
    ctx.quadraticCurveTo(s * u * 0.5, -u * 0.95, s * u * 0.85, -u * 0.55);
    ctx.quadraticCurveTo(s * u * 0.9, -u * 0.05, 0, -u * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // shine on each loop
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * u * 0.5, -u * 0.6, u * 0.12, u * 0.06, s * -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, -u * 0.22, u * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "#e0367f";
  ctx.fill();
  ctx.stroke();
}

function pirate(ctx: CanvasRenderingContext2D, u: number): void {
  // a tricorn from the side: a crown with the brim turned up at both ends
  ctx.beginPath();
  ctx.moveTo(-u * 1.05, -u * 0.45);
  ctx.quadraticCurveTo(-u * 0.7, u * 0.12, 0, u * 0.08);
  ctx.quadraticCurveTo(u * 0.7, u * 0.12, u * 1.05, -u * 0.45);
  ctx.quadraticCurveTo(u * 0.75, -u * 0.25, u * 0.55, -u * 0.35);
  ctx.quadraticCurveTo(u * 0.45, -u * 1.15, 0, -u * 1.15);
  ctx.quadraticCurveTo(-u * 0.45, -u * 1.15, -u * 0.55, -u * 0.35);
  ctx.quadraticCurveTo(-u * 0.75, -u * 0.25, -u * 1.05, -u * 0.45);
  ctx.closePath();
  ctx.fillStyle = "#23232b";
  ctx.fill();
  ctx.stroke();
  // gold trim along the brim
  ctx.strokeStyle = "#e8b84a";
  ctx.lineWidth = Math.max(1, u * 0.07);
  ctx.beginPath();
  ctx.moveTo(-u * 0.98, -u * 0.38);
  ctx.quadraticCurveTo(-u * 0.68, u * 0.06, 0, u * 0.02);
  ctx.quadraticCurveTo(u * 0.68, u * 0.06, u * 0.98, -u * 0.38);
  ctx.stroke();
  // skull and crossbones
  const sy = -u * 0.62;
  ctx.strokeStyle = "#f3efe2";
  ctx.lineWidth = Math.max(1, u * 0.07);
  ctx.beginPath();
  ctx.moveTo(-u * 0.22, sy + u * 0.02);
  ctx.lineTo(u * 0.22, sy + u * 0.3);
  ctx.moveTo(u * 0.22, sy + u * 0.02);
  ctx.lineTo(-u * 0.22, sy + u * 0.3);
  ctx.stroke();
  ctx.fillStyle = "#f3efe2";
  ctx.beginPath();
  ctx.arc(0, sy, u * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#23232b";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * u * 0.055, sy - u * 0.01, u * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
}

function topHat(ctx: CanvasRenderingContext2D, u: number): void {
  // brim
  ctx.beginPath();
  ctx.ellipse(0, 0, u * 0.75, u * 0.14, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#1d1d24";
  ctx.fill();
  ctx.stroke();
  // crown, a little wider at the top
  ctx.beginPath();
  ctx.moveTo(-u * 0.45, -u * 0.05);
  ctx.lineTo(-u * 0.5, -u * 1.25);
  ctx.quadraticCurveTo(0, -u * 1.35, u * 0.5, -u * 1.25);
  ctx.lineTo(u * 0.45, -u * 0.05);
  ctx.quadraticCurveTo(0, u * 0.05, -u * 0.45, -u * 0.05);
  ctx.closePath();
  ctx.fillStyle = "#26262f";
  ctx.fill();
  ctx.stroke();
  // band
  ctx.beginPath();
  ctx.moveTo(-u * 0.46, -u * 0.22);
  ctx.lineTo(-u * 0.47, -u * 0.45);
  ctx.quadraticCurveTo(0, -u * 0.52, u * 0.47, -u * 0.45);
  ctx.lineTo(u * 0.46, -u * 0.22);
  ctx.quadraticCurveTo(0, -u * 0.15, -u * 0.46, -u * 0.22);
  ctx.closePath();
  ctx.fillStyle = "#d83a4a";
  ctx.fill();
  // sheen down one side
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(u * 0.18, -u * 1.2, u * 0.12, u * 0.7);
}

function crown(ctx: CanvasRenderingContext2D, u: number, time: number): void {
  const w = u * 0.7;
  const h = u * 0.95;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(-w * 1.08, -h);
  ctx.lineTo(-w * 0.5, -h * 0.5);
  ctx.lineTo(0, -h * 1.12);
  ctx.lineTo(w * 0.5, -h * 0.5);
  ctx.lineTo(w * 1.08, -h);
  ctx.lineTo(w, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, "#fff1a8");
  g.addColorStop(0.5, "#ffc93c");
  g.addColorStop(1, "#c98a00");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "#7a5200";
  ctx.stroke();
  // balls on the points
  ctx.fillStyle = "#fff1a8";
  for (const [x, y] of [
    [-w * 1.08, -h],
    [0, -h * 1.12],
    [w * 1.08, -h],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, u * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // gems along the band
  const gems = ["#e0364a", "#2f8cff", "#e0364a"];
  gems.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc((i - 1) * w * 0.6, -h * 0.25, u * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.stroke();
  });
  // a glint that runs across it now and then
  const t = (time * 0.5) % 2;
  if (t < 1) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(-w * 1.08, -h);
    ctx.lineTo(-w * 0.5, -h * 0.5);
    ctx.lineTo(0, -h * 1.12);
    ctx.lineTo(w * 0.5, -h * 0.5);
    ctx.lineTo(w * 1.08, -h);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    const x = -w * 1.6 + t * w * 3.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + u * 0.18, 0);
    ctx.lineTo(x + u * 0.45, -h * 1.2);
    ctx.lineTo(x + u * 0.27, -h * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Sunglasses over the eye (at L * 0.58, -B * 0.18 on the body; see Fish.drawFish), with the arm
 * running back toward the gill. */
function shades(ctx: CanvasRenderingContext2D, r: number): void {
  const ex = r * 0.696;
  const ey = r * -0.112;
  ctx.strokeStyle = "#111";
  ctx.lineWidth = Math.max(1, r * 0.045);
  ctx.beginPath();
  ctx.moveTo(ex - r * 0.16, ey - r * 0.05);
  ctx.lineTo(ex - r * 0.5, ey - r * 0.02);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ex - r * 0.2, ey - r * 0.1);
  ctx.lineTo(ex + r * 0.2, ey - r * 0.12);
  ctx.quadraticCurveTo(ex + r * 0.21, ey + r * 0.14, ex + r * 0.02, ey + r * 0.15);
  ctx.quadraticCurveTo(ex - r * 0.2, ey + r * 0.14, ex - r * 0.2, ey - r * 0.1);
  ctx.closePath();
  ctx.fillStyle = "#15151c";
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.moveTo(ex - r * 0.1, ey - r * 0.06);
  ctx.lineTo(ex - r * 0.02, ey - r * 0.07);
  ctx.lineTo(ex - r * 0.1, ey + r * 0.08);
  ctx.lineTo(ex - r * 0.16, ey + r * 0.07);
  ctx.closePath();
  ctx.fill();
}
