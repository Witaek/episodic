import { describe, expect, it } from 'vitest';
import { isRequestOriginAllowed } from '../../src/lib/server/security';

const post = (headers: Record<string, string>) =>
	new Request('http://192.168.1.20:8787/api/x', { method: 'POST', headers });

describe('isRequestOriginAllowed', () => {
	it('allows safe methods from anywhere', () => {
		const req = new Request('http://localhost/', { headers: { origin: 'https://evil.example' } });
		expect(isRequestOriginAllowed(req, [])).toBe(true);
	});

	it('allows requests without an Origin header (non-browser clients)', () => {
		expect(isRequestOriginAllowed(post({}), [])).toBe(true);
	});

	it('allows same-host requests', () => {
		const req = post({ origin: 'http://192.168.1.20:8787', host: '192.168.1.20:8787' });
		expect(isRequestOriginAllowed(req, [])).toBe(true);
	});

	it('allows origins listed in the allow list', () => {
		const req = post({ origin: 'https://box.tail1234.ts.net', host: 'localhost:3000' });
		expect(isRequestOriginAllowed(req, ['https://box.tail1234.ts.net/'])).toBe(true);
	});

	it('blocks other cross-site requests', () => {
		const req = post({ origin: 'https://evil.example', host: '192.168.1.20:8787' });
		expect(isRequestOriginAllowed(req, ['https://box.tail1234.ts.net'])).toBe(false);
	});

	it('blocks malformed origins', () => {
		expect(isRequestOriginAllowed(post({ origin: 'null', host: 'a' }), [])).toBe(false);
	});
});
