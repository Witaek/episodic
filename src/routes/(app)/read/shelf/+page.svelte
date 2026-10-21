<script lang="ts">
	import LibraryPage from '$lib/components/LibraryPage.svelte';

	let { data } = $props();
</script>

<LibraryPage {data} />
