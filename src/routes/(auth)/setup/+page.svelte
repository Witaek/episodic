<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormField from '$lib/components/FormField.svelte';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Welcome · Episodic</title></svelte:head>

<div class="rounded-3xl border border-border bg-surface/80 p-6 shadow-xl backdrop-blur md:p-8">
	<h2 class="text-xl font-semibold">Create the admin account</h2>
	<p class="mt-1 mb-6 text-sm text-muted">
		This is the first start. The admin can add accounts for everyone else later.
	</p>

	<form
		method="POST"
		class="space-y-4"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
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
			error={form?.errors?.username}
		/>
		<FormField
			label="Display name"
			name="displayName"
			autocomplete="name"
			hint="Optional. Shown in the app."
			value={form?.displayName ?? ''}
		/>
		<FormField
			label="Password"
			name="password"
			type="password"
			autocomplete="new-password"
			required
			hint="At least 8 characters."
			error={form?.errors?.password}
		/>
		<FormField
			label="Confirm password"
			name="confirm"
			type="password"
			autocomplete="new-password"
			required
			error={form?.errors?.confirm}
		/>
		<Button type="submit" class="w-full" disabled={submitting}>
			{submitting ? 'Creating…' : 'Create account'}
		</Button>
	</form>
</div>
