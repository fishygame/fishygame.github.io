// The shop is the Treasure Chest (Thomas, 2026-11-06): its preview is an open chest of gold coins,
// and on the way in the lid swings open and your fish rises out of it. Drawn in two passes around
// the fish, so the fish comes up from inside: the back (glow, the lid's underside, the coins) and
// then the front (the chest's front wall, and the closed lid while it's still shut).

const HALF = 72; // half the chest's width
const BODY = 54; // front wall height
const LID = 34; // lid height

/** `open` is 0 shut .. 1 wide open; `rimY` is the top edge of the front wall. */
export function drawChestBack(ctx: CanvasRenderingContext2D, cx: number, rimY: number, open: number, time: number): void {
  // golden glow spilling out
  if (open > 0.15) {
    const k = (open - 0.15) / 0.85;
    const glow = ctx.createRadialGradient(cx, rimY, 4, cx, rimY, 150 * k);
    glow.addColorStop(0, `rgba(255, 214, 102, ${0.6 * k})`);
    glow.addColorStop(1, "rgba(255, 214, 102, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 170, rimY - 170, 340, 340);
  }
  // the lid's underside, standing up behind the opening once it's past halfway
  const lid = 1 - 2 * open;
  if (lid < 0) {
    const h = LID * -lid;
    ctx.beginPath();
    ctx.moveTo(-HALF + cx, rimY);
    ctx.lineTo(-HALF + 6 + cx, rimY - h);
    ctx.quadraticCurveTo(cx, rimY - h - 10 * -lid, HALF - 6 + cx, rimY - h);
    ctx.lineTo(HALF + cx, rimY);
    ctx.closePath();
    ctx.fillStyle = "#4a2a12";
    ctx.fill();
    ctx.strokeStyle = "#2c180a";
    ctx.lineWidth = 2;
    ctx.stroke();
    // a gold band across it
    ctx.fillStyle = "#c99a2e";
    ctx.fillRect(cx - HALF + 8, rimY - h * 0.55, HALF * 2 - 16, Math.max(2, 5 * -lid));
  }
  // the dark inside, and a heap of gold coins catching the light
  ctx.fillStyle = "#24140a";
  ctx.fillRect(cx - HALF + 4, rimY - 4, HALF * 2 - 8, 10);
  if (open > 0.3) {
    const coins = [-50, -30, -12, 6, 24, 42, 56, -40, -20, 0, 18, 36];
    coins.forEach((dx, i) => {
      const y = rimY - (i < 7 ? 3 : 9) - Math.sin(i * 1.7) * 2;
      coin(ctx, cx + dx, y, i < 7 ? 9 : 8, time + i);
    });
  }
}

export function drawChestFront(ctx: CanvasRenderingContext2D, cx: number, rimY: number, open: number): void {
  const x0 = cx - HALF;
  // front wall: planks, with a dark edge
  const wood = ctx.createLinearGradient(0, rimY, 0, rimY + BODY);
  wood.addColorStop(0, "#9a5a26");
  wood.addColorStop(1, "#6b3c18");
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.roundRect(x0, rimY, HALF * 2, BODY, 5);
  ctx.fill();
  ctx.strokeStyle = "#3a200c";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(40, 20, 6, 0.45)";
  ctx.lineWidth = 1.5;
  for (const y of [rimY + 18, rimY + 36]) {
    ctx.beginPath();
    ctx.moveTo(x0 + 3, y);
    ctx.lineTo(x0 + HALF * 2 - 3, y);
    ctx.stroke();
  }
  // gold corner bands and the lock
  ctx.fillStyle = "#e0b040";
  ctx.strokeStyle = "#8a6414";
  ctx.lineWidth = 1.5;
  for (const x of [x0 + 10, x0 + HALF * 2 - 22]) {
    ctx.fillRect(x, rimY, 12, BODY);
    ctx.strokeRect(x, rimY, 12, BODY);
  }
  ctx.beginPath();
  ctx.roundRect(cx - 11, rimY + 6, 22, 24, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#3a200c";
  ctx.beginPath();
  ctx.arc(cx, rimY + 15, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 1.5, rimY + 15, 3, 8);

  // the lid, still shut (or on its way up, seen from the front shrinking toward the hinge)
  const lid = 1 - 2 * open;
  if (lid > 0) {
    const h = LID * lid;
    ctx.beginPath();
    ctx.moveTo(x0, rimY);
    ctx.lineTo(x0, rimY - h * 0.45);
    ctx.quadraticCurveTo(cx, rimY - h * 1.35, x0 + HALF * 2, rimY - h * 0.45);
    ctx.lineTo(x0 + HALF * 2, rimY);
    ctx.closePath();
    const top = ctx.createLinearGradient(0, rimY - h, 0, rimY);
    top.addColorStop(0, "#b06a2e");
    top.addColorStop(1, "#7a4419");
    ctx.fillStyle = top;
    ctx.fill();
    ctx.strokeStyle = "#3a200c";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#e0b040";
    for (const x of [x0 + 10, x0 + HALF * 2 - 22]) ctx.fillRect(x, rimY - h * 0.8, 12, h * 0.8);
  }
}

/** A gold coin with a glint that comes and goes. */
function coin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(x, y - r, x, y + r);
  g.addColorStop(0, "#fff1a8");
  g.addColorStop(0.5, "#ffc93c");
  g.addColorStop(1, "#b9770e");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "#8a6414";
  ctx.lineWidth = 1;
  ctx.stroke();
  const glint = Math.max(0, Math.sin(t * 2.3));
  if (glint > 0.85) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(glint - 0.85) * 6})`;
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.15, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}
