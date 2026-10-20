const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Cross-site request check. SvelteKit's built-in check only knows a single origin at build time,
 * but Episodic is usually reached from several (LAN IP, Tailscale name, reverse proxy).
 * A request is allowed when it is not state-changing, carries no Origin header (non-browser
 * clients), comes from the host it was sent to, or comes from an explicitly allowed origin.
 */
export function isRequestOriginAllowed(
	request: Request,
	allowedOrigins: readonly string[]
): boolean {
	if (!UNSAFE_METHODS.has(request.method)) return true;

	const origin = request.headers.get('origin');
	if (!origin) return true;

	let originUrl: URL;
	try {
		originUrl = new URL(origin);
	} catch {
		return false;
	}

	const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
	if (host && originUrl.host === host) return true;

	return allowedOrigins.some((allowed) => normalizeOrigin(allowed) === originUrl.origin);
}

function normalizeOrigin(value: string): string | undefined {
	try {
		return new URL(value).origin;
	} catch {
		return undefined;
	}
}
