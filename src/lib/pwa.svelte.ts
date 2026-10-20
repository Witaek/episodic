/** Install-prompt state for the "Install app" section (Chrome/Edge/Android only). */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const pwa = $state<{ prompt: BeforeInstallPromptEvent | null; installed: boolean }>({
	prompt: null,
	installed: false
});

let listening = false;

/** Call once in the app layout; the browser fires the event early. */
export function listenForInstallPrompt() {
	if (listening || typeof window === 'undefined') return;
	listening = true;
	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		pwa.prompt = event as BeforeInstallPromptEvent;
	});
	window.addEventListener('appinstalled', () => {
		pwa.installed = true;
		pwa.prompt = null;
	});
}

export function isStandalone(): boolean {
	return (
		matchMedia('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

export function isIos(): boolean {
	return (
		/iPhone|iPad|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	);
}

/** Removes this user's cached pages from the device (on sign-out). */
export async function clearCachedPages() {
	navigator.serviceWorker?.controller?.postMessage('clear-user-data');
	if ('caches' in window) await caches.delete('pages-v1').catch(() => {});
}
