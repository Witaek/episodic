const TMDB = 'https://image.tmdb.org/t/p/';

/**
 * Images stored by 1.5.x lack TMDB's full-size candidate (backdrops stopped at 1280px, episode
 * stills at 300px), which looked soft on large cards and heroes. Adds it back until the title is
 * refreshed.
 */
export function withTmdbOriginal(srcset: string | undefined): string | undefined {
	if (!srcset?.startsWith(TMDB) || srcset.includes('/original/')) return srcset;
	const candidates = srcset.split(',').map((c) => c.trim());
	const widest = candidates.at(-1)!;
	const [url, descriptor] = widest.split(/\s+/);
	const width = Number(descriptor?.replace('w', ''));
	// w1280 is a backdrop's largest size, w300 a still's.
	const original = width === 1280 ? 1920 : width === 300 ? 1280 : null;
	if (!original) return srcset;
	const full = url.replace(/\/t\/p\/[^/]+\//, '/t/p/original/');
	return [...candidates, `${full} ${original}w`].join(', ');
}
