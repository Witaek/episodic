/**
 * Outgoing HTTP for metadata providers: per-provider rate limiting (token bucket),
 * concurrency limits, timeouts, and retries with backoff on 429/5xx.
 */

export class ProviderError extends Error {
	constructor(
		message: string,
		readonly provider: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'ProviderError';
	}
}

export interface RateLimit {
	/** Requests allowed in a burst. */
	burst: number;
	/** Sustained requests per second. */
	perSecond: number;
	/** Requests in flight at once. */
	concurrency: number;
}

export class RateLimiter {
	private tokens: number;
	private lastRefill = Date.now();
	private active = 0;
	private waiting: (() => void)[] = [];
	private pausedUntil = 0;

	constructor(private readonly limit: RateLimit) {
		this.tokens = limit.burst;
	}

	async run<T>(task: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await task();
		} finally {
			this.active--;
			this.waiting.shift()?.();
		}
	}

	/** Stop issuing requests for a while, e.g. after a 429 with Retry-After. */
	pause(ms: number): void {
		this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
	}

	private async acquire(): Promise<void> {
		while (this.active >= this.limit.concurrency) {
			await new Promise<void>((resolve) => this.waiting.push(resolve));
		}
		this.active++;
		for (;;) {
			const now = Date.now();
			if (now < this.pausedUntil) {
				await sleep(this.pausedUntil - now);
				continue;
			}
			this.tokens = Math.min(
				this.limit.burst,
				this.tokens + ((now - this.lastRefill) / 1000) * this.limit.perSecond
			);
			this.lastRefill = now;
			if (this.tokens >= 1) {
				this.tokens -= 1;
				return;
			}
			await sleep(((1 - this.tokens) / this.limit.perSecond) * 1000);
		}
	}
}

export interface RequestOptions extends RequestInit {
	timeoutMs?: number;
	retries?: number;
	/** 'text' returns the body as a string (XML APIs). */
	as?: 'json' | 'text';
}

export function createHttpClient(provider: string, limit: RateLimit) {
	const limiter = new RateLimiter(limit);

	return async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
		const { timeoutMs = 10_000, retries = 2, as = 'json', ...init } = options;

		for (let attempt = 0; ; attempt++) {
			const response = await limiter
				.run(() => fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }))
				.catch((error: unknown) => {
					if (attempt < retries) return null;
					throw new ProviderError(`${provider} request failed: ${String(error)}`, provider);
				});

			if (response?.ok) return (as === 'text' ? await response.text() : await response.json()) as T;

			const status = response?.status;
			const retryable = !response || status === 429 || (status !== undefined && status >= 500);
			if (!retryable || attempt >= retries) {
				const body = response ? await response.text().catch(() => '') : '';
				throw new ProviderError(
					`${provider} responded ${status}: ${body.slice(0, 200)}`,
					provider,
					status
				);
			}

			const retryAfter = Number(response?.headers.get('retry-after'));
			const delay =
				Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
			if (status === 429) limiter.pause(delay);
			await sleep(delay);
		}
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
