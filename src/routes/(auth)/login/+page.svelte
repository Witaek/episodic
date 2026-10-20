<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormField from '$lib/components/FormField.svelte';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Sign in · Episodic</title></svelte:head>

<div class="rounded-3xl border border-border bg-surface/80 p-6 shadow-xl backdrop-blur md:p-8">
	<h2 class="mb-6 text-xl font-semibold">Sign in</h2>

	<form
		method="POST"
		class="space-y-4"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update({ reset: false });
				submitting = false;
			};
		}}
	>
		<FormField
			label="Username"
			name="username"
			autocomplete="username"
			autocapitalize="none"
			required
			value={form?.username ?? ''}
		/>
		<FormField
			label="Password"
			name="password"
			type="password"
			autocomplete="current-password"
			required
		/>
		{#if form?.error}
			<p class="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger" role="alert">
				{form.error}
			</p>
		{/if}
		<Button type="submit" class="w-full" disabled={submitting}>
			{submitting ? 'Signing in…' : 'Sign in'}
		</Button>
	</form>
	<p class="mt-5 text-center text-xs text-muted">
		Forgot your password? Ask the person who runs this server to reset it.
	</p>
</div>
