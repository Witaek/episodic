<script lang="ts">
	import { onMount } from 'svelte';
	import { BookPlus, Camera, CameraOff, Library, LoaderCircle, ScanBarcode } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import Img from '$lib/components/Img.svelte';
	import { isIsbn, type IsbnLookup } from '$lib/scan';
	import { haptic, setLibraryStatus } from '$lib/tracking/client';

	type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
	type CameraState = 'idle' | 'starting' | 'scanning' | 'insecure' | 'denied' | 'unavailable';

	let video = $state<HTMLVideoElement>();
	let camera = $state<CameraState>('idle');
	let stream: MediaStream | null = null;
	let detector: Detector | null = null;
	let frame = 0;

	let looking = $state(false);
	let found = $state<IsbnLookup | null>(null);
	let notFound = $state<string | null>(null);
	let manual = $state('');
	let added = $state<Set<string>>(new Set());
	let scanned = $state<IsbnLookup[]>([]);

	/** Native BarcodeDetector where it reads EAN-13 (Android Chrome); otherwise a WebAssembly one. */
	async function createDetector(): Promise<Detector> {
		const Native = (window as unknown as { BarcodeDetector?: any }).BarcodeDetector;
		if (Native) {
			const formats: string[] = await Native.getSupportedFormats().catch(() => []);
			if (formats.includes('ean_13')) return new Native({ formats: ['ean_13'] });
		}
		const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([
			import('barcode-detector/ponyfill'),
			import('zxing-wasm/reader/zxing_reader.wasm?url')
		]);
		// Served by Episodic itself instead of a CDN.
		prepareZXingModule({
			overrides: {
				locateFile: (path: string, prefix: string) =>
					path.endsWith('.wasm') ? wasm.default : prefix + path
			}
		});
		return new BarcodeDetector({ formats: ['ean_13'] });
	}

	async function start() {
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			camera = 'insecure';
			return;
		}
		camera = 'starting';
		found = null;
		notFound = null;
		try {
			detector ??= await createDetector();
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
				audio: false
			});
			video!.srcObject = stream;
			await video!.play();
			camera = 'scanning';
			scan();
		} catch (cause) {
			stop();
			camera =
				cause instanceof DOMException && cause.name === 'NotAllowedError'
					? 'denied'
					: 'unavailable';
		}
	}

	function stop() {
		cancelAnimationFrame(frame);
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		if (camera === 'scanning' || camera === 'starting') camera = 'idle';
	}

	let last = 0;
	function scan() {
		frame = requestAnimationFrame(async (time) => {
			if (camera !== 'scanning' || !video || !detector) return;
			// About five reads a second is plenty and spares the battery.
			if (time - last > 200 && video.readyState >= 2) {
				last = time;
				const codes = await detector.detect(video).catch(() => []);
				const isbn = codes.map((c) => c.rawValue).find(isIsbn);
				if (isbn) {
					haptic([20, 40, 20]);
					stop();
					void lookup(isbn);
					return;
				}
			}
			scan();
		});
	}

	async function lookup(isbn: string) {
		looking = true;
		found = null;
		notFound = null;
		try {
			const response = await fetch(`/api/books/isbn/${encodeURIComponent(isbn)}`);
			if (response.status === 404 || response.status === 400) {
				notFound = isbn;
				return;
			}
			if (!response.ok) throw new Error(String(response.status));
			found = (await response.json()) as IsbnLookup;
			scanned = [found, ...scanned.filter((b) => b.isbn !== found!.isbn)].slice(0, 10);
		} catch {
			toast.error("Couldn't look up this ISBN. Try again in a moment.");
		} finally {
			looking = false;
		}
	}

	async function wantToRead(book: IsbnLookup) {
		// A book of a series goes on the shelf as the series, like a show.
		const ref = book.series
			? { kind: 'series' as const, id: book.series.href.split('/').pop()! }
			: { kind: 'book' as const, id: book.work };
		try {
			await setLibraryStatus(ref, 'planned');
			added = new Set([...added, book.isbn]);
			toast.success(`${book.series?.name ?? book.name} added to Want to read`);
		} catch {
			// The client already showed an error toast.
		}
	}

	function submitManual(event: SubmitEvent) {
		event.preventDefault();
		const value = manual.replace(/[\s-]/g, '');
		if (!isIsbn(value)) {
			toast.error('That doesn’t look like an ISBN (10 or 13 digits).');
			return;
		}
		stop();
		void lookup(value);
	}

	onMount(() => {
		// Start right away when the camera was already allowed.
		navigator.permissions
			?.query({ name: 'camera' as PermissionName })
			.then((p) => {
				if (p.state === 'granted') void start();
			})
			.catch(() => {});
		// Turn the camera off when leaving the page.
		return stop;
	});
</script>

<svelte:head><title>Scan a book · Episodic</title></svelte:head>

<div
	class="mx-auto max-w-xl space-y-6 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-10 md:px-8 md:pt-8"
>
	<div>
		<h1 class="font-serif text-3xl font-semibold tracking-tight">Scan a book</h1>
		<p class="mt-1 text-sm text-muted">
			Point the camera at the barcode on the back cover. Episodic finds the exact edition and the
			series it belongs to.
		</p>
	</div>

	<div class="relative aspect-[4/3] overflow-hidden rounded-3xl bg-black shadow-lg">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={video}
			playsinline
			muted
			class="absolute inset-0 size-full object-cover {camera === 'scanning' ? '' : 'opacity-0'}"
		></video>
		{#if camera === 'scanning'}
			<div class="pointer-events-none absolute inset-0 grid place-items-center">
				<div
					class="relative h-1/3 w-3/4 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
				>
					<div class="scan-line absolute inset-x-2 h-0.5 rounded-full bg-accent"></div>
				</div>
			</div>
			<button
				type="button"
				onclick={stop}
				class="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium text-white backdrop-blur"
			>
				<CameraOff class="size-4" /> Stop
			</button>
		{:else}
			<div class="absolute inset-0 grid place-items-center p-6 text-center text-white">
				{#if camera === 'starting' || looking}
					<LoaderCircle class="size-8 animate-spin text-white/80" />
				{:else if camera === 'insecure'}
					<p class="max-w-xs text-sm text-white/80">
						The camera only works over HTTPS (for example your Tailscale address). You can still
						type the ISBN below.
					</p>
				{:else if camera === 'denied'}
					<p class="max-w-xs text-sm text-white/80">
						Camera access was refused. Allow it in your browser's site settings, or type the ISBN
						below.
					</p>
				{:else}
					<div class="space-y-3">
						{#if camera === 'unavailable'}
							<p class="max-w-xs text-sm text-white/80">The camera couldn't be started.</p>
						{/if}
						<button
							type="button"
							onclick={start}
							class="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110"
						>
							<Camera class="size-4" />
							{found || notFound ? 'Scan another' : 'Start the camera'}
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if found}
		<section class="rounded-2xl border border-accent/40 bg-accent/5 p-4" aria-live="polite">
			<div class="flex gap-4">
				<Img
					image={found.poster}
					alt=""
					sizes="96px"
					class="aspect-[2/3] w-20 shrink-0 rounded-lg shadow"
				/>
				<div class="min-w-0 flex-1">
					{#if found.series}
						<p class="text-xs font-semibold tracking-wide text-accent uppercase">
							{found.series.position ? `Book ${found.series.position} · ` : ''}{found.series.name}
						</p>
					{/if}
					<p class="font-serif text-lg leading-snug font-semibold">{found.name}</p>
					<p class="text-sm text-muted">
						{[found.year, `ISBN ${found.isbn}`].filter(Boolean).join(' · ')}
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						<a
							href={found.href}
							class="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:brightness-110"
						>
							Open
						</a>
						{#if found.series}
							<a
								href={found.series.href}
								class="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-border"
							>
								<Library class="size-4" /> The series
							</a>
						{/if}
						<button
							type="button"
							disabled={added.has(found.isbn)}
							onclick={() => found && wantToRead(found)}
							class="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-border disabled:opacity-50"
						>
							<BookPlus class="size-4" />
							{added.has(found.isbn) ? 'Added' : 'Want to read'}
						</button>
					</div>
				</div>
			</div>
		</section>
	{:else if notFound}
		<p class="rounded-2xl bg-surface-2 p-4 text-sm" aria-live="polite">
			Open Library doesn't know ISBN {notFound}. Try
			<a href="/read/search" class="font-semibold text-accent hover:underline">searching by title</a
			>.
		</p>
	{/if}

	<form onsubmit={submitManual} class="flex gap-2">
		<label class="sr-only" for="isbn">ISBN</label>
		<input
			id="isbn"
			bind:value={manual}
			inputmode="numeric"
			autocomplete="off"
			placeholder="Or type an ISBN, e.g. 978-2-07-054127-0"
			class="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent/60"
		/>
		<button
			class="inline-flex items-center gap-2 rounded-2xl bg-surface-2 px-4 text-sm font-semibold hover:bg-border"
		>
			<ScanBarcode class="size-4" /> Find
		</button>
	</form>

	{#if scanned.length > 1}
		<section>
			<h2 class="mb-2 text-sm font-semibold text-muted">Scanned this session</h2>
			<ul class="divide-y divide-border/60">
				{#each scanned.slice(1) as book (book.isbn)}
					<li>
						<a href={book.href} class="flex items-center gap-3 py-2 hover:text-accent">
							<Img image={book.poster} alt="" sizes="40px" class="aspect-[2/3] w-8 rounded" />
							<span class="line-clamp-1 text-sm font-medium">{book.name}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.scan-line {
		animation: sweep 1.8s ease-in-out infinite alternate;
	}
	@keyframes sweep {
		from {
			top: 10%;
		}
		to {
			top: 88%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.scan-line {
			animation: none;
			top: 50%;
		}
	}
</style>
