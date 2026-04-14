<script lang="ts">
	import type { TaskStatus, DutyTask } from '$lib/kanban.svelte';
	import { kanbanStore } from '$lib/kanban.svelte';
	import KanbanCard from './KanbanCard.svelte';

	let { status, title, tasks }: { status: TaskStatus; title: string; tasks: DutyTask[] } = $props();
	let isOver = $state(false);

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		isOver = true;
	};

	const handleDragLeave = () => {
		isOver = false;
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		isOver = false;
		const taskId = e.dataTransfer?.getData('taskId');
		if (taskId) {
			kanbanStore.updateTaskStatus(taskId, status);
		}
	};
</script>

<div 
	class="flex flex-col flex-1 min-h-[500px] bg-base-200/50 rounded-2xl p-4 border-2 border-transparent transition-colors {isOver ? 'border-primary bg-primary/5' : ''}"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="list"
>
	<div class="flex items-center justify-between mb-4 px-2">
		<h3 class="font-black uppercase tracking-wider text-sm opacity-60">{title}</h3>
		<span class="badge badge-ghost badge-sm font-bold opacity-50">{tasks.length}</span>
	</div>

	<div class="flex-1">
		{#each tasks as task (task.id)}
			<KanbanCard {task} />
		{/each}
	</div>
</div>
