// See https://svelte.dev/docs/kit/types#app.d.ts
import type { SessionUser } from '$lib/server/auth';

declare global {
	const __APP_VERSION__: string;

	namespace App {
		interface Locals {
			user: SessionUser | null;
			/** Raw session token, for "sign out other devices". */
			sessionToken: string | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
