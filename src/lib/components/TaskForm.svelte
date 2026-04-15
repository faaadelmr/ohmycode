<script lang="ts">
	import { kanbanStore } from '$lib/kanban.svelte';
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';

	let title = $state('');
	let description = $state('');
	let notes = $state('');
	let filesInput = $state('');
	let functionsInput = $state('');
	let projectPath = $state('');
	let isSyncing = $state(false);
	let isPicking = $state(false);
	let suggestions = $state<{ file: string; functions: string[]; type: string; selected?: boolean }[]>([]);
	let recentCommits = $state<string[]>([]);
	let errorMessage = $state('');

	onMount(() => {
		const savedPath = localStorage.getItem('last-project-path');
		if (savedPath) projectPath = savedPath;
	});

	const pickFolder = async () => {
		isPicking = true;
		errorMessage = '';
		try {
			const res = await fetch('/api/git/picker');
			const data = await res.json();
			if (data.success) {
				projectPath = data.path;
				syncWithGit();
			} else if (data.error) {
				errorMessage = data.error;
			}
		} catch (e) {
			errorMessage = 'Failed to open folder picker';
		} finally {
			isPicking = false;
		}
	};

	const syncWithGit = async () => {
		if (!projectPath.trim()) return;
		
		isSyncing = true;
		errorMessage = '';
		try {
			localStorage.setItem('last-project-path', projectPath);
			const res = await fetch(`/api/git?path=${encodeURIComponent(projectPath)}`);
			const data = await res.json();
			if (data.success) {
				suggestions = data.suggestions.map((s: any) => ({ ...s, selected: false }));
				recentCommits = data.recentCommits;
			} else {
				errorMessage = data.error || 'Failed to sync with git';
			}
		} catch (e) {
			errorMessage = 'Failed to connect to Git API';
		} finally {
			isSyncing = false;
		}
	};

	const toggleSelection = (index: number) => {
		suggestions[index].selected = !suggestions[index].selected;
		updateFormFromSelected();
	};

	const updateFormFromSelected = () => {
		const selected = suggestions.filter(s => s.selected);
		if (selected.length === 0) return;

		if (selected.length === 1) {
			const s = selected[0];
			title = `${s.type}: ${s.file.split(/[/\\]/).pop()}`;
			filesInput = s.file;
			functionsInput = s.functions.join(', ');
			description = `${s.type} in ${s.file}`;
		} else {
			title = `Batch Update: ${selected.length} files`;
			filesInput = selected.map(s => s.file).join(', ');
			functionsInput = selected.flatMap(s => s.functions).filter((v, i, a) => a.indexOf(v) === i).join(', ');
			description = `Working on ${selected.length} files: ${selected.map(s => s.file.split(/[/\\]/).pop()).join(', ')}`;
		}
	};

	const useCommitMessage = (msg: string) => {
		description = `Context: ${msg}`;
	};

	const handleSubmit = (e: SubmitEvent) => {
		e.preventDefault();
		if (!title.trim()) return;

		const files = filesInput
			.split(',')
			.map((f) => f.trim())
			.filter((f) => f !== '');
		const functions = functionsInput
			.split(',')
			.map((f) => f.trim())
			.filter((f) => f !== '');

		kanbanStore.addTask(title, files, functions, description, notes);

		// Reset form
		title = '';
		description = '';
		notes = '';
		filesInput = '';
		functionsInput = '';
		suggestions = suggestions.map(s => ({ ...s, selected: false }));
		errorMessage = '';
	};
</script>

<div class="card bg-base-100 border border-base-300 shadow-xl mb-12 overflow-visible">
	<form onsubmit={handleSubmit} class="card-body p-6 sm:p-8">
		<!-- Folder Selection -->
		<div class="flex flex-col gap-4 mb-8">
			<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
				<h2 class="card-title text-2xl font-black uppercase tracking-tight flex items-center gap-3">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
					Duty Dashboard
				</h2>
				
				<div class="flex flex-wrap items-center gap-2">
					{#if projectPath}
						<div class="badge badge-outline gap-2 font-mono text-[10px] py-3 opacity-70 border-base-300">
							<span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
							{projectPath}
						</div>
					{/if}
					
					<button 
						type="button" 
						class="btn btn-primary btn-sm rounded-full gap-2 {isPicking ? 'loading' : ''}" 
						onclick={pickFolder}
						disabled={isPicking}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
						Pick Project Folder
					</button>

					<button 
						type="button" 
						class="btn btn-ghost btn-sm btn-circle {isSyncing ? 'loading' : ''}" 
						onclick={syncWithGit}
						disabled={isSyncing || !projectPath}
						title="Refresh changes"
					>
						{#if !isSyncing}
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
						{/if}
					</button>
				</div>
			</div>
			
			{#if errorMessage}
				<div class="alert alert-error py-2 text-xs rounded-lg" transition:fade>
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
					<span>{errorMessage}</span>
				</div>
			{/if}
		</div>

		<!-- Git Suggestions (Multi-Select) -->
		{#if suggestions.length > 0 || recentCommits.length > 0}
			<div class="bg-base-200/50 rounded-3xl p-6 border border-base-300 mb-8" transition:slide>
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<!-- Changed Files -->
					{#if suggestions.length > 0}
						<div>
							<div class="flex justify-between items-center mb-4">
								<h3 class="text-xs font-black uppercase tracking-widest opacity-50 flex items-center gap-2">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
									Detected Changes
								</h3>
								<span class="text-[10px] opacity-40">Select multiple to batch</span>
							</div>
							<div class="flex flex-col gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
								{#each suggestions as suggestion, i}
									<button 
										type="button" 
										class="flex items-center gap-3 p-3 rounded-xl transition-all text-left border {suggestion.selected ? 'bg-primary text-primary-content border-primary shadow-lg scale-[1.02]' : 'bg-base-100 hover:bg-base-300 border-base-300'}"
										onclick={() => toggleSelection(i)}
									>
										<div class="checkbox checkbox-sm pointer-events-none {suggestion.selected ? 'checkbox-primary bg-white' : ''}">
											<input type="checkbox" checked={suggestion.selected} />
										</div>
										<div class="flex flex-col overflow-hidden">
											<span class="font-mono text-xs truncate font-bold">{suggestion.file}</span>
											{#if suggestion.functions.length > 0}
												<span class="text-[9px] opacity-60 truncate">({suggestion.functions.join(', ')})</span>
											{/if}
										</div>
										<span class="ml-auto badge badge-xs font-black {suggestion.selected ? 'badge-ghost' : (suggestion.type === 'Added' ? 'badge-success' : 'badge-warning')}">
											{suggestion.type[0]}
										</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Recent Commits -->
					{#if recentCommits.length > 0}
						<div>
							<h3 class="text-xs font-black uppercase tracking-widest opacity-50 mb-4 flex items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
								Recent Commit Messages
							</h3>
							<div class="flex flex-col gap-2">
								{#each recentCommits as commit}
									<button 
										type="button" 
										class="p-3 rounded-xl bg-base-100/50 hover:bg-base-300 border border-dashed border-base-300 transition-all text-left text-xs opacity-80 hover:opacity-100 italic flex items-start gap-2"
										onclick={() => useCommitMessage(commit)}
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 shrink-0 opacity-40"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
										"{commit}"
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Form Fields -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
			<div class="form-control">
				<label class="label pt-0" for="duty-title">
					<span class="label-text font-black uppercase text-[10px] opacity-50 flex items-center gap-2">
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
						Task Heading
					</span>
				</label>
				<input
					id="duty-title"
					type="text"
					bind:value={title}
					placeholder="Short identifier (e.g. Auth Fix)"
					class="input input-bordered w-full font-bold focus:border-primary transition-all rounded-xl"
					required
				/>
			</div>

			<div class="form-control">
				<label class="label pt-0" for="duty-desc">
					<span class="label-text font-black uppercase text-[10px] opacity-50 flex items-center gap-2">
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
						Title
					</span>
				</label>
				<input
					id="duty-desc"
					type="text"
					bind:value={description}
					placeholder="Main description of this work"
					class="input input-bordered w-full focus:border-primary transition-all rounded-xl"
				/>
			</div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
			<div class="form-control">
				<label class="label pt-0" for="duty-files">
					<span class="label-text font-black uppercase text-[10px] opacity-50 flex items-center gap-2">
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
						Impacted Files
					</span>
				</label>
				<input
					id="duty-files"
					type="text"
					bind:value={filesInput}
					placeholder="index.ts, component.svelte..."
					class="input input-bordered w-full font-mono text-xs focus:border-primary transition-all rounded-xl"
				/>
			</div>

			<div class="form-control">
				<label class="label pt-0" for="duty-functions">
					<span class="label-text font-black uppercase text-[10px] opacity-50 flex items-center gap-2">
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
						Target Functions
					</span>
				</label>
				<input
					id="duty-functions"
					type="text"
					bind:value={functionsInput}
					placeholder="functionName, variable..."
					class="input input-bordered w-full font-mono text-xs focus:border-primary transition-all rounded-xl"
				/>
			</div>
		</div>

		<div class="form-control mb-6">
			<label class="label pt-0" for="duty-notes">
				<span class="label-text font-black uppercase text-[10px] opacity-50 flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
					Detail Code
				</span>
			</label>
			<textarea
				id="duty-notes"
				bind:value={notes}
				placeholder="Deep dive logic reminders or technical notes..."
				class="textarea textarea-bordered w-full focus:border-primary transition-all rounded-xl min-h-[100px]"
			></textarea>
		</div>

		<div class="card-actions justify-end mt-10">
			<button type="submit" class="btn btn-primary px-12 rounded-full font-black shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-transform uppercase tracking-widest gap-3">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
				Add Ticket
			</button>
		</div>
	</form>
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #888;
		border-radius: 10px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #555;
	}
</style>
