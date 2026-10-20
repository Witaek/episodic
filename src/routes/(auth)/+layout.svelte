<script lang="ts">
	let { children } = $props();
</script>

<main
	class="grid min-h-dvh place-items-center px-4 py-12"
	style="background: radial-gradient(60rem 40rem at 20% -10%, color-mix(in oklab, var(--accent) 24%, transparent), transparent 60%), radial-gradient(50rem 30rem at 110% 110%, color-mix(in oklab, var(--success) 12%, transparent), transparent 60%), var(--bg);"
>
	<div class="w-full max-w-sm">
		<div class="mb-8 flex flex-col items-center text-center">
			<img src="/favicon.svg" alt="" class="mb-4 size-14 rounded-2xl shadow-lg" />
			<h1 class="text-2xl font-semibold tracking-tight">Episodic</h1>
		</div>
		{@render children()}
	</div>
</main>
