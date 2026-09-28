import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const output = join(root, "assets");
const sharp = createRequire(import.meta.url)("sharp");
await mkdir(output, { recursive: true });

function iconSvg(size) {
  const inset = Math.round(size * 0.08);
  const center = size / 2;
  const radius = size * 0.29;
  const stroke = size * 0.055;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="#17324d"/>
    <rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}" rx="${size * 0.13}" fill="#244f73"/>
    <circle cx="${center}" cy="${center}" r="${radius}" fill="#ffffff"/>
    <circle cx="${center}" cy="${center}" r="${radius - stroke * 0.7}" fill="#f5f7f9" stroke="#007f77" stroke-width="${stroke}"/>
    <path d="M ${center} ${center - radius * 0.58} V ${center + radius * 0.04} L ${center + radius * 0.46} ${center + radius * 0.3}" fill="none" stroke="#17324d" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${center}" cy="${center}" r="${stroke * 0.58}" fill="#007f77"/>
    <path d="M ${center - radius * 0.56} ${center + radius * 0.5} L ${center - radius * 0.27} ${center + radius * 0.72} L ${center + radius * 0.56} ${center - radius * 0.18}" fill="none" stroke="#1f7a4d" stroke-width="${stroke * 0.82}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

for (const size of [180, 192, 512]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  await sharp(Buffer.from(iconSvg(size))).png().toFile(join(output, name));
}
