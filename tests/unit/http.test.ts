import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient, ProviderError, RateLimiter } from '../../src/lib/server/providers/http';

afterEach(() => vi.unstubAllGlobals());

describe('RateLimiter', () => {
	it('limits concurrency', async () => {
		const limiter = new RateLimiter({ burst: 100, perSecond: 100, concurrency: 2 });
		let active = 0;
		let peak = 0;
		await Promise.all(
			Array.from({ length: 6 }, () =>
				limiter.run(async () => {
					active++;
					peak = Math.max(peak, active);
					await new Promise((r) => setTimeout(r, 5));
					active--;
				})
			)
		);
		expect(peak).toBe(2);
	});
});

describe('createHttpClient', () => {
	it('retries on 5xx and then succeeds', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response('boom', { status: 503, headers: { 'retry-after': '0.01' } })
			)
			.mockResolvedValueOnce(Response.json({ ok: true }));
		vi.stubGlobal('fetch', fetchMock);
		const request = createHttpClient('test', { burst: 10, perSecond: 10, concurrency: 1 });
		await expect(request('https://example.test')).resolves.toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not retry 404 and reports the status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
		const request = createHttpClient('test', { burst: 10, perSecond: 10, concurrency: 1 });
		const error = await request('https://example.test').catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ProviderError);
		expect((error as ProviderError).status).toBe(404);
	});
});
