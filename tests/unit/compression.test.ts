import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compress, pickEncoding } from '../../src/lib/server/compression';

const html = '<!doctype html>' + '<p>Episodic</p>'.repeat(500);
const req = (accept: string) =>
	new Request('http://x/', { headers: { 'accept-encoding': accept } });
const page = () => new Response(html, { headers: { 'content-type': 'text/html' } });

describe('compression', () => {
	it('prefers brotli, then gzip', () => {
		expect(pickEncoding('gzip, deflate, br')).toBe('br');
		expect(pickEncoding('gzip')).toBe('gzip');
		expect(pickEncoding('identity')).toBeNull();
	});

	it('compresses pages and decompresses back to the same content', async () => {
		const br = compress(req('br'), page());
		expect(br.headers.get('content-encoding')).toBe('br');
		const brBytes = Buffer.from(await br.arrayBuffer());
		expect(brBytes.length).toBeLessThan(html.length / 10);
		expect(brotliDecompressSync(brBytes).toString()).toBe(html);

		const gz = compress(req('gzip'), page());
		expect(gunzipSync(Buffer.from(await gz.arrayBuffer())).toString()).toBe(html);
		expect(gz.headers.get('vary')).toContain('Accept-Encoding');
	});

	it('leaves images, tiny bodies and already-encoded responses alone', () => {
		const png = new Response('x'.repeat(5000), { headers: { 'content-type': 'image/png' } });
		expect(compress(req('br'), png).headers.get('content-encoding')).toBeNull();
		const tiny = new Response('{}', {
			headers: { 'content-type': 'application/json', 'content-length': '2' }
		});
		expect(compress(req('br'), tiny).headers.get('content-encoding')).toBeNull();
		const done = new Response(html, {
			headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }
		});
		expect(compress(req('br'), done)).toBe(done);
	});

	it('sends streamed chunks as they come, not only at the end', async () => {
		let push!: (chunk: string) => void;
		let end!: () => void;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				push = (chunk) => controller.enqueue(new TextEncoder().encode(chunk));
				end = () => controller.close();
			}
		});
		const response = compress(
			req('gzip'),
			new Response(body, { headers: { 'content-type': 'text/html' } })
		);
		const reader = response.body!.getReader();
		push('<p>first part</p>'.repeat(200));
		// The first part must be readable before the stream ends.
		const first = await Promise.race([
			reader.read(),
			new Promise((r) => setTimeout(() => r('timeout'), 1000))
		]);
		expect(first).not.toBe('timeout');
		end();
	});

	it('survives the browser going away mid-stream', async () => {
		let push!: (chunk: string) => void;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				push = (chunk) => {
					// The page stream may already be cancelled too; that's fine.
					try {
						controller.enqueue(new TextEncoder().encode(chunk));
					} catch {
						/* cancelled */
					}
				};
			}
		});
		const response = compress(
			req('br'),
			new Response(body, { headers: { 'content-type': 'text/html' } })
		);
		const reader = response.body!.getReader();
		push('<p>part</p>'.repeat(200));
		await reader.read();
		await reader.cancel();
		// Compressor output after the cancel used to throw "Controller is already closed" from a
		// zlib event, which crashed the server (Vitest fails the run on such uncaught errors).
		push('<p>late</p>'.repeat(200));
		await new Promise((r) => setTimeout(r, 50));
	});

	it('reports a failing page as a stream error instead of crashing', async () => {
		let fail!: (error: Error) => void;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('<p>start</p>'.repeat(200)));
				fail = (error) => controller.error(error);
			}
		});
		const response = compress(
			req('gzip'),
			new Response(body, { headers: { 'content-type': 'text/html' } })
		);
		const reader = response.body!.getReader();
		await reader.read();
		fail(new Error('boom'));
		await expect(
			(async () => {
				for (;;) if ((await reader.read()).done) return;
			})()
		).rejects.toThrow('boom');
	});
});
