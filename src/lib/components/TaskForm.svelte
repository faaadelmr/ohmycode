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

	// ── Pointer-based drag state ───────────────────────────────────────
	type DragState = {
		file: string;
		fromStaged: boolean;
		startX: number; startY: number;
		curX: number;   curY: number;
		offsetX: number; offsetY: number;
		cardW: number;  cardH: number;
	};
	let dragState   = $state<DragState | null>(null);
	let dropTarget  = $state<'staged' | 'unstaged' | null>(null);
	let droppedFile = $state<string | null>(null);

	let stagedZoneEl   = $state<HTMLElement | undefined>(undefined);
	let unstagedZoneEl = $state<HTMLElement | undefined>(undefined);

	let isDraggingActive     = $derived(dragState !== null);
	let dragHasMoved         = $derived(dragState !== null && (Math.abs(dragState.curX - dragState.startX) > 4 || Math.abs(dragState.curY - dragState.startY) > 4));
	let isDraggingToStaged   = $derived(dragState !== null && !dragState.fromStaged && dropTarget === 'staged');
	let isDraggingToUnstaged = $derived(dragState !== null &&  dragState.fromStaged && dropTarget === 'unstaged');

	let stagedZoneClass = $derived(
		!dragState               ? 'border-dashed border-base-300 bg-base-100/50' :
		dragState.fromStaged     ? 'border-dashed border-base-300 bg-base-100/20 opacity-40' :
		dropTarget === 'staged'  ? 'border-success bg-success/10 shadow-[0_0_40px_rgba(0,200,100,0.18)] scale-[1.02]' :
		                           'border-dashed border-success/40 bg-success/5'
	);
	let unstagedZoneClass = $derived(
		!dragState               ? 'border-dashed border-base-300 bg-base-100/50' :
		!dragState.fromStaged    ? 'border-dashed border-base-300 bg-base-100/20 opacity-40' :
		dropTarget === 'unstaged'? 'border-warning bg-warning/10 shadow-[0_0_40px_rgba(255,170,0,0.18)] scale-[1.02]' :
		                           'border-dashed border-warning/40 bg-warning/5'
	);

	onMount(() => {
		const savedPath = localStorage.getItem('last-project-path');
		if (savedPath) {
			projectPath = savedPath;
			setupWatcher(savedPath);
		}

		document.addEventListener('pointermove',   onGlobalPointerMove, { passive: true });
		document.addEventListener('pointerup',     onGlobalPointerUp);
		document.addEventListener('pointercancel', onGlobalPointerUp);

		return () => {
			cleanupWatcher();
			document.removeEventListener('pointermove',   onGlobalPointerMove);
			document.removeEventListener('pointerup',     onGlobalPointerUp);
			document.removeEventListener('pointercancel', onGlobalPointerUp);
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

	const toggleSelectAll = (isStagedList: boolean) => {
		if (isStagedList) {
			const anyUnselected = stagedChanges.some((s) => !s.selected);
			stagedChanges.forEach((s) => (s.selected = anyUnselected));
		} else {
			const anyUnselected = suggestions.some((s) => !s.selected);
			suggestions.forEach((s) => (s.selected = anyUnselected));
		}
		updateFormFromSelected();
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

	// ── Pointer-based Drag & Drop ──────────────────────────────────────

	const onCardPointerDown = (e: PointerEvent, file: string, fromStaged: boolean) => {
		if (e.button !== 0) return;
		if ((e.target as HTMLElement).closest('button, input, a, textarea')) return;
		e.preventDefault();

		const cardEl = e.currentTarget as HTMLElement;
		const rect   = cardEl.getBoundingClientRect();

		dragState = {
			file, fromStaged,
			startX: e.clientX, startY: e.clientY,
			curX:   e.clientX, curY:   e.clientY,
			offsetX: e.clientX - rect.left,
			offsetY: e.clientY - rect.top,
			cardW: rect.width,
			cardH: rect.height,
		};

		document.body.style.userSelect = 'none';
		document.body.style.cursor     = 'grabbing';
	};

	const onGlobalPointerMove = (e: PointerEvent) => {
		if (!dragState) return;
		dragState = { ...dragState, curX: e.clientX, curY: e.clientY };

		if (!stagedZoneEl || !unstagedZoneEl) { dropTarget = null; return; }

		const sr = stagedZoneEl.getBoundingClientRect();
		const ur = unstagedZoneEl.getBoundingClientRect();

		if (e.clientX >= sr.left && e.clientX <= sr.right && e.clientY >= sr.top && e.clientY <= sr.bottom) {
			dropTarget = 'staged';
		} else if (e.clientX >= ur.left && e.clientX <= ur.right && e.clientY >= ur.top && e.clientY <= ur.bottom) {
			dropTarget = 'unstaged';
		} else {
			dropTarget = null;
		}
	};

	const onGlobalPointerUp = async () => {
		if (!dragState) return;

		document.body.style.userSelect = '';
		document.body.style.cursor     = '';

		const { file, fromStaged } = dragState;
		const target = dropTarget;

		dragState  = null;
		dropTarget = null;

		const toStaged   = target === 'staged';
		const shouldMove = target !== null && toStaged !== fromStaged;
		if (!shouldMove) return;

		if (toStaged) {
			const idx = suggestions.findIndex(s => s.file === file);
			if (idx !== -1) {
				const item = suggestions[idx];
				suggestions.splice(idx, 1);
				stagedChanges.push({ ...item, isStaged: true });
			}
		} else {
			const idx = stagedChanges.findIndex(s => s.file === file);
			if (idx !== -1) {
				const item = stagedChanges[idx];
				stagedChanges.splice(idx, 1);
				suggestions.push({ ...item, isStaged: false });
			}
		}

		droppedFile = file;
		setTimeout(() => { if (droppedFile === file) droppedFile = null; }, 700);

		try {
			await fetch('/api/git', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath, file, stage: toStaged })
			});
			// Watcher handles the sync
		} catch {
			syncWithGit();
		}
	};

	const moveFile = async (e: MouseEvent, fileName: string, toStaged: boolean) => {
		e.stopPropagation();
		if (!projectPath) return;

		// Optimistic UI update
		if (toStaged) {
			const idx = suggestions.findIndex((s) => s.file === fileName);
			if (idx !== -1) {
				const item = suggestions[idx];
				suggestions.splice(idx, 1);
				stagedChanges.push({ ...item, isStaged: true, selected: true });
			}
		} else {
			const idx = stagedChanges.findIndex((s) => s.file === fileName);
			if (idx !== -1) {
				const item = stagedChanges[idx];
				stagedChanges.splice(idx, 1);
				suggestions.push({ ...item, isStaged: false, selected: false });
			}
		}

		updateFormFromSelected();

		try {
			await fetch('/api/git', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath, file: fileName, stage: toStaged })
			});
			// Watcher handles the sync
		} catch {
			syncWithGit();
		}
	};

	const moveAll = async (toStaged: boolean) => {
		if (!projectPath) return;

		// Optimistic UI update
		if (toStaged) {
			stagedChanges.push(...suggestions.map((s) => ({ ...s, isStaged: true, selected: true })));
			suggestions.length = 0;
		} else {
			suggestions.push(...stagedChanges.map((s) => ({ ...s, isStaged: false, selected: false })));
			stagedChanges.length = 0;
		}

		updateFormFromSelected();

		try {
			await fetch('/api/git', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath, all: true, stage: toStaged })
			});
			// Watcher handles the sync
		} catch {
			syncWithGit();
		}
	};

	const discardChanges = async (fileName?: string) => {
		if (!projectPath) return;

		const isAll = !fileName;
		const message = isAll
			? 'Are you sure you want to discard ALL detected changes? This cannot be undone.'
			: `Are you sure you want to discard changes to ${fileName}?`;

		if (!confirm(message)) return;

		try {
			const res = await fetch('/api/git/discard', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath, file: fileName, all: isAll })
			});
			const data = await res.json();
			if (data.success) {
				if (isAll) {
					suggestions = [];
				} else {
					suggestions = suggestions.filter((s) => s.file !== fileName);
				}
				updateFormFromSelected();
			} else {
				errorMessage = `Discard failed: ${data.error}`;
			}
		} catch (e) {
			errorMessage = 'Failed to call discard API';
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
			kanbanStore.syncToLocal(newTask, projectPath, includeGitCommit);
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

<div class="w-full mb-12 relative overflow-visible rounded-[2rem] p-0.5 bg-gradient-to-br from-base-300 via-base-100 to-base-300/40 shadow-2xl">
	<!-- Ambient Backlight -->
	<div class="absolute -inset-1 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-[2rem] blur-2xl opacity-75 -z-10 pointer-events-none animate-pulse"></div>

	<form onsubmit={handleSubmit} class="w-full flex flex-col xl:grid xl:grid-cols-12 gap-6 bg-base-100/80 backdrop-blur-xl rounded-[2rem] p-6 sm:p-8 overflow-hidden relative">
		
		<!-- Scanlines / Futuristic grid effect -->
		<div class="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" style="background-image: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06)); background-size: 100% 4px, 6px 100%;"></div>

		<!-- UPPER DECK: High-Tech Project Status HUD -->
		<div class="col-span-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-base-content/10">
			<div class="flex flex-wrap items-center gap-4">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary shadow-lg shadow-primary/10">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
					</div>
					<div>
						<h2 class="text-xl font-black uppercase tracking-tight text-base-content bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
							Git Control Deck
						</h2>
						<p class="text-[9px] font-mono tracking-widest opacity-50 uppercase">v2.1 // System Active</p>
					</div>
				</div>

				<!-- Watcher Status Indicator -->
				{#if projectPath}
					<div
						class="badge badge-sm gap-1.5 py-3 px-3.5 font-mono font-bold uppercase text-[9px] border border-base-content/10 shadow-sm transition-all duration-500 {watcherStatus === 'live' ? 'bg-success/10 text-success border-success/20' : watcherStatus === 'connecting' ? 'bg-warning/10 text-warning border-warning/20' : 'bg-error/10 text-error border-error/20'}"
						title={watcherStatus === 'live' ? `Real-time monitoring active. Last sync: ${lastSyncTime}` : 'Connecting to project...'}
					>
						<span class="w-1.5 h-1.5 rounded-full {watcherStatus === 'live' ? 'bg-success animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' : watcherStatus === 'connecting' ? 'bg-warning animate-bounce' : 'bg-error'}"></span>
						{watcherStatus}
					</div>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
				{#if projectPath}
					<div class="bg-base-200/50 hover:bg-base-200 px-4 py-2 rounded-xl border border-base-content/10 flex items-center gap-2 font-mono text-[10px] opacity-80 max-w-full md:max-w-xs truncate shadow-inner">
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary shrink-0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
						<span class="truncate">{projectPath}</span>
					</div>
				{/if}

				<button
					type="button"
					class="btn btn-primary btn-sm rounded-xl gap-2 font-black uppercase text-[10px] tracking-wider transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/25 active:scale-95"
					onclick={() => openExplorer(projectPath)}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
					Pick Folder
				</button>
			</div>
		</div>

		{#if errorMessage}
			<div class="col-span-12 alert alert-error py-3 px-4 text-xs rounded-xl flex items-center gap-3 border border-error/20 bg-error/10 text-error-content shadow-lg shadow-error/5" transition:fade>
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4 text-error" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
				<span class="font-bold">{errorMessage}</span>
			</div>
		{/if}

		{#if successMessage}
			<div class="col-span-12 alert alert-success py-3 px-4 text-xs rounded-xl flex items-center gap-3 border border-success/20 bg-success/10 text-success-content shadow-lg shadow-success/5" transition:fade>
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4 text-success" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2l4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
				<span class="font-bold">{successMessage}</span>
			</div>
		{/if}

		<!-- MAIN ROW SPLIT - LEFT (COMMIT / TICKET FORM) & RIGHT (VS CODE WORKSPACE STAGE) -->
		
		<!-- LEFT SIDEBAR: Commit Console Panel (Col Span 5) -->
		<div class="col-span-12 xl:col-span-5 flex flex-col gap-5 bg-base-200/30 p-5 rounded-2xl border border-base-content/5 relative overflow-visible">
			<div class="absolute -top-3 left-4 bg-base-100 px-3 py-1 rounded-md border border-base-content/10 font-mono text-[9px] font-black uppercase tracking-wider text-primary">
				CONSOLE_DECK
			</div>

			<!-- Form Fields -->
			<div class="grid grid-cols-1 gap-4 mt-2">
				<div class="form-control">
					<label class="label py-1" for="duty-title">
						<span class="label-text font-mono font-black uppercase text-[10px] opacity-60 flex items-center gap-1.5 text-primary">
							<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
							Task Heading
						</span>
					</label>
					<input
						id="duty-title"
						type="text"
						bind:value={title}
						placeholder="E.g., Auth: fix signin flow"
						class="input input-bordered w-full font-bold focus:border-primary focus:ring-1 focus:ring-primary transition-all rounded-xl text-xs bg-base-100/50"
						required
					/>
				</div>

				<div class="form-control">
					<label class="label py-1" for="duty-files">
						<span class="label-text font-mono font-black uppercase text-[10px] opacity-60 flex items-center gap-1.5 text-primary">
							<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
							Impacted Files
						</span>
					</label>
					<input
						id="duty-files"
						type="text"
						bind:value={filesInput}
						placeholder="index.ts, app.svelte..."
						class="input input-bordered w-full font-mono text-[10px] focus:border-primary focus:ring-1 focus:ring-primary transition-all rounded-xl bg-base-100/50"
					/>
				</div>
			</div>

			<div class="form-control flex-1 flex flex-col">
				<label class="label py-1" for="duty-notes">
					<span class="label-text font-mono font-black uppercase text-[10px] opacity-60 flex items-center gap-1.5 text-primary">
						<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
						Commit Notes
					</span>
				</label>
				<textarea
					id="duty-notes"
					bind:value={notes}
					placeholder="Detailed logic changes (one bullet point per line)..."
					class="textarea textarea-bordered w-full focus:border-primary focus:ring-1 focus:ring-primary transition-all rounded-xl flex-1 min-h-[140px] font-mono text-[10px] bg-base-100/50 custom-scrollbar"
				></textarea>
			</div>

			<!-- Action Panel & Trigger -->
			<div class="flex flex-col gap-4 mt-2 p-4 bg-base-100/40 rounded-xl border border-base-content/5">
				<div class="form-control flex flex-row items-center justify-between">
					<div class="flex flex-col text-left">
						<span class="text-[10px] font-mono font-black uppercase tracking-tight text-primary">Git Commit Push</span>
						<span class="text-[9px] opacity-50">Auto-commit to git alongside saving task log</span>
					</div>
					<input type="checkbox" class="toggle toggle-primary toggle-sm" bind:checked={includeGitCommit} disabled={!projectPath} />
				</div>

				<button
					type="submit"
					class="btn btn-primary w-full rounded-xl font-black uppercase tracking-wider text-[11px] gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-primary/20 {isCommitting ? 'loading' : ''}"
					disabled={isCommitting}
				>
					{#if !isCommitting}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
					{/if}
					Deploy Logs & Commit
				</button>
			</div>
		</div>

		<!-- RIGHT WORKSPACE: VS Code Stage & Diff Deck (Col Span 7) -->
		<div class="col-span-12 xl:col-span-7 flex flex-col gap-6 relative overflow-visible min-h-[450px]">
			
			{#if suggestions.length > 0 || stagedChanges.length > 0}
				<!-- Grid Layout for Staged & Detected Changes side-by-side inside the workspace area -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 h-full" transition:slide>
					
					<!-- 1. STAGED CHANGES CONTAINER (Neon Green Trim) -->
					<div class="flex flex-col bg-base-200/10 rounded-2xl border border-success/15 shadow-sm p-4 h-full min-h-[300px]">
						<div class="flex justify-between items-center pb-3 border-b border-base-content/5 mb-3">
							<div class="flex items-center gap-1.5">
								<span class="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.8)]"></span>
								<h3 class="text-[10px] font-mono font-black uppercase tracking-wider text-success">Staged Changes</h3>
							</div>
							<div class="flex items-center gap-2">
								{#if stagedChanges.length > 0}
									<button 
										type="button" 
										class="text-[9px] font-mono font-bold uppercase tracking-tight opacity-40 hover:opacity-100 transition-opacity flex items-center gap-1"
										onclick={() => moveAll(false)}
										title="Unstage all files"
									>
										Unstage All
									</button>
									<span class="text-base-content/20 font-mono text-[9px]">|</span>
									<button 
										type="button" 
										class="text-[9px] font-mono font-bold uppercase tracking-tight opacity-40 hover:opacity-100 transition-opacity flex items-center gap-1"
										onclick={() => toggleSelectAll(true)}
									>
										{stagedChanges.every(s => s.selected) ? 'Deselect' : 'Select'}
									</button>
								{/if}
								<span class="badge badge-sm bg-success/15 border-success/10 text-success font-mono font-black px-2">{stagedChanges.length}</span>
							</div>
						</div>

						<!-- Staging Drop & Scroll Area -->
						<div 
							bind:this={stagedZoneEl} 
							class="flex-1 flex flex-col gap-2.5 overflow-y-auto custom-scrollbar p-1 transition-all duration-300 rounded-xl {stagedZoneClass}"
						>
							{#each stagedChanges as s, i (s.id)}
								<div animate:flip={{ duration: 250 }} class="flex flex-col gap-1.5">
									{#if dragState?.file === s.file && dragState?.fromStaged === true && dragHasMoved}
										<div class="h-[52px] rounded-xl border-2 border-dashed border-primary/20 bg-primary/2" in:fade={{ duration: 120 }}></div>
									{:else}
										<div
											role="button"
											tabindex="0"
											class="flex items-center justify-between p-3 rounded-xl border select-none cursor-grab active:cursor-grabbing transition-all text-left
												{s.selected ? 'bg-success/5 border-success/40 shadow-sm' : 'bg-base-100/50 hover:bg-base-200/50 border-base-content/10 shadow-sm'}
												{droppedFile === s.file ? 'ring-1 ring-success ring-offset-1 ring-offset-base-100' : ''}"
											style="touch-action: none;"
											onpointerdown={(e) => onCardPointerDown(e, s.file, true)}
											onclick={() => toggleSelection(i, true)}
											onkeydown={(e) => e.key === 'Enter' && toggleSelection(i, true)}
										>
											<div class="flex items-center gap-2.5 overflow-hidden flex-1">
												<input 
													type="checkbox" 
													checked={s.selected} 
													class="checkbox checkbox-xs checkbox-success shrink-0" 
													onclick={(e) => e.stopPropagation()} 
													onchange={() => toggleSelection(i, true)}
													aria-label="Select file"
												/>
												<div class="flex flex-col min-w-0 overflow-hidden">
													<span class="font-mono text-[10px] font-bold truncate text-base-content/90">{s.file.split(/[/\\]/).pop()}</span>
													<span class="font-mono text-[8px] opacity-40 truncate">{s.file}</span>
												</div>
											</div>

											<div class="flex items-center gap-2.5 ml-2 shrink-0">
												<span class="font-mono text-[8px] font-black leading-none bg-base-100 border border-base-content/5 py-1 px-1.5 rounded">
													<span class="text-success">+{s.stats.additions}</span>
													<span class="text-error">-{s.stats.deletions}</span>
												</span>

												{#if !s.selected}
													{@const ccType = getFileCommitType(s)}
													<span class="badge badge-xs border font-mono font-black text-[7px] tracking-wide rounded px-1 {ccBadgeClass(ccType)}">{ccType}</span>
												{/if}

												<div class="flex items-center gap-1">
													<button
														type="button"
														class="btn btn-xs btn-ghost btn-square text-error hover:bg-error/10 shrink-0"
														onclick={(e) => moveFile(e, s.file, false)}
														title="Unstage file"
													>
														<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
													</button>
													<button 
														type="button" 
														class="btn btn-xs btn-ghost btn-square shrink-0" 
														onclick={(e) => toggleDiff(e, i, true)} 
														title="Toggle Diff"
													>
														<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200 {s.showDiff ? 'rotate-180 text-primary' : ''}"><polyline points="6 9 12 15 18 9"></polyline></svg>
													</button>
												</div>
											</div>
										</div>
									{/if}

									<!-- Inline Code Diff (Directly under the card in the VS Code grid) -->
									{#if s.showDiff && s.diff}
										<div class="cyber-diff-pane bg-black/90 text-white rounded-xl p-3 border border-base-content/10 mt-0.5 shadow-inner" transition:slide>
											{#if editingDiffId === s.id}
												<div class="flex justify-between items-center mb-2 pb-1.5 border-b border-white/5">
													<span class="font-mono text-[8px] text-white/40">INLINE_EDITOR: ACTIVE</span>
													<div class="flex gap-1.5">
														<button type="button" class="btn btn-[8px] h-5 min-h-5 btn-success rounded-md px-2 font-mono" onclick={saveInlineEdit} disabled={loadingEditor || savingEditor}>
															{savingEditor ? 'Saving' : 'Save'}
														</button>
														<button type="button" class="btn btn-[8px] h-5 min-h-5 btn-ghost text-white rounded-md px-2 font-mono" onclick={cancelInlineEdit} disabled={savingEditor}>
															Cancel
														</button>
													</div>
												</div>
												{#if editingError}
													<div class="mb-2 p-1.5 rounded bg-error/15 border border-error/20 text-[8px] text-error">
														{editingError}
													</div>
												{/if}
												{#if loadingEditor}
													<span class="loading loading-spinner loading-xs"></span>
												{:else}
													<div class="max-h-60 overflow-y-auto custom-scrollbar font-mono text-[9px] leading-relaxed">
														{#each editingRows as row, rowIndex (row.key)}
															<div class="{row.kind === 'add' ? 'text-emerald-400 bg-emerald-950/20 border-l border-emerald-500' : row.kind === 'remove' ? 'text-rose-400 bg-rose-950/20 border-l border-rose-500' : 'opacity-60'} px-2">
																{#if row.kind === 'hunk'}
																	<div class="text-sky-400 font-bold opacity-80">{row.content}</div>
																{:else if row.editable}
																	<div class="grid grid-cols-[10px_1fr] gap-1 items-center">
																		<span class="opacity-50">+</span>
																		<input
																			type="text"
																			value={row.content}
																			oninput={(e) => updateEditingRow(rowIndex, (e.currentTarget as HTMLInputElement).value)}
																			class="w-full bg-transparent p-0 border-0 focus:outline-none text-white font-mono text-[9px]"
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
											{:else}
												<button
													type="button"
													class="w-full text-left font-mono text-[9px] max-h-60 overflow-y-auto custom-scrollbar leading-relaxed"
													ondblclick={() => startInlineEdit(s)}
													title={s.type === 'Deleted' ? 'Deleted files cannot be edited inline' : 'Double click to edit'}
												>
													{#each s.diff.split('\n') as line}
														<div class="{line.startsWith('+') ? 'text-emerald-400 bg-emerald-950/10' : line.startsWith('-') ? 'text-rose-400 bg-rose-950/10' : 'opacity-40'} px-2">{line}</div>
													{/each}
												</button>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
							{#if stagedChanges.length === 0}
								<div class="flex-1 flex flex-col items-center justify-center opacity-25 py-12 gap-3 border border-dashed border-success/10 rounded-xl">
									<svg xmlns="http://www.w3.org/2000/svg" class="text-success" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
									<span class="font-mono text-[8px] uppercase tracking-wider">Drag Files here to stage</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- 2. DETECTED CHANGES CONTAINER (Neon Amber Trim) -->
					<div class="flex flex-col bg-base-200/10 rounded-2xl border border-warning/15 shadow-sm p-4 h-full min-h-[300px]">
						<div class="flex justify-between items-center pb-3 border-b border-base-content/5 mb-3">
							<div class="flex items-center gap-1.5">
								<span class="w-2 h-2 rounded-full bg-warning animate-pulse shadow-[0_0_6px_rgba(234,179,8,0.8)]"></span>
								<h3 class="text-[10px] font-mono font-black uppercase tracking-wider text-warning">Detected Changes</h3>
							</div>
							<div class="flex items-center gap-2">
								{#if suggestions.length > 0}
									<button 
										type="button" 
										class="text-[9px] font-mono font-bold uppercase tracking-tight text-error opacity-40 hover:opacity-100 transition-opacity flex items-center gap-1"
										onclick={() => discardChanges()}
										title="Discard all changes"
									>
										Discard All
									</button>
									<span class="text-base-content/20 font-mono text-[9px]">|</span>
									<button 
										type="button" 
										class="text-[9px] font-mono font-bold uppercase tracking-tight opacity-40 hover:opacity-100 transition-opacity flex items-center gap-1"
										onclick={() => moveAll(true)}
										title="Stage all files"
									>
										Stage All
									</button>
									<span class="text-base-content/20 font-mono text-[9px]">|</span>
									<button 
										type="button" 
										class="text-[9px] font-mono font-bold uppercase tracking-tight opacity-40 hover:opacity-100 transition-opacity flex items-center gap-1"
										onclick={() => toggleSelectAll(false)}
									>
										{suggestions.every(s => s.selected) ? 'Deselect' : 'Select'}
									</button>
								{/if}
								<span class="badge badge-sm bg-warning/15 border-warning/10 text-warning font-mono font-black px-2">{suggestions.length}</span>
							</div>
						</div>

						<!-- Detected Drop & Scroll Area -->
						<div 
							bind:this={unstagedZoneEl} 
							class="flex-1 flex flex-col gap-2.5 overflow-y-auto custom-scrollbar p-1 transition-all duration-300 rounded-xl {unstagedZoneClass}"
						>
							{#each suggestions as s, i (s.id)}
								<div animate:flip={{ duration: 250 }} class="flex flex-col gap-1.5">
									{#if dragState?.file === s.file && dragState?.fromStaged === false && dragHasMoved}
										<div class="h-[52px] rounded-xl border-2 border-dashed border-primary/20 bg-primary/2" in:fade={{ duration: 120 }}></div>
									{:else}
										<div
											role="button"
											tabindex="0"
											class="flex items-center justify-between p-3 rounded-xl border select-none cursor-grab active:cursor-grabbing transition-all text-left
												{s.selected ? 'bg-warning/5 border-warning/40 shadow-sm' : 'bg-base-100/50 hover:bg-base-200/50 border-base-content/10 shadow-sm'}
												{droppedFile === s.file ? 'ring-1 ring-success ring-offset-1 ring-offset-base-100' : ''}"
											style="touch-action: none;"
											onpointerdown={(e) => onCardPointerDown(e, s.file, false)}
											onclick={() => toggleSelection(i, false)}
											onkeydown={(e) => e.key === 'Enter' && toggleSelection(i, false)}
										>
											<div class="flex items-center gap-2.5 overflow-hidden flex-1">
												<input 
													type="checkbox" 
													checked={s.selected} 
													class="checkbox checkbox-xs checkbox-warning shrink-0" 
													onclick={(e) => e.stopPropagation()} 
													onchange={() => toggleSelection(i, false)}
													aria-label="Select file"
												/>
												<div class="flex flex-col min-w-0 overflow-hidden">
													<span class="font-mono text-[10px] font-bold truncate text-base-content/90">{s.file.split(/[/\\]/).pop()}</span>
													<span class="font-mono text-[8px] opacity-40 truncate">{s.file}</span>
												</div>
											</div>

											<div class="flex items-center gap-2.5 ml-2 shrink-0">
												<span class="font-mono text-[8px] font-black leading-none bg-base-100 border border-base-content/5 py-1 px-1.5 rounded">
													<span class="text-success">+{s.stats.additions}</span>
													<span class="text-error">-{s.stats.deletions}</span>
												</span>

												{#if !s.selected}
													{@const ccType = getFileCommitType(s)}
													<span class="badge badge-xs border font-mono font-black text-[7px] tracking-wide rounded px-1 {ccBadgeClass(ccType)}">{ccType}</span>
												{/if}

												<div class="flex items-center gap-1">
													<button
														type="button"
														class="btn btn-xs btn-ghost btn-square text-success hover:bg-success/10 shrink-0"
														onclick={(e) => moveFile(e, s.file, true)}
														title="Stage file"
													>
														<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
													</button>
													<button
														type="button"
														class="btn btn-xs btn-ghost btn-square text-error hover:bg-error/10 shrink-0"
														onclick={(e) => { e.stopPropagation(); discardChanges(s.file); }}
														title="Discard changes"
													>
														<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
													</button>
													<button 
														type="button" 
														class="btn btn-xs btn-ghost btn-square shrink-0" 
														onclick={(e) => toggleDiff(e, i, false)} 
														title="Toggle Diff"
													>
														<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200 {s.showDiff ? 'rotate-180 text-primary' : ''}"><polyline points="6 9 12 15 18 9"></polyline></svg>
													</button>
												</div>
											</div>
										</div>
									{/if}

									<!-- Inline Code Diff (Directly under the card in the VS Code grid) -->
									{#if s.showDiff && s.diff}
										<div class="cyber-diff-pane bg-black/90 text-white rounded-xl p-3 border border-base-content/10 mt-0.5 shadow-inner" transition:slide>
											{#if editingDiffId === s.id}
												<div class="flex justify-between items-center mb-2 pb-1.5 border-b border-white/5">
													<span class="font-mono text-[8px] text-white/40">INLINE_EDITOR: ACTIVE</span>
													<div class="flex gap-1.5">
														<button type="button" class="btn btn-[8px] h-5 min-h-5 btn-success rounded-md px-2 font-mono" onclick={saveInlineEdit} disabled={loadingEditor || savingEditor}>
															{savingEditor ? 'Saving' : 'Save'}
														</button>
														<button type="button" class="btn btn-[8px] h-5 min-h-5 btn-ghost text-white rounded-md px-2 font-mono" onclick={cancelInlineEdit} disabled={savingEditor}>
															Cancel
														</button>
													</div>
												</div>
												{#if editingError}
													<div class="mb-2 p-1.5 rounded bg-error/15 border border-error/20 text-[8px] text-error">
														{editingError}
													</div>
												{/if}
												{#if loadingEditor}
													<span class="loading loading-spinner loading-xs"></span>
												{:else}
													<div class="max-h-60 overflow-y-auto custom-scrollbar font-mono text-[9px] leading-relaxed">
														{#each editingRows as row, rowIndex (row.key)}
															<div class="{row.kind === 'add' ? 'text-emerald-400 bg-emerald-950/20 border-l border-emerald-500' : row.kind === 'remove' ? 'text-rose-400 bg-rose-950/20 border-l border-rose-500' : 'opacity-60'} px-2">
																{#if row.kind === 'hunk'}
																	<div class="text-sky-400 font-bold opacity-80">{row.content}</div>
																{:else if row.editable}
																	<div class="grid grid-cols-[10px_1fr] gap-1 items-center">
																		<span class="opacity-50">+</span>
																		<input
																			type="text"
																			value={row.content}
																			oninput={(e) => updateEditingRow(rowIndex, (e.currentTarget as HTMLInputElement).value)}
																			class="w-full bg-transparent p-0 border-0 focus:outline-none text-white font-mono text-[9px]"
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
											{:else}
												<button
													type="button"
													class="w-full text-left font-mono text-[9px] max-h-60 overflow-y-auto custom-scrollbar leading-relaxed"
													ondblclick={() => startInlineEdit(s)}
													title={s.type === 'Deleted' ? 'Deleted files cannot be edited inline' : 'Double click to edit'}
												>
													{#each s.diff.split('\n') as line}
														<div class="{line.startsWith('+') ? 'text-emerald-400 bg-emerald-950/10' : line.startsWith('-') ? 'text-rose-400 bg-rose-950/10' : 'opacity-40'} px-2">{line}</div>
													{/each}
												</button>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
							{#if suggestions.length === 0}
								<div class="flex-1 flex flex-col items-center justify-center opacity-25 py-12 gap-3 border border-dashed border-warning/10 rounded-xl">
									<svg xmlns="http://www.w3.org/2000/svg" class="text-warning" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
									<span class="font-mono text-[8px] uppercase tracking-wider">All changes are staged</span>
								</div>
							{/if}
						</div>
					</div>

				</div>

				<!-- Recent Commit Messages (Bottom overlay inside Workspace) -->
				{#if recentCommits.length > 0}
					<div class="pt-4 border-t border-base-content/5">
						<h4 class="text-[9px] font-mono font-black uppercase tracking-widest opacity-40 mb-3 flex items-center gap-1.5 ml-1">
							<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
							Recent Commits
						</h4>
						<div class="flex flex-wrap gap-2">
							{#each recentCommits as commit}
								<button
									type="button"
									class="p-2 px-3 rounded-xl bg-base-200/55 hover:bg-base-200 hover:border-primary border border-dashed border-base-content/10 transition-all text-left text-[9px] opacity-75 hover:opacity-100 font-mono italic shrink-0"
									onclick={() => useCommitMessage(commit)}
								>
									"{commit}"
								</button>
							{/each}
						</div>
					</div>
				{/if}

			{:else}
				<!-- Empty Workspace Welcome Deck (Extremely Premium Futuristic Welcome Panel) -->
				<div class="flex-1 flex flex-col items-center justify-center p-8 bg-base-200/20 border border-base-content/5 rounded-3xl relative overflow-hidden" transition:fade>
					<div class="absolute inset-0 opacity-[0.02]" style="background-size: 20px 20px; background-image: radial-gradient(circle, currentColor 1px, transparent 1px);"></div>
					<div class="text-center relative z-10 max-w-sm flex flex-col items-center">
						<div class="w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center border border-base-content/10 mb-4 shadow-inner text-primary/70 animate-pulse">
							<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"></path></svg>
						</div>
						<h3 class="font-black uppercase tracking-widest text-xs mb-1 text-base-content/80">WORKSPACE EMPTY</h3>
						<p class="text-[10px] leading-relaxed opacity-50 mb-5">
							No modifications detected in your active `.git` workspace. Open files in your local project to begin tracking your duties.
						</p>
						<div class="flex flex-wrap gap-2 justify-center">
							<div class="badge badge-sm badge-outline font-mono text-[8px] py-2 px-3 border-base-content/10 uppercase">Local Watcher Active</div>
							<div class="badge badge-sm badge-outline font-mono text-[8px] py-2 px-3 border-base-content/10 uppercase">Auto Sync</div>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Explorer UI Overlay (Sleek Blur HUD style) -->
		{#if showExplorer}
			<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md" in:fade>
				<div class="card w-full max-w-xl bg-base-100 shadow-2xl border border-base-content/15 max-h-[75vh] flex flex-col rounded-[2rem] overflow-hidden" in:fly={{ y: 20 }}>
					<div class="p-5 border-b border-base-content/10 bg-base-200/50 flex flex-col gap-3">
						<div class="flex justify-between items-center">
							<h3 class="font-black uppercase tracking-widest text-xs text-primary">Local Path Explorer</h3>
							<button type="button" class="btn btn-xs btn-ghost btn-circle" onclick={() => showExplorer = false}>✕</button>
						</div>
						<div class="flex items-center gap-2">
							<button type="button" class="btn btn-xs btn-ghost border border-base-content/10 h-8 px-2 rounded-lg" onclick={() => openExplorer(explorerParent)} title="Back">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
							</button>
							<div class="bg-base-200 px-3 py-1.5 rounded-lg border border-base-content/5 flex-1 font-mono text-[9px] truncate text-base-content/80 shadow-inner">
								{explorerPath}
							</div>
						</div>
					</div>

					<div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 custom-scrollbar">
						{#each explorerDirs as dir}
							<button
								type="button"
								class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-primary/10 hover:text-primary transition-all text-left group border border-transparent hover:border-primary/10 bg-base-200/20"
								onclick={() => openExplorer(explorerPath + pathSep + dir)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary/40 group-hover:text-primary transition-colors"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
								<span class="text-[10px] font-bold truncate text-base-content/80">{dir}</span>
							</button>
						{/each}
					</div>

					<div class="p-5 border-t border-base-content/10 bg-base-200/50 flex justify-between gap-4">
						<button type="button" class="btn btn-ghost rounded-xl px-6 text-xs uppercase" onclick={() => showExplorer = false}>Cancel</button>
						<button type="button" class="btn btn-primary rounded-xl px-6 font-black text-xs uppercase" onclick={selectFolder}>Select This Folder</button>
					</div>
				</div>
			</div>
		{/if}

	</form>
</div>

<!-- ── High-Tech Drag Ghost ── -->
{#if dragState && dragHasMoved}
	<div
		class="pointer-events-none fixed top-0 left-0 z-[9999] select-none"
		style="transform: translate({dragState.curX - dragState.offsetX}px, {dragState.curY - dragState.offsetY}px) rotate(1.5deg) scale(1.03); will-change: transform; width: {dragState.cardW}px;"
	>
		<div class="bg-black/90 text-white rounded-xl p-3 border-2 border-primary shadow-[0_15px_45px_rgba(0,0,0,0.5)]">
			<div class="flex items-center gap-2 mb-1">
				<span class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse shrink-0"></span>
				<span class="font-mono text-[10px] font-bold truncate text-white/90">{dragState.file.split(/[/\\]/).pop()}</span>
			</div>
			<div class="font-mono text-[8px] text-white/40 truncate mb-1.5">{dragState.file}</div>
			<div class="text-[8px] font-mono font-black uppercase tracking-wider text-primary flex items-center gap-1 leading-none">
				{#if dragState.fromStaged}
					<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
					move to detected
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
					move to staged
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 5px;
		height: 5px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: rgba(var(--bc-rgb, 120, 120, 120), 0.15);
		border-radius: 99px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: rgba(var(--bc-rgb, 120, 120, 120), 0.35);
	}
</style>
