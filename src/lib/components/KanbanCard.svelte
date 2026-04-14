<script lang="ts">
	import type { DutyTask } from '$lib/kanban.svelte';
	import { kanbanStore } from '$lib/kanban.svelte';

	let { task }: { task: DutyTask } = $props();

	const handleDragStart = (e: DragEvent) => {
		if (e.dataTransfer) {
			e.dataTransfer.setData('taskId', task.id);
			e.dataTransfer.effectAllowed = 'move';
		}
	};

	const removeTask = () => {
		if (confirm('Are you sure you want to delete this duty?')) {
			kanbanStore.removeTask(task.id);
		}
	};
</script>

<div 
	draggable="true" 
	ondragstart={handleDragStart}
	role="listitem"
	class="card bg-base-100 border border-base-300 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group p-4 mb-3"
>
	<div class="flex justify-between items-start mb-2">
		<h4 class="font-bold text-lg leading-tight">{task.title}</h4>
		<button 
			class="btn btn-ghost btn-xs text-error opacity-0 group-hover:opacity-100 transition-opacity" 
			onclick={removeTask}
			title="Remove task"
		>
			✕
		</button>
	</div>

	{#if task.files.length > 0}
		<div class="mb-2">
			<span class="text-[10px] uppercase font-bold opacity-50 block mb-1">Files</span>
			<div class="flex flex-wrap gap-1">
				{#each task.files as file}
					<span class="badge badge-sm badge-outline font-mono text-[10px]">{file}</span>
				{/each}
			</div>
		</div>
	{/if}

	{#if task.functions.length > 0}
		<div>
			<span class="text-[10px] uppercase font-bold opacity-50 block mb-1">Functions</span>
			<div class="flex flex-wrap gap-1">
				{#each task.functions as func}
					<span class="badge badge-sm badge-secondary badge-outline font-mono text-[10px]">{func}()</span>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Make the badge content smaller to fit better */
	.badge {
		height: 1.25rem;
		padding-left: 0.5rem;
		padding-right: 0.5rem;
	}
</style>
