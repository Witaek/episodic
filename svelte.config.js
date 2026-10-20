import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ precompress: true }),
		// The app can be reached from several URLs (LAN IP, Tailscale name, …) that are only
		// known at runtime, so the origin check lives in src/hooks.server.ts instead.
		csrf: { trustedOrigins: ['*'] }
	}
};

export default config;
