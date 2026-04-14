<script lang="ts">
	import { kanbanStore } from '$lib/kanban.svelte';
	import KanbanColumn from './KanbanColumn.svelte';

	const todoTasks = $derived(kanbanStore.tasks.filter(t => t.status === 'todo'));
	const inProgressTasks = $derived(kanbanStore.tasks.filter(t => t.status === 'inprogress'));
	const doneTasks = $derived(kanbanStore.tasks.filter(t => t.status === 'done'));
</script>

<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
	<KanbanColumn status="todo" title="To Do" tasks={todoTasks} />
	<KanbanColumn status="inprogress" title="In Progress" tasks={inProgressTasks} />
	<KanbanColumn status="done" title="Done" tasks={doneTasks} />
</div>
