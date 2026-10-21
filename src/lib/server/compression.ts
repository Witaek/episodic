import {
	constants,
	createBrotliCompress,
	createGzip,
	type Gzip,
	type BrotliCompress
} from 'node:zlib';

/**
 * Compresses dynamic responses (pages, page data, JSON). adapter-node only precompresses static
 * files, so a large library page went out uncompressed (hundreds of KB over Tailscale/mobile).
 * Every chunk is flushed, so SvelteKit's streamed data (e.g. a season loading in) still arrives
 * as soon as it's ready instead of waiting for the whole page.
 */

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest\+json))/;
/** Not worth compressing: the overhead outweighs the gain. */
const MIN_BYTES = 1024;

export function pickEncoding(acceptEncoding: string | null): 'br' | 'gzip' | null {
	const accepted = (acceptEncoding ?? '').toLowerCase();
	if (/\bbr\b/.test(accepted)) return 'br';
	if (/\bgzip\b/.test(accepted)) return 'gzip';
	return null;
}

export function shouldCompress(response: Response): boolean {
	if (!response.body || response.headers.has('content-encoding')) return false;
	if (response.status === 204 || response.status === 304 || response.status < 200) return false;
	const type = response.headers.get('content-type') ?? '';
	if (!COMPRESSIBLE.test(type)) return false;
	const length = Number(response.headers.get('content-length'));
	return !(Number.isFinite(length) && length > 0 && length < MIN_BYTES);
}

function compressStream(
	body: ReadableStream<Uint8Array>,
	encoding: 'br' | 'gzip'
): ReadableStream<Uint8Array> {
	// Moderate settings: good ratio at low CPU cost on a small home server.
	const zip: Gzip | BrotliCompress =
		encoding === 'br'
			? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
			: createGzip({ level: 6 });
	const flush = () =>
		encoding === 'br'
			? (zip as BrotliCompress).flush(constants.BROTLI_OPERATION_FLUSH)
			: (zip as Gzip).flush(constants.Z_SYNC_FLUSH);

	const reader = body.getReader();
	// Once the browser goes away (or the page fails), late compressor output must be dropped:
	// enqueueing on a closed stream throws inside a zlib event and would crash the server.
	let finished = false;
	const stop = () => {
		finished = true;
		zip.destroy();
	};

	return new ReadableStream<Uint8Array>({
		start(controller) {
			zip.on('data', (chunk: Buffer) => {
				if (!finished) controller.enqueue(new Uint8Array(chunk));
			});
			zip.on('end', () => {
				if (finished) return;
				finished = true;
				controller.close();
			});
			zip.on('error', (error) => {
				if (finished) return;
				finished = true;
				controller.error(error);
			});
			(async () => {
				for (;;) {
					const { done, value } = await reader.read();
					if (finished) return;
					if (done) {
						zip.end();
						return;
					}
					zip.write(value);
					flush();
				}
			})().catch((error) => {
				if (finished) return;
				stop();
				controller.error(error);
			});
		},
		cancel(reason) {
			stop();
			return reader.cancel(reason);
		}
	});
}

/** Returns a compressed copy of the response when it's worth it and the browser accepts it. */
export function compress(request: Request, response: Response): Response {
	const encoding = pickEncoding(request.headers.get('accept-encoding'));
	if (!encoding || !shouldCompress(response)) return response;
	const headers = new Headers(response.headers);
	headers.set('content-encoding', encoding);
	headers.delete('content-length');
	headers.append('vary', 'Accept-Encoding');
	return new Response(compressStream(response.body!, encoding), {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
