<script lang="ts">
	import type { DutyTask } from '$lib/kanban.svelte';
	import { kanbanStore } from '$lib/kanban.svelte';
	import { slide } from 'svelte/transition';

	let { task }: { task: DutyTask } = $props();
	let openDiffs = $state<Record<string, boolean>>({});

	const removeTask = () => {
		if (confirm('Are you sure you want to delete this duty?')) {
			kanbanStore.removeTask(task.id);
		}
	};

	const downloadFile = (file: string) => {
		if (!task.projectPath) return;
		const params = new URLSearchParams({
			projectPath: task.projectPath,
			file,
			...(task.logFolderName
				? { logFolder: task.logFolderName }
				: { createdAt: String(task.createdAt) })
		});
		window.open(`/api/log/download?${params}`, '_blank');
	};

	const toggleFileDiff = (file: string) => {
		openDiffs[file] = !openDiffs[file];
	};

	const formattedDate = $derived(
		new Date(task.createdAt).toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		})
	);
</script>

<div
	class="glass-panel hover-lift card relative mb-5 overflow-hidden rounded-2xl border border-l-4 border-base-content/10 border-l-primary/75 p-6 shadow-xl"
>
	<!-- Subtle ambient background glow -->
	<div
		class="absolute top-0 right-0 -mt-16 -mr-16 h-32 w-32 rounded-full bg-primary/5 blur-2xl transition-colors group-hover:bg-primary/10"
	></div>

	<div class="relative z-10 mb-4 flex items-start justify-between">
		<div class="flex-1 text-left">
			{#if task.description}
				<h4 class="mb-1.5 text-xl leading-snug font-extrabold tracking-tight text-primary">
					{task.description}
				</h4>
			{/if}
			<div
				class="flex items-center gap-2 text-[10px] font-black tracking-widest uppercase opacity-45"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="11"
					height="11"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line
						x1="16"
						y1="2"
						x2="16"
						y2="6"
					></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"
					></line></svg
				>
				{formattedDate}
			</div>
		</div>
		<button
			class="btn btn-circle text-error/65 btn-ghost transition-all btn-xs hover:bg-error/10 hover:text-error"
			onclick={removeTask}
			title="Remove task"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="3"
				stroke-linecap="round"
				stroke-linejoin="round"
				><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg
			>
		</button>
	</div>

	<div
		class="relative z-10 mb-4 flex w-fit items-center gap-1.5 rounded-md border border-base-content/5 bg-base-300/40 px-3 py-1 text-[10px] font-bold tracking-wider uppercase opacity-75"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="10"
			height="10"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="text-secondary"
			><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line
				x1="4"
				y1="22"
				x2="4"
				y2="15"
			></line></svg
		>
		{task.title}
	</div>

	{#if task.notes}
		<div
			class="relative z-10 mb-5 rounded-xl border border-l-2 border-base-content/5 border-l-primary bg-base-200/50 p-4 text-left"
		>
			<div
				class="mb-1.5 flex items-center gap-2 text-[9px] font-black tracking-wider uppercase opacity-50"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="11"
					height="11"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg
				>
				Detail Code
			</div>
			<p class="text-[12px] leading-relaxed font-medium whitespace-pre-wrap italic opacity-90">
				{task.notes}
			</p>
		</div>
	{/if}

	<div
		class="relative z-10 mt-2 grid grid-cols-1 gap-5 border-t border-base-content/10 pt-4 md:grid-cols-2"
	>
		{#if task.files.length > 0}
			<div class="flex flex-col gap-2">
				<div
					class="flex items-center gap-2 text-left text-[9px] font-black tracking-wider uppercase opacity-50"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="11"
						height="11"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline
							points="13 2 13 9 20 9"
						></polyline></svg
					>
					Impacted Files ({task.files.length})
				</div>
				<div class="flex flex-col gap-1.5">
					{#each task.files as file (file)}
						<div class="flex flex-col gap-1">
							<div class="flex items-center gap-1.5">
								<button
									type="button"
									class="group/file badge flex flex-1 cursor-pointer items-center justify-start gap-1.5 overflow-hidden rounded-lg badge-outline border-base-content/10 bg-base-200/30 px-3 py-3.5 text-left font-mono badge-sm text-[9px] transition-all hover:border-primary/20 hover:bg-primary/10 hover:text-primary"
									onclick={() => downloadFile(file)}
									title="Download this backup version"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="10"
										height="10"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="shrink-0 opacity-40 transition-opacity group-hover/file:opacity-100"
										><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline
											points="7 10 12 15 17 10"
										></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg
									>
									<span class="truncate">{file}</span>
								</button>

								{#if task.fileDiffs && task.fileDiffs[file]}
									<button
										class="btn btn-circle btn-ghost btn-xs"
										onclick={() => toggleFileDiff(file)}
										title="View code changes"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="11"
											height="11"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="transition-transform {openDiffs[file]
												? 'rotate-180 text-primary'
												: ''}"><polyline points="6 9 12 15 18 9"></polyline></svg
										>
									</button>
								{/if}
							</div>

							{#if openDiffs[file] && task.fileDiffs && task.fileDiffs[file]}
								<div
									class="vscode-scrollbar max-h-48 overflow-x-auto rounded-xl border border-base-content/10 bg-base-300/40 p-3 font-mono text-[9px] whitespace-pre"
									transition:slide
								>
									{#each task.fileDiffs[file].split('\n') as line, i (i)}
										<div
											class={line.startsWith('+')
												? 'bg-success/5 font-semibold text-success'
												: line.startsWith('-')
													? 'bg-error/5 font-semibold text-error'
													: 'opacity-60'}
										>
											{line}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if task.functions.length > 0}
			<div class="text-left">
				<div
					class="mb-2.5 flex items-center gap-2 text-[9px] font-black tracking-wider uppercase opacity-50"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="11"
						height="11"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
						><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"
						></polyline></svg
					>
					Modified Functions ({task.functions.length})
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each task.functions as func (func)}
						<span
							class="badge rounded-lg badge-outline border-secondary/30 bg-secondary/5 px-2.5 py-2.5 font-mono badge-sm text-[9px] badge-secondary"
							>{func}()</span
						>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
