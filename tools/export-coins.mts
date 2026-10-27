import { writeFileSync } from "node:fs";
import { AVATAR_PRESETS, presetSrc } from "./avatar-presets.ts";
const out = process.argv[2];
const meta = [];
for (const p of AVATAR_PRESETS) {
  const uri = presetSrc(`preset:${p.id}`)!;
  const svg = decodeURIComponent(uri.split(",")[1]);
  writeFileSync(`${out}/${p.id}.svg`, svg);
  // Face only, for the 3D coin top: no background square, clipped to the disc.
  const face = svg
    .replace(/<rect width="100" height="100" fill="[^"]+"\/>/, "")
    .replace('viewBox="0 0 100 100">', 'viewBox="13 17 74 74"><defs><clipPath id="c"><circle cx="50" cy="54" r="35"/></clipPath></defs><g clip-path="url(#c)">')
    .replace("</svg>", "</g></svg>");
  writeFileSync(`${out}/${p.id}-face.svg`, face);
  meta.push({ id: p.id, label: p.label, bg: p.bg, ...p.metal });
}
writeFileSync(`${out}/coins.json`, JSON.stringify(meta, null, 1));
console.log(meta.length, "coins");
