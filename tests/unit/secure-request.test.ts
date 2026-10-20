import { describe, expect, it } from 'vitest';
import { isSecureRequest } from '../../src/lib/server/auth';

const req = (headers: Record<string, string>) =>
	new Request('https://ignored.example/', { headers });

describe('isSecureRequest', () => {
	it('treats plain LAN access as insecure, whatever the adapter guessed', () => {
		// adapter-node reports https:// URLs when ORIGIN is unset; only headers decide.
		expect(isSecureRequest(req({ host: '192.168.1.20:8787' }), undefined)).toBe(false);
	});

	it('trusts proxy headers', () => {
		expect(isSecureRequest(req({ 'x-forwarded-proto': 'https' }), undefined)).toBe(true);
		expect(isSecureRequest(req({ 'x-forwarded-proto': 'http' }), 'https://box.ts.net')).toBe(false);
		expect(isSecureRequest(req({ forwarded: 'for=1.2.3.4;proto=https' }), undefined)).toBe(true);
	});

	it('uses APP_URL for its own host when the proxy sends no header', () => {
		const appUrl = 'https://casaos.tail1234.ts.net';
		expect(isSecureRequest(req({ host: 'casaos.tail1234.ts.net' }), appUrl)).toBe(true);
		expect(isSecureRequest(req({ host: '192.168.1.20:8787' }), appUrl)).toBe(false);
	});
});
