// How many stowed satellites fit in Starship's payload bay.
// Port of cad/packing.py from the space_datacenters repo: layers of identical rectangles,
// each layer packed into the circle available at its height (the bay tapers toward the nose).

function packCircle(width, depth, diameter, steps = 41) {
  const radius = diameter / 2;
  let best = [];
  for (const [turned, w, d] of [[false, width, depth], [true, depth, width]]) {
    const slack = diameter - Math.floor(diameter / d) * d;
    for (let step = 0; step < steps; step++) {
      let z = -radius + (slack * step) / (steps - 1);
      const layout = [];
      while (z + d <= radius + 1e-9) {
        const farthest = Math.max(Math.abs(z), Math.abs(z + d));
        const chord = 2 * Math.sqrt(Math.max(radius ** 2 - farthest ** 2, 0));
        const n = Math.floor((chord + 1e-9) / w);
        for (let i = 0; i < n; i++) layout.push([(i - (n - 1) / 2) * w, z + d / 2, turned]);
        z += d;
      }
      if (layout.length > best.length) best = layout;
    }
  }
  return best;
}

function bayRadius(profile, height) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [h0, r0] = profile[i];
    const [h1, r1] = profile[i + 1];
    if (h0 <= height && height <= h1) return r0 + ((r1 - r0) * (height - h0)) / (h1 - h0);
  }
  return 0;
}

export function satsPerFlight([sizeX, sizeY, sizeZ], profile) {
  const layout = [];
  let floor = 0;
  for (;;) {
    const radius = Math.min(bayRadius(profile, floor), bayRadius(profile, floor + sizeY));
    const layer = packCircle(sizeX, sizeZ, 2 * radius);
    if (!layer.length) break;
    layout.push([floor, layer]);
    floor += sizeY;
  }
  return { layers: layout.length, total: layout.reduce((n, [, l]) => n + l.length, 0), layout };
}
