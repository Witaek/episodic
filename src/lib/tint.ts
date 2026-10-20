/**
 * Picks a representative color from a poster for tinting the title page. Runs in the browser,
 * on a tiny version of the image. Returns null when the image can't be read.
 */
const cache = new Map<string, Promise<string | null>>();

function smallVersion(url: string): string {
	// TMDB serves sizes in the path; 92 px wide is plenty for a color.
	return url.replace(/\/t\/p\/w\d+\//, '/t/p/w92/').replace('/cover/large/', '/cover/medium/');
}

export function posterTint(url: string): Promise<string | null> {
	const key = smallVersion(url);
	let pending = cache.get(key);
	if (!pending) {
		pending = new Promise((resolve) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.decoding = 'async';
			img.onload = () => {
				try {
					const canvas = document.createElement('canvas');
					canvas.width = 24;
					canvas.height = 36;
					const ctx = canvas.getContext('2d', { willReadFrequently: true });
					if (!ctx) return resolve(null);
					ctx.drawImage(img, 0, 0, 24, 36);
					const { data } = ctx.getImageData(0, 0, 24, 36);
					// Weight colorful, mid-bright pixels; skip near-black and near-white.
					let r = 0,
						g = 0,
						b = 0,
						total = 0;
					for (let i = 0; i < data.length; i += 4) {
						const [pr, pg, pb] = [data[i], data[i + 1], data[i + 2]];
						const max = Math.max(pr, pg, pb);
						const min = Math.min(pr, pg, pb);
						if (max < 30 || min > 235) continue;
						const weight = 1 + ((max - min) / 255) * 4;
						r += pr * weight;
						g += pg * weight;
						b += pb * weight;
						total += weight;
					}
					resolve(
						total
							? `rgb(${Math.round(r / total)} ${Math.round(g / total)} ${Math.round(b / total)})`
							: null
					);
				} catch {
					resolve(null);
				}
			};
			img.onerror = () => resolve(null);
			img.src = key;
		});
		cache.set(key, pending);
	}
	return pending;
}
