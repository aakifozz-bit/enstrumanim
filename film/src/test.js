shot(9000, 9001, (ctx) => {
  ctx.fillStyle = '#d8d0c0'; ctx.fillRect(0, 0, W, H);
  foxSide(ctx, poseStand({ eye: 1 }), { x: 140, y: 500, s: 3.4, pal: 'base' });
  foxSide(ctx, poseWalk(0.25, { lanternMouth: true }), { x: 520, y: 500, s: 3.4, pal: 'lantern' });
  foxSide(ctx, poseSit({ head: [34, -72], hr: -0.35 }), { x: 950, y: 500, s: 3.4, pal: 'gold', rimv: [1, -0.5] });
});
shot(9001, 9002, (ctx) => {
  ctx.fillStyle = '#d8d0c0'; ctx.fillRect(0, 0, W, H);
  foxFace(ctx, { tilt: 0.06 }, { x: 230, y: 300, s: 2.2, pal: 'base' });
  foxFace(ctx, { tilt: -0.12, yaw: 0.25, pitch: 0.2, lookY: -0.8, earL: 0.8, catch: '#ffd080' }, { x: 640, y: 300, s: 2.2, pal: 'lantern', catch: '#ffe0a0' });
  foxFace(ctx, { earFlat: 1, eyeL: 0, eyeR: 0, tilt: 0.1 }, { x: 1050, y: 300, s: 2.2, pal: 'moon' });
});
