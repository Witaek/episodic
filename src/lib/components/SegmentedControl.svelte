<script lang="ts" generics="T extends string">
	interface Props {
		name: string;
		value: T;
		options: { value: T; label: string }[];
		onchange: (value: T) => void;
	}

	let { name, value, options, onchange }: Props = $props();
</script>

<div class="inline-flex rounded-xl bg-surface-2 p-1" role="radiogroup">
	{#each options as option (option.value)}
		<label
			class="cursor-pointer rounded-lg px-3.5 py-1.5 text-sm font-medium transition {option.value ===
			value
				? 'bg-surface text-fg shadow-sm'
				: 'text-muted hover:text-fg'}"
		>
			<input
				type="radio"
				{name}
				value={option.value}
				checked={option.value === value}
				onchange={() => onchange(option.value)}
				class="sr-only"
			/>
			{option.label}
		</label>
	{/each}
</div>
