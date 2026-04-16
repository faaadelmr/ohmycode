<script lang="ts">
	import { kanbanStore } from '$lib/kanban.svelte';
	import { onMount } from 'svelte';
	import { fade, slide, fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';

	let title = $state('');
	let description = $state('');
	let notes = $state('');
	let filesInput = $state('');
	let functionsInput = $state('');
	let projectPath = $state('');

	// Git Commit Switch
	let includeGitCommit = $state(false);

	// Folder Browser State
	let isSyncing = $state(false);
	let isPicking = $state(false);
	let isCommitting = $state(false);
	let showExplorer = $state(false);
	let explorerPath = $state('');
	let explorerParent = $state('');
	let explorerDirs = $state<string[]>([]);
	let pathSep = $state('/');

	type GitChangeItem = {
		id: string;
		file: string;
		functions: string[];
		type: string;
		diff: string;
		stats: { additions: number; deletions: number };
		isStaged?: boolean;
		selected?: boolean;
		showDiff?: boolean;
	};

	type EditingLine = {
		number: number;
		content: string;
		isChanged: boolean;
	};

	type DiffEditorRow = {
		key: string;
		kind: 'hunk' | 'context' | 'add' | 'remove';
		oldNumber: number | null;
		newNumber: number | null;
		content: string;
		editable: boolean;
	};

	let suggestions = $state<GitChangeItem[]>([]);
	let stagedChanges = $state<GitChangeItem[]>([]);
	let recentCommits = $state<string[]>([]);
	let errorMessage = $state('');
	let successMessage = $state('');
	let editingDiffId = $state<string | null>(null);
	let editingFile = $state('');
	let editingDraft = $state('');
	let editingLines = $state<EditingLine[]>([]);
	let editingRows = $state<DiffEditorRow[]>([]);
	let editingError = $state('');
	let loadingEditor = $state(false);
	let savingEditor = $state(false);

	// Real-time Watcher State
	let eventSource: EventSource | null = null;
	let watcherStatus = $state<'connecting' | 'live' | 'offline'>('offline');
	let lastSyncTime = $state<string>('');
	let fallbackInterval: any = null;

	// UI feedback for drag
	let isDragging = $state(false);
	let overStaged = $state(false);
	let overUnstaged = $state(false);

	onMount(() => {
		const savedPath = localStorage.getItem('last-project-path');
		if (savedPath) {
			projectPath = savedPath;
			setupWatcher(savedPath);
		}

		return () => {
			cleanupWatcher();
		};
	});

	const cleanupWatcher = () => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		if (fallbackInterval) {
			clearInterval(fallbackInterval);
			fallbackInterval = null;
		}
		watcherStatus = 'offline';
	};

	const setupWatcher = (path: string) => {
		cleanupWatcher();
		if (!path) return;

		watcherStatus = 'connecting';

		// 1. Primary: EventSource (SSE)
		eventSource = new EventSource(`/api/git/watch?path=${encodeURIComponent(path)}`);

		eventSource.onopen = () => {
			console.log('[Watcher] SSE Connected');
			watcherStatus = 'live';
			syncWithGit();
		};

		eventSource.addEventListener('change', (e: any) => {
			console.log('[Watcher] Remote change detected:', e.data);
			syncWithGit();
		});

		eventSource.onerror = (err) => {
			console.warn('[Watcher] SSE Connection error, switching to fallback polling...');
			cleanupWatcher();
			startFallbackPolling(path);
		};
	};

	const startFallbackPolling = (path: string) => {
		watcherStatus = 'connecting';
		// Poll every 10 seconds as fallback
		fallbackInterval = setInterval(() => {
			console.log('[Watcher] Polling for changes...');
			syncWithGit();
			watcherStatus = 'live'; // Represent active polling as live-ish
		}, 10000);
	};

	const openExplorer = async (navPath: string = '') => {
		showExplorer = true;
		errorMessage = '';
		try {
			const res = await fetch(`/api/git/picker?path=${encodeURIComponent(navPath)}`);
			const data = await res.json();
			if (data.success) {
				explorerPath = data.currentPath;
				explorerParent = data.parentPath;
				explorerDirs = data.directories;
				pathSep = data.sep;
			} else {
				errorMessage = data.error;
			}
		} catch (e) {
			errorMessage = 'Connection lost to folder server';
		}
	};

	const selectFolder = () => {
		projectPath = explorerPath;
		showExplorer = false;
		localStorage.setItem('last-project-path', projectPath);
		setupWatcher(projectPath);
		syncWithGit();
	};

	const syncWithGit = async () => {
		if (!projectPath.trim()) return;

		isSyncing = true;
		try {
			const res = await fetch(`/api/git?path=${encodeURIComponent(projectPath)}`);
			const data = await res.json();
			if (data.success) {
				const syncList = (newList: any[], oldList: any[]) => {
					return newList.map(newItem => {
						const oldItem = oldList.find(o => o.file === newItem.file && o.type === newItem.type);
						return {
							...newItem,
							id: `${newItem.file}-${newItem.type}`,
							selected: oldItem ? oldItem.selected : false,
							showDiff: oldItem ? oldItem.showDiff : false
						};
					});
				};

				suggestions = syncList(data.suggestions, suggestions);
				stagedChanges = syncList(data.stagedChanges, stagedChanges);
				recentCommits = data.recentCommits;
				lastSyncTime = new Date().toLocaleTimeString();
			}
		} catch (e) {
			console.error('Failed to sync with git', e);
		} finally {
			isSyncing = false;
		}
	};

	const toggleSelection = (index: number, isStagedList: boolean) => {
		if (isStagedList) {
			stagedChanges[index].selected = !stagedChanges[index].selected;
		} else {
			suggestions[index].selected = !suggestions[index].selected;
		}
		updateFormFromSelected();
	};

	const toggleDiff = (e: MouseEvent, index: number, isStagedList: boolean) => {
		e.stopPropagation();
		if (isStagedList) {
			stagedChanges[index].showDiff = !stagedChanges[index].showDiff;
		} else {
			suggestions[index].showDiff = !suggestions[index].showDiff;
		}
	};

	const getChangedLineNumbers = (diff: string) => {
		const changedLines = new Set<number>();
		const lines = diff.split('\n');

		for (const line of lines) {
			if (!line.startsWith('@@')) continue;

			const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
			if (!match) continue;

			const start = Number(match[1]);
			const length = Number(match[2] ?? '1');

			for (let i = 0; i < Math.max(length, 1); i++) {
				changedLines.add(start + i);
			}
		}

		return changedLines;
	};

	const buildEditingLines = (content: string, diff: string) => {
		const changedLines = getChangedLineNumbers(diff);
		const sourceLines = content.split('\n');

		return sourceLines.map((line, index) => ({
			number: index + 1,
			content: line,
			isChanged: changedLines.has(index + 1)
		}));
	};

	const buildDiffEditorRows = (diff: string) => {
		const rows: DiffEditorRow[] = [];
		const lines = diff.split('\n');
		let rowIndex = 0;

		let oldLine = 0;
		let newLine = 0;

		for (const line of lines) {
			if (!line) continue;
			if (line.startsWith('---') || line.startsWith('+++')) continue;

			if (line.startsWith('@@')) {
				const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
				if (!match) continue;

				oldLine = Number(match[1]);
				newLine = Number(match[2]);
				rows.push({
					key: `hunk-${rowIndex++}`,
					kind: 'hunk',
					oldNumber: null,
					newNumber: null,
					content: line,
					editable: false
				});
				continue;
			}

			const prefix = line[0];
			const content = line.slice(1);

			if (prefix === ' ') {
				rows.push({
					key: `ctx-${rowIndex++}`,
					kind: 'context',
					oldNumber: oldLine,
					newNumber: newLine,
					content,
					editable: false
				});
				oldLine++;
				newLine++;
				continue;
			}

			if (prefix === '+') {
				rows.push({
					key: `add-${rowIndex++}`,
					kind: 'add',
					oldNumber: null,
					newNumber: newLine,
					content,
					editable: true
				});
				newLine++;
				continue;
			}

			if (prefix === '-') {
				rows.push({
					key: `remove-${rowIndex++}`,
					kind: 'remove',
					oldNumber: oldLine,
					newNumber: null,
					content,
					editable: false
				});
				oldLine++;
			}
		}

		return rows;
	};

	const syncEditingDraft = () => {
		editingDraft = editingLines.map((line) => line.content).join('\n');
	};

	const updateEditingLine = (index: number, value: string) => {
		if (!editingLines[index]) return;
		editingLines[index].content = value;
		syncEditingDraft();
	};

	const updateEditingRow = (rowIndex: number, value: string) => {
		const row = editingRows[rowIndex];
		if (!row || !row.editable || row.newNumber === null) return;

		row.content = value;
		updateEditingLine(row.newNumber - 1, value);
	};

	const startInlineEdit = async (item: GitChangeItem) => {
		if (!projectPath || item.type === 'Deleted' || loadingEditor || savingEditor) return;

		editingDiffId = item.id;
		editingFile = item.file;
		editingError = '';
		loadingEditor = true;

		try {
			const res = await fetch(
				`/api/git/file?path=${encodeURIComponent(projectPath)}&file=${encodeURIComponent(item.file)}`
			);
			const data = await res.json();

			if (!data.success) {
				editingError = data.error || 'Failed to load file content';
				return;
			}

			editingDraft = data.content ?? '';
			const builtLines = buildEditingLines(editingDraft, item.diff);
			editingLines = builtLines;
			editingRows = buildDiffEditorRows(item.diff);
		} catch (e) {
			editingError = 'Failed to load file content';
		} finally {
			loadingEditor = false;
		}
	};

	const cancelInlineEdit = () => {
		if (savingEditor) return;

		editingDiffId = null;
		editingFile = '';
		editingDraft = '';
		editingLines = [];
		editingRows = [];
		editingError = '';
		loadingEditor = false;
	};

	const saveInlineEdit = async () => {
		if (!projectPath || !editingDiffId || !editingFile || savingEditor) return;

		savingEditor = true;
		editingError = '';

		try {
			const res = await fetch('/api/git/file', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					projectPath,
					file: editingFile,
					content: editingDraft
				})
			});
			const data = await res.json();

			if (!data.success) {
				editingError = data.error || 'Failed to save file';
				return;
			}

			const savedMessage = `Saved ${editingFile}`;
			successMessage = savedMessage;
			setTimeout(() => {
				if (successMessage === savedMessage) successMessage = '';
			}, 3000);

			cancelInlineEdit();
			await syncWithGit();
		} catch (e) {
			editingError = 'Failed to save file';
		} finally {
			savingEditor = false;
		}
	};

	// Conventional Commits inference
	// Spec: https://www.conventionalcommits.org/

	const CC_TYPES: Record<string, { label: string; color: string }> = {
		feat:     { label: 'feat',     color: 'bg-primary/15 text-primary border-primary/30' },
		fix:      { label: 'fix',      color: 'bg-error/15 text-error border-error/30' },
		refactor: { label: 'refactor', color: 'bg-secondary/15 text-secondary border-secondary/30' },
		docs:     { label: 'docs',     color: 'bg-info/15 text-info border-info/30' },
		test:     { label: 'test',     color: 'bg-warning/15 text-warning border-warning/30' },
		style:    { label: 'style',    color: 'bg-accent/15 text-accent border-accent/30' },
		perf:     { label: 'perf',     color: 'bg-success/15 text-success border-success/30' },
		chore:    { label: 'chore',    color: 'bg-base-content/10 text-base-content/50 border-base-300' },
		build:    { label: 'build',    color: 'bg-base-content/10 text-base-content/50 border-base-300' },
		ci:       { label: 'ci',       color: 'bg-base-content/10 text-base-content/50 border-base-300' },
	};

	const getFileCommitType = (item: GitChangeItem): string =>
		inferConventionalType([item]).type;

	const ccBadgeClass = (type: string): string =>
		CC_TYPES[type]?.color ?? CC_TYPES['chore'].color;

	const inferConventionalType = (items: GitChangeItem[]): { type: string; scope: string; summary: string } => {
		const files = items.map(s => s.file.toLowerCase());
		const types = items.map(s => s.type.toLowerCase());

		// --- File-pattern detection ---
		const isTest = files.some(f =>
			/\.(test|spec)\.[jt]sx?$/.test(f) ||
			/\/(tests?|__tests?__)\//i.test(f)
		);
		const isDoc = files.some(f =>
			/\.(md|mdx|rst|txt)$/.test(f) ||
			/\/docs?\//i.test(f)
		);
		const isCi = files.some(f =>
			/\/(\.github|\.circleci|\.gitlab)\//i.test(f) ||
			/dockerfile/i.test(f) ||
			/\.github\/workflows\//i.test(f)
		);
		const isBuild = files.some(f =>
			/(webpack|vite|rollup|esbuild|babel)\.config/.test(f) ||
			/\.(npmrc|nvmrc)$/.test(f) ||
			/^package\.json$/.test(f.split(/[/\\]/).pop() ?? '')
		);
		const isConfig = files.some(f =>
			/\.(yaml|yml|toml|env|ini|cfg)$/.test(f) ||
			/(\.eslintrc|\.prettierrc|tsconfig|svelte\.config|tailwind\.config)/.test(f) ||
			/^\./.test(f.split(/[/\\]/).pop() ?? '')
		);
		const isStyle = files.some(f => /\.(css|scss|sass|less|styl)$/.test(f));
		const isPerf = files.some(f => /(perf|performance|optim|bench)/i.test(f));

		// --- Change-type detection ---
		const hasAdded = types.some(t => t.includes('added') || t.includes('new'));
		const hasDeleted = types.some(t => t.includes('deleted'));
		const hasModified = types.some(t => t.includes('modified'));
		const hasRenamed = types.some(t => t.includes('renamed'));

		// --- Scope: nearest common parent dir ---
		const scope = (() => {
			if (items.length === 1) {
				const parts = items[0].file.split(/[/\\]/);
				return parts.length > 1 ? parts[parts.length - 2] : '';
			}
			const allParts = items.map(s => s.file.split(/[/\\]/).slice(0, -1));
			const shortest = allParts.reduce((a, b) => (a.length <= b.length ? a : b));
			let common = '';
			for (let i = 0; i < shortest.length; i++) {
				if (allParts.every(p => p[i] === shortest[i])) common = shortest[i];
				else break;
			}
			return common;
		})();

		// --- Commit type (priority order) ---
		let type: string;
		if (isCi)                                    type = 'ci';
		else if (isBuild)                            type = 'build';
		else if (isDoc)                              type = 'docs';
		else if (isTest)                             type = 'test';
		else if (isStyle)                            type = 'style';
		else if (isPerf)                             type = 'perf';
		else if (isConfig)                           type = 'chore';
		else if (hasRenamed)                         type = 'refactor';
		else if (hasAdded && !hasModified)           type = 'feat';
		else if (hasDeleted && !hasAdded && !hasModified) type = 'chore';
		else if (hasModified)                        type = 'fix';
		else                                         type = 'chore';

		// --- Summary verb ---
		const verb =
			hasAdded && !hasModified ? 'add' :
			hasDeleted && !hasAdded  ? 'remove' :
			hasRenamed               ? 'rename' :
			                           'update';

		const summary =
			items.length === 1
				? `${verb} ${items[0].file.split(/[/\\]/).pop()}`
				: `${verb} ${items.length} files`;

		return { type, scope, summary };
	};

	const updateFormFromSelected = () => {
		const selectedUnstaged = suggestions.filter(s => s.selected);
		const selectedStaged = stagedChanges.filter(s => s.selected);
		const selected = [...selectedStaged, ...selectedUnstaged];

		if (selected.length === 0) return;

		const { type: ccType, scope, summary } = inferConventionalType(selected);
		const scopePart = scope ? `(${scope})` : '';
		const commitHeader = `${ccType}${scopePart}: ${summary}`;

		if (selected.length === 1) {
			const s = selected[0];
			title = `${s.type}: ${s.file.split(/[/\\]/).pop()}`;
			filesInput = s.file;
			functionsInput = s.functions.join(', ');
			description = `${s.type} in ${s.file}`;
			notes = `${commitHeader}\n\n${s.file} (+${s.stats.additions} -${s.stats.deletions})`;
		} else {
			title = `Batch Update: ${selected.length} files`;
			filesInput = selected.map(s => s.file).join(', ');
			functionsInput = selected.flatMap(s => s.functions).filter((v, i, a) => a.indexOf(v) === i).join(', ');
			description = `Working on ${selected.length} files: ${selected.map(s => s.file.split(/[/\\]/).pop()).join(', ')}`;
			notes = `${commitHeader}\n\nImpacted files:\n` +
					selected.map(s => `- ${s.file} (+${s.stats.additions} -${s.stats.deletions})`).join('\n');
		}
	};

	const useCommitMessage = (msg: string) => {
		description = `Context: ${msg}`;
	};

	// --- Drag and Drop Logic ---
	const handleDragStart = (e: DragEvent, file: string, currentlyStaged: boolean) => {
		isDragging = true;
		if (e.dataTransfer) {
			e.dataTransfer.setData('fileName', file);
			e.dataTransfer.setData('fromStaged', currentlyStaged.toString());
			e.dataTransfer.effectAllowed = 'move';
		}
	};

	const handleDragEnd = () => {
		isDragging = false;
		overStaged = false;
		overUnstaged = false;
	};

	const handleDrop = async (e: DragEvent, dropToStaged: boolean) => {
		e.preventDefault();
		handleDragEnd();

		const fileName = e.dataTransfer?.getData('fileName');
		const fromStaged = e.dataTransfer?.getData('fromStaged') === 'true';

		if (!fileName || fromStaged === dropToStaged || !projectPath) return;

		// Optimistic Update
		if (dropToStaged) {
			const idx = suggestions.findIndex(s => s.file === fileName);
			if (idx !== -1) {
				const item = suggestions[idx];
				suggestions.splice(idx, 1);
				stagedChanges.push({ ...item, isStaged: true });
			}
		} else {
			const idx = stagedChanges.findIndex(s => s.file === fileName);
			if (idx !== -1) {
				const item = stagedChanges[idx];
				stagedChanges.splice(idx, 1);
				suggestions.push({ ...item, isStaged: false });
			}
		}

		try {
			await fetch('/api/git', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath, file: fileName, stage: dropToStaged })
			});
			syncWithGit();
		} catch (err) {
			syncWithGit();
		}
	};

	const handleSubmit = async (e: SubmitEvent) => {
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

		const fileDiffs: Record<string, string> = {};
		[...stagedChanges, ...suggestions].filter(s => s.selected).forEach(s => {
			if (s.diff) fileDiffs[s.file] = s.diff;
		});

		if (includeGitCommit && projectPath) {
			isCommitting = true;
			try {
				const commitRes = await fetch('/api/git', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						projectPath,
						message: notes || description || title,
						files: files.length > 0 ? files : null
					})
				});
				const commitData = await commitRes.json();
				if (!commitData.success) {
					errorMessage = `Git Commit Failed: ${commitData.error}`;
					isCommitting = false;
					return;
				} else {
					successMessage = 'Git Commit Successful!';
					setTimeout(() => successMessage = '', 3000);
				}
			} catch (err) {
				errorMessage = 'Failed to execute git commit API';
				isCommitting = false;
				return;
			} finally {
				isCommitting = false;
			}
		}

		const newTask = kanbanStore.addTask(title, files, functions, description, notes, projectPath, fileDiffs);

		if (projectPath) {
			kanbanStore.syncToLocal(newTask, projectPath);
		}

		title = '';
		description = '';
		notes = '';
		filesInput = '';
		functionsInput = '';
		includeGitCommit = false;
		suggestions = suggestions.map(s => ({ ...s, selected: false, showDiff: false }));
		stagedChanges = stagedChanges.map(s => ({ ...s, selected: false, showDiff: false }));
		errorMessage = '';
	};
</script>

<div class="card bg-base-100 border border-base-300 shadow-xl mb-12 overflow-visible">
	<form onsubmit={handleSubmit} class="card-body p-6 sm:p-8">
		<!-- Folder Selection -->
		<div class="flex flex-col gap-4 mb-8">
			<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
				<div class="flex items-center gap-4">
					<h2 class="card-title text-2xl font-black uppercase tracking-tight flex items-center gap-3 text-primary">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
						Duty Dashboard
					</h2>

					<!-- Watcher Status Indicator -->
					{#if projectPath}
						<div
							class="badge badge-sm gap-1.5 py-3 px-3 font-bold uppercase text-[9px] border-none shadow-sm transition-colors duration-500 {watcherStatus === 'live' ? 'bg-success/10 text-success' : watcherStatus === 'connecting' ? 'bg-warning/10 text-warning' : 'bg-error/10 text-error'}"
							title={watcherStatus === 'live' ? `Real-time monitoring active. Last sync: ${lastSyncTime}` : 'Connecting to project...'}
						>
							<span class="w-1.5 h-1.5 rounded-full {watcherStatus === 'live' ? 'bg-success animate-pulse' : watcherStatus === 'connecting' ? 'bg-warning animate-bounce' : 'bg-error'}"></span>
							{watcherStatus}
						</div>
					{/if}
				</div>

				<div class="flex flex-wrap items-center gap-2">
					{#if projectPath}
						<div class="badge badge-outline gap-2 font-mono text-[10px] py-3 opacity-70 border-base-300">
							{projectPath}
						</div>
					{/if}

					<button
						type="button"
						class="btn btn-primary btn-sm rounded-full gap-2 transition-transform hover:scale-105 active:scale-95"
						onclick={() => openExplorer(projectPath)}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
						Pick Folder
					</button>
				</div>
			</div>

			{#if errorMessage}
				<div class="alert alert-error py-2 text-xs rounded-lg" transition:fade>
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
					<span>{errorMessage}</span>
				</div>
			{/if}

			{#if successMessage}
				<div class="alert alert-success py-2 text-xs rounded-lg" transition:fade>
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2l4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
					<span>{successMessage}</span>
				</div>
			{/if}
		</div>

		<!-- Explorer UI Overlay -->
		{#if showExplorer}
			<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" in:fade>
				<div class="card w-full max-w-2xl bg-base-100 shadow-2xl border border-base-300 max-h-[80vh] flex flex-col" in:fly={{ y: 20 }}>
					<div class="card-body p-0 overflow-hidden flex flex-col">
						<div class="p-6 border-b border-base-300 bg-base-200/50">
							<h3 class="font-black uppercase tracking-widest text-sm mb-4">Internal Folder Picker</h3>
							<div class="flex items-center gap-2">
								<button type="button" class="btn btn-sm btn-ghost" onclick={() => openExplorer(explorerParent)} title="Back">
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
								</button>
								<div class="bg-base-100 px-4 py-2 rounded-xl border border-base-300 flex-1 font-mono text-[10px] truncate overflow-hidden">
									{explorerPath}
								</div>
							</div>
						</div>

						<div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 custom-scrollbar">
							{#each explorerDirs as dir}
								<button
									type="button"
									class="flex items-center gap-3 p-3 rounded-xl hover:bg-primary/10 hover:text-primary transition-colors text-left group"
									onclick={() => openExplorer(explorerPath + pathSep + dir)}
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-40 group-hover:opacity-100 transition-opacity"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
									<span class="text-xs font-bold truncate">{dir}</span>
								</button>
							{/each}
						</div>

						<div class="p-6 border-t border-base-300 bg-base-200/50 flex justify-between gap-4">
							<button type="button" class="btn btn-ghost rounded-full px-8" onclick={() => showExplorer = false}>Cancel</button>
							<button type="button" class="btn btn-primary rounded-full px-8 font-black" onclick={selectFolder}>Select This Folder</button>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Git Changes (Side by Side) -->
		{#if suggestions.length > 0 || stagedChanges.length > 0}
			<div class="bg-base-200/50 rounded-[2.5rem] p-8 border border-base-300 mb-12 shadow-inner" transition:slide>
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
					<!-- Staged Changes -->
					<div
						class="flex flex-col h-full"
						role="region"
						aria-label="Staged Changes Dropzone"
						ondrop={(e) => handleDrop(e, true)}
						ondragover={(e) => { e.preventDefault(); overStaged = true; }}
						ondragleave={() => overStaged = false}
					>
						<div class="flex justify-between items-center mb-5 px-2">
							<h3 class="text-xs font-black uppercase tracking-widest text-success flex items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
								Staged Changes
							</h3>
							<span class="badge badge-sm badge-success font-black bg-success/20 text-success border-none px-3">{stagedChanges.length}</span>
						</div>
						<div class="flex flex-col gap-3 min-h-[150px] bg-base-100/50 rounded-3xl p-3 border-2 border-dashed transition-all {overStaged ? 'border-success bg-success/5 scale-[1.02] shadow-xl' : 'border-base-300'}">
							{#each stagedChanges as s, i (s.id)}
								<div
									animate:flip={{ duration: 400 }}
									class="flex flex-col gap-1"
									draggable="true"
									role="listitem"
									aria-label="Staged file {s.file}"
									ondragstart={(e) => handleDragStart(e, s.file, true)}
									ondragend={handleDragEnd}
								>
									<div
										role="button"
										tabindex="0"
										class="flex items-center gap-3 p-4 rounded-2xl transition-all text-left border cursor-grab active:cursor-grabbing {s.selected ? 'bg-primary text-primary-content border-primary shadow-lg' : 'bg-base-100 hover:bg-base-200 border-base-300 shadow-sm'}"
										onclick={() => toggleSelection(i, true)}
										onkeydown={(e) => e.key === 'Enter' && toggleSelection(i, true)}
									>
										<div class="checkbox checkbox-sm pointer-events-none {s.selected ? 'checkbox-primary bg-white' : ''}">
											<input type="checkbox" checked={s.selected} aria-label="Select file"/>
										</div>
										<div class="flex flex-col overflow-hidden flex-1">
											<span class="font-mono text-xs truncate font-bold">{s.file}</span>
											<div class="flex items-center gap-2 mt-1">
												<span class="text-[9px] font-black">
													<span class="text-success">+{s.stats.additions}</span>
													<span class="text-error">-{s.stats.deletions}</span>
												</span>
												{#if !s.selected}
													{@const ccType = getFileCommitType(s)}
													<span class="badge badge-xs border font-black px-1.5 py-2 rounded-md {ccBadgeClass(ccType)}">{ccType}</span>
												{/if}
											</div>
										</div>
										<button type="button" class="btn btn-xs btn-ghost btn-circle" onclick={(e) => toggleDiff(e, i, true)} title="Toggle Diff">
											<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="transition-transform {s.showDiff ? 'rotate-180 text-primary' : ''}"><polyline points="6 9 12 15 18 9"></polyline></svg>
										</button>
									</div>
									{#if s.showDiff && s.diff}
										{#if editingDiffId === s.id}
											<div class="bg-base-300 rounded-2xl p-4 font-mono text-[9px] overflow-x-auto whitespace-pre border border-base-300 shadow-inner mt-1" transition:slide>
												<div class="mb-2 flex justify-end gap-2 not-italic whitespace-normal">
													<button type="button" class="btn btn-xs btn-primary rounded-full px-3" onclick={saveInlineEdit} disabled={loadingEditor || savingEditor}>
														{savingEditor ? 'Saving...' : 'Save'}
													</button>
													<button type="button" class="btn btn-xs btn-ghost rounded-full px-3" onclick={cancelInlineEdit} disabled={savingEditor}>
														Cancel
													</button>
												</div>
												{#if editingError}
													<div class="mb-3 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-[10px] text-error whitespace-normal">
														{editingError}
													</div>
												{/if}
												{#if loadingEditor}
													<div class="px-1 text-[10px] opacity-60 whitespace-normal">Loading file content...</div>
												{:else}
													<div class="max-h-80 overflow-auto">
														{#each editingRows as row, rowIndex (row.key)}
															<div class="{row.kind === 'add' ? 'text-success bg-success/5' : row.kind === 'remove' ? 'text-error bg-error/5' : row.kind === 'context' ? 'opacity-50' : 'opacity-50'} px-1">
																{#if row.kind === 'hunk'}
																	<div>{row.content}</div>
																{:else if row.editable}
																	<div class="grid grid-cols-[10px_1fr] items-start gap-1">
																		<span>{row.kind === 'add' ? '+' : ' '}</span>
																		<input
																			type="text"
																			value={row.content}
																			oninput={(e) => updateEditingRow(rowIndex, (e.currentTarget as HTMLInputElement).value)}
																			class="min-w-0 border-0 bg-transparent p-0 font-mono text-[9px] leading-normal text-inherit focus:outline-none"
																			spellcheck="false"
																		/>
																	</div>
																{:else}
																	<div>{row.kind === 'remove' ? `-${row.content}` : row.kind === 'context' ? ` ${row.content}` : row.content}</div>
																{/if}
															</div>
														{/each}
													</div>
												{/if}
											</div>
										{:else}
											<button
												type="button"
												class="mt-1 w-full overflow-x-auto whitespace-pre rounded-2xl border border-base-300 bg-base-300 p-4 text-left font-mono text-[9px] shadow-inner"
												transition:slide
												ondblclick={() => startInlineEdit(s)}
												title={s.type === 'Deleted' ? 'Deleted files cannot be edited inline' : 'Double click to edit'}
											>
												{#each s.diff.split('\n') as line}
													<div class="{line.startsWith('+') ? 'text-success bg-success/5' : line.startsWith('-') ? 'text-error bg-error/5' : 'opacity-50'} px-1">{line}</div>
												{/each}
											</button>
										{/if}
									{/if}
								</div>
							{/each}
							{#if stagedChanges.length === 0}
								<div class="flex-1 flex flex-col items-center justify-center opacity-20 py-10 gap-3">
									<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
									<span class="italic text-[10px] font-black uppercase tracking-widest">Drop here to stage</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- Unstaged (Detected) Changes -->
					<div
						class="flex flex-col h-full"
						role="region"
						aria-label="Detected Changes Dropzone"
						ondrop={(e) => handleDrop(e, false)}
						ondragover={(e) => { e.preventDefault(); overUnstaged = true; }}
						ondragleave={() => overUnstaged = false}
					>
						<div class="flex justify-between items-center mb-5 px-2">
							<h3 class="text-xs font-black uppercase tracking-widest text-warning flex items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
								Detected Changes
							</h3>
							<span class="badge badge-sm badge-warning font-black bg-warning/20 text-warning border-none px-3">{suggestions.length}</span>
						</div>
						<div class="flex flex-col gap-3 min-h-[150px] bg-base-100/50 rounded-3xl p-3 border-2 border-dashed transition-all {overUnstaged ? 'border-warning bg-warning/5 scale-[1.02] shadow-xl' : 'border-base-300'}">
							{#each suggestions as s, i (s.id)}
								<div
									animate:flip={{ duration: 400 }}
									class="flex flex-col gap-1"
									draggable="true"
									role="listitem"
									aria-label="Unstaged file {s.file}"
									ondragstart={(e) => handleDragStart(e, s.file, false)}
									ondragend={handleDragEnd}
								>
									<div
										role="button"
										tabindex="0"
										class="flex items-center gap-3 p-4 rounded-2xl transition-all text-left border cursor-grab active:cursor-grabbing {s.selected ? 'bg-primary text-primary-content border-primary shadow-lg' : 'bg-base-100 hover:bg-base-200 border-base-300 shadow-sm'}"
										onclick={() => toggleSelection(i, false)}
										onkeydown={(e) => e.key === 'Enter' && toggleSelection(i, false)}
									>
										<div class="checkbox checkbox-sm pointer-events-none {s.selected ? 'checkbox-primary bg-white' : ''}">
											<input type="checkbox" checked={s.selected} aria-label="Select file"/>
										</div>
										<div class="flex flex-col overflow-hidden flex-1">
											<span class="font-mono text-xs truncate font-bold">{s.file}</span>
											<div class="flex items-center gap-2 mt-1">
												<span class="text-[9px] font-black">
													<span class="text-success">+{s.stats.additions}</span>
													<span class="text-error">-{s.stats.deletions}</span>
												</span>
												{#if !s.selected}
													{@const ccType = getFileCommitType(s)}
													<span class="badge badge-xs border font-black px-1.5 py-2 rounded-md {ccBadgeClass(ccType)}">{ccType}</span>
												{/if}
											</div>
										</div>
										<button type="button" class="btn btn-xs btn-ghost btn-circle" onclick={(e) => toggleDiff(e, i, false)} title="Toggle Diff">
											<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="transition-transform {s.showDiff ? 'rotate-180 text-primary' : ''}"><polyline points="6 9 12 15 18 9"></polyline></svg>
										</button>
									</div>
									{#if s.showDiff && s.diff}
										{#if editingDiffId === s.id}
											<div class="bg-base-300 rounded-2xl p-4 font-mono text-[9px] overflow-x-auto whitespace-pre border border-base-300 shadow-inner mt-1" transition:slide>
												<div class="mb-2 flex justify-end gap-2 not-italic whitespace-normal">
													<button type="button" class="btn btn-xs btn-primary rounded-full px-3" onclick={saveInlineEdit} disabled={loadingEditor || savingEditor}>
														{savingEditor ? 'Saving...' : 'Save'}
													</button>
													<button type="button" class="btn btn-xs btn-ghost rounded-full px-3" onclick={cancelInlineEdit} disabled={savingEditor}>
														Cancel
													</button>
												</div>
												{#if editingError}
													<div class="mb-3 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-[10px] text-error whitespace-normal">
														{editingError}
													</div>
												{/if}
												{#if loadingEditor}
													<div class="px-1 text-[10px] opacity-60 whitespace-normal">Loading file content...</div>
												{:else}
													<div class="max-h-80 overflow-auto">
														{#each editingRows as row, rowIndex (row.key)}
															<div class="{row.kind === 'add' ? 'text-success bg-success/5' : row.kind === 'remove' ? 'text-error bg-error/5' : row.kind === 'context' ? 'opacity-50' : 'opacity-50'} px-1">
																{#if row.kind === 'hunk'}
																	<div>{row.content}</div>
																{:else if row.editable}
																	<div class="grid grid-cols-[10px_1fr] items-start gap-1">
																		<span>{row.kind === 'add' ? '+' : ' '}</span>
																		<input
																			type="text"
																			value={row.content}
																			oninput={(e) => updateEditingRow(rowIndex, (e.currentTarget as HTMLInputElement).value)}
																			class="min-w-0 border-0 bg-transparent p-0 font-mono text-[9px] leading-normal text-inherit focus:outline-none"
																			spellcheck="false"
																		/>
																	</div>
																{:else}
																	<div>{row.kind === 'remove' ? `-${row.content}` : row.kind === 'context' ? ` ${row.content}` : row.content}</div>
																{/if}
															</div>
														{/each}
													</div>
												{/if}
											</div>
										{:else}
											<button
												type="button"
												class="mt-1 w-full overflow-x-auto whitespace-pre rounded-2xl border border-base-300 bg-base-300 p-4 text-left font-mono text-[9px] shadow-inner"
												transition:slide
												ondblclick={() => startInlineEdit(s)}
												title={s.type === 'Deleted' ? 'Deleted files cannot be edited inline' : 'Double click to edit'}
											>
												{#each s.diff.split('\n') as line}
													<div class="{line.startsWith('+') ? 'text-success bg-success/5' : line.startsWith('-') ? 'text-error bg-error/5' : 'opacity-50'} px-1">{line}</div>
												{/each}
											</button>
										{/if}
									{/if}
								</div>
							{/each}
							{#if suggestions.length === 0}
								<div class="flex-1 flex flex-col items-center justify-center opacity-20 py-10 gap-3">
									<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
									<span class="italic text-[10px] font-black uppercase tracking-widest">All changes are staged</span>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Recent Commit Messages (Bottom) -->
				{#if recentCommits.length > 0}
					<div class="mt-10 pt-8 border-t border-base-300/50">
						<h3 class="text-xs font-black uppercase tracking-widest opacity-40 mb-5 flex items-center gap-2 ml-2">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
							Recent History Context
						</h3>
						<div class="flex flex-wrap gap-3">
							{#each recentCommits as commit}
								<button
									type="button"
									class="p-2.5 px-5 rounded-2xl bg-base-100 hover:bg-base-300 border border-dashed border-base-300 transition-all text-left text-[10px] opacity-70 hover:opacity-100 italic hover:border-solid hover:shadow-md"
									onclick={() => useCommitMessage(commit)}
								>
									"{commit}"
								</button>
							{/each}
						</div>
					</div>
				{/if}
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
				class="textarea textarea-bordered w-full focus:border-primary transition-all rounded-xl min-h-[150px] font-mono text-xs"
			></textarea>
		</div>

		<div class="flex flex-col sm:flex-row items-center justify-between gap-6 mt-10 p-6 bg-base-200/50 rounded-[2rem] border border-base-300">
			<div class="form-control">
				<label class="label cursor-pointer gap-4">
					<div class="flex flex-col text-left leading-tight">
						<span class="text-xs font-black uppercase tracking-tight">Push to Git Commit</span>
						<span class="text-[10px] opacity-50">Auto commit with Detail Code as message</span>
					</div>
					<input type="checkbox" class="toggle toggle-primary" bind:checked={includeGitCommit} disabled={!projectPath} />
				</label>
			</div>

			<button
				type="submit"
				class="btn btn-primary px-12 rounded-full font-black shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-transform uppercase tracking-widest gap-3 w-full sm:w-auto {isCommitting ? 'loading' : ''}"
				disabled={isCommitting}
			>
				{#if !isCommitting}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
				{/if}
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
