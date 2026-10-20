<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Button from './Button.svelte';

	interface Props {
		open: boolean;
		title: string;
		onconfirm: (date: Date) => void;
	}

	let { open = $bindable(), title, onconfirm }: Props = $props();

	const toLocalInput = (date: Date) => {
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	};

	let value = $state('');
	$effect(() => {
		if (open) value = toLocalInput(new Date());
	});
	const max = $derived(toLocalInput(new Date()));
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-2xl sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2"
		>
			<Dialog.Title class="text-lg font-semibold">When did you watch it?</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted">{title}</Dialog.Description>
			<form
				class="mt-5 space-y-5"
				onsubmit={(event) => {
					event.preventDefault();
					if (!value) return;
					onconfirm(new Date(value));
					open = false;
				}}
			>
				<input
					type="datetime-local"
					bind:value
					{max}
					required
					class="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-base outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/15"
				/>
				<div class="flex justify-end gap-2">
					<Dialog.Close>
						{#snippet child({ props })}
							<Button {...props} type="button" variant="ghost">Cancel</Button>
						{/snippet}
					</Dialog.Close>
					<Button type="submit">Save</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
