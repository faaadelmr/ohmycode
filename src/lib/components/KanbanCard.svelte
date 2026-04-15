<script lang="ts">
	import type { DutyTask } from '$lib/kanban.svelte';
	import { kanbanStore } from '$lib/kanban.svelte';

	let { task }: { task: DutyTask } = $props();

	const removeTask = () => {
		if (confirm('Are you sure you want to delete this duty?')) {
			kanbanStore.removeTask(task.id);
		}
	};

	const formattedDate = $derived(new Date(task.createdAt).toLocaleString('en-GB', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}));
</script>

<div 
	class="card bg-base-100 border border-base-300 shadow-sm hover:shadow-lg transition-all group p-6 mb-5 rounded-[2rem] overflow-hidden relative"
>
	<!-- Accent Decoration -->
	<div class="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary/10 transition-colors"></div>

	<div class="flex justify-between items-start mb-4 relative z-10">
		<div class="flex-1">
			{#if task.description}
				<h4 class="font-black text-2xl leading-tight text-primary mb-2 tracking-tight">{task.description}</h4>
			{/if}
			<div class="flex items-center gap-2 text-[10px] uppercase font-black opacity-30 tracking-widest">
				<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
				{formattedDate}
			</div>
		</div>
		<button 
			class="btn btn-ghost btn-sm btn-circle text-error opacity-0 group-hover:opacity-100 transition-all hover:bg-error/10" 
			onclick={removeTask}
			title="Remove task"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
		</button>
	</div>

	<div class="flex items-center gap-2 text-xs opacity-60 mb-5 font-bold uppercase tracking-tighter bg-base-200/50 w-fit px-3 py-1 rounded-full relative z-10">
		<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-secondary"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
		{task.title}
	</div>

	{#if task.notes}
		<div class="bg-base-200/80 rounded-2xl p-4 mb-5 border-l-4 border-primary relative z-10">
			<div class="flex items-center gap-2 text-[10px] uppercase font-black opacity-40 mb-2">
				<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
				Detail Code
			</div>
			<p class="text-sm leading-relaxed italic font-medium opacity-90 whitespace-pre-wrap">{task.notes}</p>
		</div>
	{/if}

	<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2 pt-5 border-t border-base-300/50 relative z-10">
		{#if task.files.length > 0}
			<div>
				<div class="flex items-center gap-2 text-[10px] uppercase font-black opacity-40 mb-3 tracking-tight">
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
					Impacted Files
				</div>
				<div class="flex flex-wrap gap-2">
					{#each task.files as file}
						<span class="badge badge-sm badge-outline font-mono text-[10px] py-3 px-3 rounded-lg border-base-300 bg-base-100/50">{file}</span>
					{/each}
				</div>
			</div>
		{/if}

		{#if task.functions.length > 0}
			<div>
				<div class="flex items-center gap-2 text-[10px] uppercase font-black opacity-40 mb-3 tracking-tight">
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
					Modified Functions
				</div>
				<div class="flex flex-wrap gap-2">
					{#each task.functions as func}
						<span class="badge badge-sm badge-secondary badge-outline font-mono text-[10px] py-3 px-3 rounded-lg">{func}()</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
