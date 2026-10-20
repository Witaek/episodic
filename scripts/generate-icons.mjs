// Regenerates the PNG app icons from the SVG sources: `node scripts/generate-icons.mjs`
import sharp from 'sharp';

const out = new URL('../static/icons/', import.meta.url);
const icon = new URL('../static/icon.svg', import.meta.url).pathname;
const maskable = new URL('../static/icons/maskable.svg', import.meta.url).pathname;

const jobs = [
	{ src: icon, size: 192, file: 'icon-192.png' },
	{ src: icon, size: 512, file: 'icon-512.png' },
	{ src: icon, size: 32, file: 'favicon-32.png' },
	{ src: maskable, size: 512, file: 'maskable-512.png' },
	// iOS ignores transparency and adds its own rounded corners, so use the full-bleed artwork.
	{ src: maskable, size: 180, file: 'apple-touch-icon.png' }
];

for (const { src, size, file } of jobs) {
	await sharp(src, { density: 384 }).resize(size, size).png().toFile(new URL(file, out).pathname);
	console.log(`static/icons/${file}`);
}
