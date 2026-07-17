<script lang="ts">
	import { kanbanStore } from '$lib/kanban.svelte';
	import KanbanCard from './KanbanCard.svelte';
	import { fade } from 'svelte/transition';

	const tasks = $derived([...kanbanStore.tasks].sort((a, b) => b.createdAt - a.createdAt));
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-8 flex items-center justify-between border-b border-base-300 pb-4">
		<h3 class="text-sm font-black tracking-widest uppercase opacity-40">Recent Log History</h3>
		<span class="badge badge-lg font-black">{tasks.length} Duties logged</span>
	</div>

	{#if tasks.length === 0}
		<div
			class="rounded-3xl border-2 border-dashed border-base-300 py-20 text-center opacity-30"
			in:fade
		>
			<p class="text-lg font-bold">No duties logged yet today.</p>
			<p class="text-xs">Use the form above to record your project activity.</p>
		</div>
	{:else}
		<div class="flex flex-col gap-4">
			{#each tasks as task (task.id)}
				<div in:fade={{ duration: 300 }}>
					<KanbanCard {task} />
				</div>
			{/each}
		</div>
	{/if}
</div>
