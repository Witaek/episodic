<script lang="ts">
	import SearchPage from '$lib/components/SearchPage.svelte';

	let { data } = $props();
</script>

<SearchPage {data} />
