<script lang="ts">
	import { kanbanStore } from '$lib/kanban.svelte';
	import KanbanCard from './KanbanCard.svelte';
	import { fade } from 'svelte/transition';

	const tasks = $derived([...kanbanStore.tasks].sort((a, b) => b.createdAt - a.createdAt));
</script>

<div class="max-w-4xl mx-auto">
	<div class="flex items-center justify-between mb-8 border-b border-base-300 pb-4">
		<h3 class="font-black uppercase tracking-widest text-sm opacity-40">Recent Log History</h3>
		<span class="badge badge-lg font-black">{tasks.length} Duties logged</span>
	</div>

	{#if tasks.length === 0}
		<div class="text-center py-20 opacity-30 border-2 border-dashed border-base-300 rounded-3xl" in:fade>
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
