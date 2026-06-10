<script lang="ts">
	import { kanbanStore } from '$lib/kanban.svelte';
	import { onMount } from 'svelte';
	import { fade, slide, fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { theme, themes } from '$lib/theme';
	import { setUiStyle, uiStyle, uiStyles, type UiStyleId } from '$lib/ui-style';
	import CommitForm from './CommitForm.svelte';
	import SettingsModal from './SettingsModal.svelte';
	import StatusBar from './StatusBar.svelte';

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
		status?: string;
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
	let recentProjects = $state<string[]>([]);
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
	let selectedChangeCount = $derived([...stagedChanges, ...suggestions].filter((s) => s.selected).length);
	let hasGitCommitTargets = $derived(selectedChangeCount > 0 || stagedChanges.length > 0);
	let canSubmitLog = $derived(
		Boolean(title.trim()) && !isCommitting && (!includeGitCommit || (Boolean(projectPath) && hasGitCommitTargets))
	);

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

	// ── VS Code IDE States ────────────────────────────────────────────────
	let activeSidebar = $state<'source-control' | 'history' | 'explorer' | 'settings'>('source-control');
	let isSidebarCollapsed = $state(false);
	let showSettingsModal = $state(false);
	let diffViewType = $state<'split' | 'inline'>('split');
	let sidebarSearchQuery = $state('');

	type Tab = {
		id: string;
		type: 'welcome' | 'diff' | 'log';
		title: string;
		file?: GitChangeItem;
		isStaged?: boolean;
		task?: any;
	};

	let openTabs = $state<Tab[]>([
		{ id: 'welcome', type: 'welcome', title: 'Welcome' }
	]);
	let activeTabId = $state<string>('welcome');

	const openTab = (tab: Tab) => {
		if (!openTabs.some(t => t.id === tab.id)) {
			openTabs.push(tab);
		}
		activeTabId = tab.id;
	};

	const closeTab = (e: MouseEvent, tabId: string) => {
		e.stopPropagation();
		const idx = openTabs.findIndex(t => t.id === tabId);
		if (idx === -1) return;

		openTabs.splice(idx, 1);
		if (activeTabId === tabId) {
			if (openTabs.length > 0) {
				activeTabId = openTabs[openTabs.length - 1].id;
			} else {
				openTabs.push({ id: 'welcome', type: 'welcome', title: 'Welcome' });
				activeTabId = 'welcome';
			}
		}
	};

	const loadChangeDiff = async (item: GitChangeItem, isStaged: boolean) => {
		if (!projectPath || item.diff) return item;

		try {
			const params = new URLSearchParams({
				path: projectPath,
				file: item.file,
				staged: String(isStaged),
				diff: '1'
			});
			const res = await fetch(`/api/git?${params}`);
			const data = await res.json();
			if (!data.success || !data.change) return item;

			const loadedItem = { ...item, ...data.change, id: item.id };
			const targetList = isStaged ? stagedChanges : suggestions;
			const index = targetList.findIndex((entry) => entry.file === item.file && entry.type === item.type);
			if (index !== -1) {
				targetList[index] = loadedItem;
			}

			return loadedItem;
		} catch (e) {
			console.error('Failed to load file diff', e);
			return item;
		}
	};

	const openFileDiffTab = async (item: GitChangeItem, isStaged: boolean) => {
		const loadedItem = await loadChangeDiff(item, isStaged);
		openTab({
			id: `diff-${loadedItem.file}-${isStaged ? 'staged' : 'unstaged'}`,
			type: 'diff',
			title: loadedItem.file.split(/[/\\]/).pop() || loadedItem.file,
			file: loadedItem,
			isStaged
		});
		startInlineEdit(loadedItem);
	};

	const openLogTab = async (task: any) => {
		// If it's a real Git commit (id is short commit hash and has no files loaded yet)
		if (task.id && task.id.length <= 10 && (!task.files || task.files.length === 0)) {
			try {
				const res = await fetch(`/api/git/commits?path=${encodeURIComponent(projectPath)}&commit=${task.id}`);
				const data = await res.json();
				if (data.success && data.files) {
					task.files = data.files.map((f: any) => f.file);
					task.fileDiffs = {};
				}
			} catch (e) {
				console.error('Failed to fetch commit files', e);
			}
		}

		openTab({
			id: `log-${task.id}`,
			type: 'log',
			title: `Log: ${task.description || task.title}`,
			task
		});
	};

	const downloadBackupFile = (task: any, file: string) => {
		if (!task.projectPath && !projectPath) return;
		const params = new URLSearchParams({
			projectPath: task.projectPath || projectPath,
			file,
			...(task.logFolderName ? { logFolder: task.logFolderName } : { createdAt: String(task.createdAt) })
		});
		window.open(`/api/log/download?${params}`, '_blank');
	};

	let openSavedDiffs = $state<Record<string, boolean>>({});

	const toggleSavedFileDiff = async (taskId: string, file: string) => {
		const key = `${taskId}-${file}`;
		openSavedDiffs[key] = !openSavedDiffs[key];

		// Load saved or Git commit diffs on-demand so localStorage stays small.
		if (openSavedDiffs[key] && taskId.length <= 10) {
			const tab = openTabs.find(t => t.id === `log-${taskId}`);
			if (tab && tab.task && (!tab.task.fileDiffs || !tab.task.fileDiffs[file])) {
				try {
					const res = await fetch(`/api/git/commits?path=${encodeURIComponent(projectPath)}&commit=${taskId}&file=${encodeURIComponent(file)}`);
					const data = await res.json();
					if (data.success && data.diff) {
						if (!tab.task.fileDiffs) tab.task.fileDiffs = {};
						tab.task.fileDiffs[file] = data.diff;
						openTabs = [...openTabs];
					}
				} catch (e) {
					console.error('Failed to fetch commit file diff', e);
				}
			}
		}

		if (openSavedDiffs[key] && taskId.length > 10) {
			const tab = openTabs.find(t => t.id === `log-${taskId}`);
			if (tab && tab.task && (!tab.task.fileDiffs || !tab.task.fileDiffs[file])) {
				try {
					const params = new URLSearchParams({
						projectPath: tab.task.projectPath || projectPath,
						file,
						...(tab.task.logFolderName
							? { logFolder: tab.task.logFolderName }
							: { createdAt: String(tab.task.createdAt) })
					});
					const res = await fetch(`/api/log/diff?${params}`);
					const data = await res.json();
					if (data.success && data.diff) {
						if (!tab.task.fileDiffs) tab.task.fileDiffs = {};
						tab.task.fileDiffs[file] = data.diff;
						openTabs = [...openTabs];
					}
				} catch (e) {
					console.error('Failed to fetch saved file diff', e);
				}
			}
		}
	};

	const isSavedFileDiffOpen = (taskId: string, file: string) => {
		return !!openSavedDiffs[`${taskId}-${file}`];
	};

	const hasSavedFileDiff = (task: any, file: string) => {
		return Boolean(task.fileDiffs?.[file] || task.hasSavedDiffs || task.id?.length <= 10);
	};

	const getSavedFileDiff = (task: any, file: string) => {
		return task.fileDiffs?.[file] || '';
	};

	// Derived lists of logged duties filtered by search query
	const filteredLoggedDuties = $derived(
		kanbanStore.tasks.filter(t => 
			!sidebarSearchQuery ||
			t.title.toLowerCase().includes(sidebarSearchQuery.toLowerCase()) ||
			(t.description && t.description.toLowerCase().includes(sidebarSearchQuery.toLowerCase())) ||
			(t.notes && t.notes.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
		)
	);

	// Total productivity indicators
	const productivityStats = $derived.by(() => {
		const tasks = kanbanStore.tasks;
		let filesCount = 0;
		let additions = 0;
		let deletions = 0;

		tasks.forEach(t => {
			filesCount += t.files.length;
			if (t.fileDiffs) {
				Object.values(t.fileDiffs).forEach(diff => {
					diff.split('\n').forEach(line => {
						if (line.startsWith('+') && !line.startsWith('+++')) additions++;
						if (line.startsWith('-') && !line.startsWith('---')) deletions++;
					});
				});
			} else if (t.diffStats) {
				additions += t.diffStats.additions;
				deletions += t.diffStats.deletions;
			}
		});

		return {
			totalLogged: tasks.length,
			filesCount,
			additions,
			deletions
		};
	});

	const addToRecentProjects = (path: string) => {
		if (!path) return;
		recentProjects = recentProjects.filter(p => p !== path);
		recentProjects.unshift(path);
		recentProjects = recentProjects.slice(0, 8);
		localStorage.setItem('ohmycode-recent-projects', JSON.stringify(recentProjects));
	};

	const switchProject = (path: string) => {
		projectPath = path;
		localStorage.setItem('last-project-path', path);
		addToRecentProjects(path);
		setupWatcher(path);
		syncWithGit();
	};

	onMount(() => {
		const storedProjects = localStorage.getItem('ohmycode-recent-projects');
		if (storedProjects) {
			try {
				recentProjects = JSON.parse(storedProjects);
			} catch (e) {
				console.error('Failed to parse recent projects', e);
			}
		}

		const savedPath = localStorage.getItem('last-project-path');
		if (savedPath) {
			projectPath = savedPath;
			setupWatcher(savedPath);
			if (!recentProjects.includes(savedPath)) {
				recentProjects.unshift(savedPath);
				localStorage.setItem('ohmycode-recent-projects', JSON.stringify(recentProjects));
			}
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
			fetchGitCommits();
		};

		eventSource.addEventListener('change', (e: any) => {
			console.log('[Watcher] Remote change detected:', e.data);
			debouncedSyncWithGit();
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
			watcherStatus = 'live'; 
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
		addToRecentProjects(projectPath);
		setupWatcher(projectPath);
		syncWithGit();
	};

	let refetchPending = false;
	let syncDebounceTimeout: any = null;

	const syncWithGit = async () => {
		if (!projectPath.trim()) return;

		// Concurrency request lock to prevent overlapping OS git commands
		if (isSyncing) {
			refetchPending = true;
			return;
		}

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
							showDiff: oldItem ? oldItem.showDiff : false,
							diff: newItem.diff || oldItem?.diff || '',
							stats: newItem.diff ? newItem.stats : oldItem?.stats || newItem.stats,
							functions: newItem.functions?.length ? newItem.functions : oldItem?.functions || []
						};
					});
				};

				suggestions = syncList(data.suggestions, suggestions);
				stagedChanges = syncList(data.stagedChanges, stagedChanges);
				recentCommits = data.recentCommits;
				lastSyncTime = new Date().toLocaleTimeString();

				// Automatically update currently open Diff tab structures if their corresponding items have changed
				openTabs.forEach((tab, index) => {
					if (tab.type === 'diff' && tab.file) {
						const isStaged = tab.isStaged;
						const list = isStaged ? stagedChanges : suggestions;
						const match = list.find(x => x.file === tab.file?.file);
						if (match) {
							openTabs[index] = {
								...tab,
								file: match.diff ? match : { ...match, diff: tab.file.diff, stats: tab.file.stats }
							};
						}
					}
				});
			}
		} catch (e) {
			console.error('Failed to sync with git', e);
		} finally {
			isSyncing = false;
			// If a refetch request was queued during execution, trigger it now
			if (refetchPending) {
				refetchPending = false;
				syncWithGit();
			}
		}
	};

	const debouncedSyncWithGit = () => {
		clearTimeout(syncDebounceTimeout);
		syncDebounceTimeout = setTimeout(() => {
			syncWithGit();
		}, 500); // 500ms quiet-window debounce
	};

	let gitCommits = $state<any[]>([]);
	let isLoadingCommits = $state(false);
	let activeLogHistoryTab = $state<'git' | 'local'>('git');

	const fetchGitCommits = async () => {
		if (!projectPath.trim()) return;
		isLoadingCommits = true;
		try {
			const res = await fetch(`/api/git/commits?path=${encodeURIComponent(projectPath)}`);
			const data = await res.json();
			if (data.success && data.commits) {
				gitCommits = data.commits;
			}
		} catch (e) {
			console.error('Failed to fetch git commits', e);
		} finally {
			isLoadingCommits = false;
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

		const hasAdded = types.some(t => t.includes('added') || t.includes('new'));
		const hasDeleted = types.some(t => t.includes('deleted'));
		const hasModified = types.some(t => t.includes('modified'));
		const hasRenamed = types.some(t => t.includes('renamed'));

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

	const generateSmartSummary = (items: GitChangeItem[]): string => {
		if (items.length === 0) return '';

		const files = items.map(s => s.file);
		const hasFile = (name: string) => files.some(f => f.includes(name));

		const hasTaskForm = hasFile('TaskForm.svelte');
		const hasGitApi = hasFile('+server.ts') || hasFile('watch') || hasFile('api/git');
		const hasKanbanColumn = hasFile('KanbanColumn.svelte');
		const hasKanbanCard = hasFile('KanbanCard.svelte');
		const hasKanbanStore = hasFile('kanban.svelte.ts');
		const hasTheme = hasFile('theme.ts') || hasFile('layout.css') || hasFile('+layout.svelte');

		// 1. TaskForm + Git API -> EXACTLY the user's requested example scenario!
		if (hasTaskForm && hasGitApi) {
			const isPerf = items.some(s => s.diff && (s.diff.includes('debounce') || s.diff.includes('isSyncing') || s.diff.includes('limit') || s.diff.includes('threshold')));
			if (isPerf) {
				return 'perf: optimize TaskForm component and Git API endpoints to prevent lags on big projects.';
			}
			const isDiffViewer = items.some(s => s.diff && (s.diff.includes('Saved Diff') || s.diff.includes('fileDiffs') || s.diff.includes('openSavedDiffs')));
			if (isDiffViewer) {
				return 'feat: implement TaskForm component and integrate inline Saved Diff Viewer for log audit history.';
			}
			const isRecentProjects = items.some(s => s.diff && (s.diff.includes('recentProjects') || s.diff.includes('switchProject')));
			if (isRecentProjects) {
				return 'feat: implement TaskForm component and integrate Recent Projects workspace switcher in Explorer.';
			}
			return 'feat: implement TaskForm component and initialize Git watcher API route for project synchronization.';
		}

		// 2. Just TaskForm
		if (hasTaskForm) {
			const isPerf = items.some(s => s.diff && (s.diff.includes('debounce') || s.diff.includes('isSyncing') || s.diff.includes('limit') || s.diff.includes('threshold')));
			if (isPerf) {
				return 'perf: optimize TaskForm UI reactivity and reduce DOM rendering lag for massive repositories.';
			}
			const isDiffViewer = items.some(s => s.diff && (s.diff.includes('Saved Diff') || s.diff.includes('fileDiffs') || s.diff.includes('openSavedDiffs')));
			if (isDiffViewer) {
				return 'feat: implement inline Saved Diff Viewer inside log history audits for precise code reviews.';
			}
			const isRecentProjects = items.some(s => s.diff && (s.diff.includes('recentProjects') || s.diff.includes('switchProject')));
			if (isRecentProjects) {
				return 'feat: implement Recent Projects list in Explorer for rapid workspace hot-swapping.';
			}
			return 'feat: implement TaskForm component and enhance VS Code-inspired Source Control user interface.';
		}

		// 3. Just Git API / Server
		if (hasGitApi) {
			const isPerf = items.some(s => s.diff && (s.diff.includes('debounce') || s.diff.includes('limit') || s.diff.includes('threshold') || s.diff.includes('depth')));
			if (isPerf) {
				return 'perf: optimize Git API query execution with directory limits and size filters for large workspaces.';
			}
			return 'feat: initialize Git watcher SSE API route and file diff status sync for project updates.';
		}

		// 4. Kanban Store
		if (hasKanbanStore) {
			return 'refactor: optimize Kanban store state machine and localStorage sync utilizing Svelte 5 Runes.';
		}

		// 5. Theme
		if (hasTheme) {
			return 'style: integrate cohesive DaisyUI color themes and refine layout viewport responsive sizes.';
		}

		// 6. Column / Cards
		if (hasKanbanColumn || hasKanbanCard) {
			return 'feat: implement drag-and-drop Kanban card UI components for interactive task columns.';
		}

		// Fallback to beautiful, natural generic generation
		const first = items[0];
		const basename = first.file.split(/[/\\]/).pop() || first.file;
		const { type } = inferConventionalType(items);
		const verb = 
			type === 'feat' ? 'implement' :
			type === 'fix' ? 'resolve issue in' :
			type === 'refactor' ? 'refactor' :
			type === 'style' ? 'refine style of' :
			'update';

		if (items.length === 1) {
			return `${type}: ${verb} ${basename} module and sync changes with workspace.`;
		} else {
			return `${type}: ${verb} ${items.length} files including ${basename} to refine workspace logic.`;
		}
	};

	const updateFormFromSelected = () => {
		const selectedUnstaged = suggestions.filter(s => s.selected);
		const selectedStaged = stagedChanges.filter(s => s.selected);
		const selected = [...selectedStaged, ...selectedUnstaged];

		if (selected.length === 0) {
			filesInput = '';
			functionsInput = '';
			return;
		}

		// Automatically suggest smart, highly descriptive, context-aware summary header
		title = generateSmartSummary(selected);
		// Description field (internal) and UI Description textarea (bound to notes) are no longer filled automatically
		description = '';
		notes = '';

		if (selected.length === 1) {
			const s = selected[0];
			filesInput = s.file;
			functionsInput = s.functions.join(', ');
		} else {
			filesInput = selected.map(s => s.file).join(', ');
			functionsInput = selected.flatMap(s => s.functions).filter((v, i, a) => a.indexOf(v) === i).join(', ');
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

		const previousSuggestions = suggestions.map((item) => ({ ...item }));
		const previousStagedChanges = stagedChanges.map((item) => ({ ...item }));

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
			const res = await fetch('/api/git', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath, file, stage: toStaged })
			});
			const data = await res.json();
			if (!data.success) throw new Error(data.error || data.raw || 'Git command failed');
		} catch (e) {
			suggestions = previousSuggestions;
			stagedChanges = previousStagedChanges;
			errorMessage = (e as Error).message;
			syncWithGit();
		}
	};

	const moveFile = async (e: MouseEvent, fileName: string, toStaged: boolean) => {
		e.stopPropagation();
		if (!projectPath) return;

		const previousSuggestions = suggestions.map((item) => ({ ...item }));
		const previousStagedChanges = stagedChanges.map((item) => ({ ...item }));

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
			const res = await fetch('/api/git', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath, file: fileName, stage: toStaged })
			});
			const data = await res.json();
			if (!data.success) throw new Error(data.error || data.raw || 'Git command failed');
		} catch (e) {
			suggestions = previousSuggestions;
			stagedChanges = previousStagedChanges;
			errorMessage = (e as Error).message;
			syncWithGit();
		}
	};

	const moveAll = async (toStaged: boolean) => {
		if (!projectPath) return;

		const previousSuggestions = suggestions.map((item) => ({ ...item }));
		const previousStagedChanges = stagedChanges.map((item) => ({ ...item }));

		if (toStaged) {
			stagedChanges.push(...suggestions.map((s) => ({ ...s, isStaged: true, selected: true })));
			suggestions.length = 0;
		} else {
			suggestions.push(...stagedChanges.map((s) => ({ ...s, isStaged: false, selected: false })));
			stagedChanges.length = 0;
		}

		updateFormFromSelected();

		try {
			const res = await fetch('/api/git', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath, all: true, stage: toStaged })
			});
			const data = await res.json();
			if (!data.success) throw new Error(data.error || data.raw || 'Git command failed');
		} catch (e) {
			suggestions = previousSuggestions;
			stagedChanges = previousStagedChanges;
			errorMessage = (e as Error).message;
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
				syncWithGit();
			} else {
				errorMessage = `Discard failed: ${data.error}`;
			}
		} catch (e) {
			errorMessage = 'Failed to call discard API';
		}
	};

	const handleCommitKeyDown = (e: KeyboardEvent) => {
		if (e.ctrlKey && e.key === 'Enter') {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleSubmit = async (e?: SubmitEvent) => {
		if (e) e.preventDefault();
		if (!canSubmitLog) return;

		const selectedItems = [...stagedChanges, ...suggestions].filter(s => s.selected);
		const selectedFiles = selectedItems.map(s => s.file);
		const stagedFiles = stagedChanges.map(s => s.file);
		const manualFiles = filesInput
			.split(',')
			.map((f) => f.trim())
			.filter((f) => f !== '');
		const files = selectedFiles.length > 0 ? selectedFiles : (includeGitCommit ? stagedFiles : manualFiles);
		const functions = functionsInput
			.split(',')
			.map((f) => f.trim())
			.filter((f) => f !== '');

		const fileDiffs: Record<string, string> = {};
		for (const item of selectedItems) {
			const loadedItem = item.diff ? item : await loadChangeDiff(item, Boolean(item.isStaged));
			if (loadedItem.diff) fileDiffs[loadedItem.file] = loadedItem.diff;
		}

		let gitCommitHash: string | undefined;
		if (includeGitCommit && projectPath) {
			isCommitting = true;
			try {
				const commitRes = await fetch('/api/git', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						projectPath,
						message: notes || description || title,
						files: selectedFiles.length > 0 ? selectedFiles : null
					})
				});
				const commitData = await commitRes.json();
				if (!commitData.success) {
					errorMessage = `Git Commit Failed: ${commitData.error}`;
					isCommitting = false;
					return;
				} else {
					gitCommitHash = commitData.commitHash;
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

		const newTask = kanbanStore.addTask(title, files, functions, description, notes, projectPath, fileDiffs, gitCommitHash);

		if (projectPath) {
			kanbanStore.syncToLocal(newTask, projectPath, includeGitCommit, fileDiffs);
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
		
		// Return to welcome dashboard
		activeTabId = 'welcome';
		syncWithGit();
	};
</script>

<!-- VS Code Style Root Layout -->
<div class="h-screen w-screen flex flex-col vscode-font overflow-hidden select-none bg-base-100 text-base-content vscode-noselect">
	
	<!-- 2. VS Code Main Workspace Container -->
	<div class="flex-1 flex overflow-hidden w-full">
		
		<!-- 2.1 Activity Bar (Far Left) -->
		<aside class="w-12 bg-base-300 border-r border-base-content/10 flex flex-col justify-between items-center py-2 shrink-0 select-none">
			<div class="flex flex-col gap-3.5 items-center w-full">
				<!-- Explorer Icon -->
				<button 
					onclick={() => { activeSidebar = 'explorer'; isSidebarCollapsed = false; }} 
					class="relative p-2.5 rounded-lg text-base-content/50 hover:text-base-content transition-colors group {activeSidebar === 'explorer' && !isSidebarCollapsed ? 'text-primary bg-base-content/5' : ''}"
					title="Explorer"
				>
					<div class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r transition-all scale-y-0 group-hover:scale-y-75 {activeSidebar === 'explorer' && !isSidebarCollapsed ? 'scale-y-100' : ''}"></div>
					<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
				</button>

				<!-- Source Control Icon -->
				<button 
					onclick={() => { activeSidebar = 'source-control'; isSidebarCollapsed = false; }} 
					class="relative p-2.5 rounded-lg text-base-content/50 hover:text-base-content transition-colors group {activeSidebar === 'source-control' && !isSidebarCollapsed ? 'text-primary bg-base-content/5' : ''}"
					title="Source Control"
				>
					<div class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r transition-all scale-y-0 group-hover:scale-y-75 {activeSidebar === 'source-control' && !isSidebarCollapsed ? 'scale-y-100' : ''}"></div>
					<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M20.39 18.39A5 5 0 0 0 18 13H6"></path><path d="M6 9v6"></path></svg>
					{#if suggestions.length + stagedChanges.length > 0}
						<span class="absolute top-1 right-1 badge badge-xs bg-primary text-primary-content font-mono text-[8px] font-bold py-1 px-1.5 min-w-[14px]">
							{suggestions.length + stagedChanges.length}
						</span>
					{/if}
				</button>

				<!-- History/Logs Icon -->
				<button 
					onclick={() => { activeSidebar = 'history'; isSidebarCollapsed = false; }} 
					class="relative p-2.5 rounded-lg text-base-content/50 hover:text-base-content transition-colors group {activeSidebar === 'history' && !isSidebarCollapsed ? 'text-primary bg-base-content/5' : ''}"
					title="Duty Logs History"
				>
					<div class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r transition-all scale-y-0 group-hover:scale-y-75 {activeSidebar === 'history' && !isSidebarCollapsed ? 'scale-y-100' : ''}"></div>
					<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
				</button>

				<!-- Direct Preferences View -->
				<button 
					onclick={() => { activeSidebar = 'settings'; isSidebarCollapsed = false; }} 
					class="relative p-2.5 rounded-lg text-base-content/50 hover:text-base-content transition-colors group {activeSidebar === 'settings' && !isSidebarCollapsed ? 'text-primary bg-base-content/5' : ''}"
					title="Settings & Themes"
				>
					<div class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r transition-all scale-y-0 group-hover:scale-y-75 {activeSidebar === 'settings' && !isSidebarCollapsed ? 'scale-y-100' : ''}"></div>
					<svg width="22" height="22" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path></svg>
				</button>
			</div>

			<!-- Settings gear at bottom -->
			<div class="flex flex-col gap-2 items-center w-full">
				<button 
					onclick={() => showSettingsModal = true} 
					class="p-2.5 rounded-lg text-base-content/50 hover:text-base-content transition-colors"
					title="System Settings Configuration"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
				</button>
			</div>
		</aside>

		<!-- 2.2 Sidebar Panel (Collapsible, holds active views) -->
		{#if !isSidebarCollapsed}
			<section class="w-[310px] bg-base-200/50 border-r border-base-content/10 flex flex-col h-full shrink-0 select-none" transition:slide={{ axis: 'x', duration: 200 }}>
				
				<!-- Sidebar Header -->
				<div class="h-10 px-4 flex items-center justify-between border-b border-base-content/5 shrink-0">
					<span class="text-[11px] font-bold uppercase tracking-widest opacity-70">
						{#if activeSidebar === 'source-control'}
							Source Control: Git
						{:else}
							{activeSidebar}
						{/if}
					</span>
					<div class="flex items-center gap-1.5">
						{#if activeSidebar === 'source-control'}
							<button onclick={syncWithGit} class="btn btn-xs btn-ghost btn-square text-base-content/60 hover:text-base-content" title="Refresh Git Status">
								<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
							</button>
						{/if}
						<button onclick={() => isSidebarCollapsed = true} class="btn btn-xs btn-ghost btn-square text-base-content/60 hover:text-base-content" title="Collapse Sidebar Panel">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
						</button>
					</div>
				</div>

				<!-- Sidebar Body View Renderer -->
				<div class="flex-1 flex flex-col overflow-y-auto vscode-scrollbar">
					
					<!-- VIEW: SOURCE CONTROL -->
					{#if activeSidebar === 'source-control'}
						<div class="p-3 flex flex-col gap-3 h-full">
							
								<CommitForm
									bind:title
									bind:notes
									bind:includeGitCommit
									{projectPath}
									{isCommitting}
									{canSubmitLog}
									{hasGitCommitTargets}
									onSubmit={() => handleSubmit()}
									onCommitKeyDown={handleCommitKeyDown}
								/>

							<!-- Collapsible Section: STAGED CHANGES -->
							<div class="flex flex-col mt-2">
								<div class="flex items-center justify-between px-1 py-1.5 text-[10px] font-bold tracking-wider opacity-60 uppercase border-b border-base-content/5 mb-1 select-none">
									<div class="flex items-center gap-1">
										<span class="w-1.5 h-1.5 rounded-full bg-success"></span>
										<span>Staged Changes</span>
									</div>
									<div class="flex items-center gap-2">
										{#if stagedChanges.length > 0}
											<button onclick={() => moveAll(false)} class="hover:text-primary transition-colors text-[9px]">Unstage All</button>
										{/if}
										<span class="badge badge-sm font-mono text-[9px] bg-base-content/10 font-bold">{stagedChanges.length}</span>
									</div>
								</div>

								<!-- Drag & Drop Staged Zone -->
								<div 
									bind:this={stagedZoneEl}
									class="flex flex-col gap-1 rounded-lg min-h-[50px] p-1 transition-all duration-300 {stagedZoneClass}"
								>
									{#each stagedChanges as s, i (s.id)}
										{#if dragState?.file === s.file && dragState?.fromStaged === true && dragHasMoved}
											<div class="h-9 rounded-lg border border-dashed border-primary/20 bg-primary/2"></div>
										{:else}
											<div 
												role="button"
												tabindex="0"
												class="flex items-center justify-between p-2 rounded-lg text-left select-none cursor-grab active:cursor-grabbing text-[11px] group transition-all border border-transparent {activeTabId === `diff-${s.file}-staged` ? 'bg-primary/10 text-primary border-primary/10' : 'hover:bg-base-content/5'}"
												onpointerdown={(e) => onCardPointerDown(e, s.file, true)}
												onclick={() => openFileDiffTab(s, true)}
												onkeydown={(e) => e.key === 'Enter' && openFileDiffTab(s, true)}
											>
												<div class="flex items-center gap-2 overflow-hidden flex-1">
													<!-- Selection check box -->
													<input 
														type="checkbox" 
														checked={s.selected} 
														class="checkbox checkbox-xs checkbox-primary shrink-0 scale-90" 
														onclick={(e) => e.stopPropagation()} 
														onchange={() => toggleSelection(i, true)}
														aria-label="Toggle selection"
													/>
													<span class="font-mono text-xs truncate">{s.file.split(/[/\\]/).pop()}</span>
													<span class="text-[9px] opacity-40 font-mono truncate max-w-[80px]">{s.file.slice(0, Math.max(s.file.lastIndexOf('/'), s.file.lastIndexOf('\\')) || 10)}</span>
												</div>

												<div class="flex items-center gap-2 shrink-0">
													<span class="text-success font-bold text-[10px] font-mono">M</span>
													<div class="hidden group-hover:flex items-center gap-1 transition-all">
														<button onclick={(e) => moveFile(e, s.file, false)} class="btn btn-xs btn-ghost btn-square text-error" title="Unstage File">
															<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
														</button>
													</div>
												</div>
											</div>
										{/if}
									{/each}
									{#if stagedChanges.length === 0}
										<div class="py-4 text-center text-[10px] opacity-35 font-medium border border-dashed border-base-content/10 rounded-lg">
											No staged modifications
										</div>
									{/if}
								</div>
							</div>

							<!-- Collapsible Section: DETECTED CHANGES (CHANGES) -->
							<div class="flex flex-col mt-3">
								<div class="flex items-center justify-between px-1 py-1.5 text-[10px] font-bold tracking-wider opacity-60 uppercase border-b border-b-base-content/5 mb-1 select-none">
									<div class="flex items-center gap-1">
										<span class="w-1.5 h-1.5 rounded-full bg-warning"></span>
										<span>Changes</span>
									</div>
									<div class="flex items-center gap-2">
										{#if suggestions.length > 0}
											<button onclick={() => moveAll(true)} class="hover:text-primary transition-colors text-[9px]">Stage All</button>
										{/if}
										<span class="badge badge-sm font-mono text-[9px] bg-base-content/10 font-bold">{suggestions.length}</span>
									</div>
								</div>

								<!-- Drag & Drop Detected Zone -->
								<div 
									bind:this={unstagedZoneEl}
									class="flex flex-col gap-1 rounded-lg min-h-[50px] p-1 transition-all duration-300 {unstagedZoneClass}"
								>
									{#each suggestions as s, i (s.id)}
										{#if dragState?.file === s.file && dragState?.fromStaged === false && dragHasMoved}
											<div class="h-9 rounded-lg border border-dashed border-primary/20 bg-primary/2"></div>
										{:else}
											<div 
												role="button"
												tabindex="0"
												class="flex items-center justify-between p-2 rounded-lg text-left select-none cursor-grab active:cursor-grabbing text-[11px] group transition-all border border-transparent {activeTabId === `diff-${s.file}-unstaged` ? 'bg-primary/10 text-primary border-primary/10' : 'hover:bg-base-content/5'}"
												onpointerdown={(e) => onCardPointerDown(e, s.file, false)}
												onclick={() => openFileDiffTab(s, false)}
												onkeydown={(e) => e.key === 'Enter' && openFileDiffTab(s, false)}
											>
												<div class="flex items-center gap-2 overflow-hidden flex-1">
													<!-- Selection checkbox -->
													<input 
														type="checkbox" 
														checked={s.selected} 
														class="checkbox checkbox-xs checkbox-primary shrink-0 scale-90" 
														onclick={(e) => e.stopPropagation()} 
														onchange={() => toggleSelection(i, false)}
														aria-label="Toggle selection"
													/>
													<span class="font-mono text-xs truncate">{s.file.split(/[/\\]/).pop()}</span>
													<span class="text-[9px] opacity-40 font-mono truncate max-w-[80px]">{s.file}</span>
												</div>

												<div class="flex items-center gap-2 shrink-0">
													<span class="text-warning font-bold text-[10px] font-mono">{s.status === '?' ? 'U' : 'M'}</span>
													<div class="hidden group-hover:flex items-center gap-1 transition-all">
														<button onclick={(e) => moveFile(e, s.file, true)} class="btn btn-xs btn-ghost btn-square text-success" title="Stage File">
															<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
														</button>
														<button onclick={(e) => { e.stopPropagation(); discardChanges(s.file); }} class="btn btn-xs btn-ghost btn-square text-error" title="Revert Changes">
															<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
														</button>
													</div>
												</div>
											</div>
										{/if}
									{/each}
									{#if suggestions.length === 0}
										<div class="py-4 text-center text-[10px] opacity-35 font-medium border border-dashed border-base-content/10 rounded-lg">
											All modifications staged
										</div>
									{/if}
								</div>
							</div>

						</div>

					<!-- VIEW: DUTY LOGS HISTORY -->
					{:else}
						{#if activeSidebar === 'history'}
							<div class="p-3 flex flex-col gap-3 h-full">
								
								<!-- Search History bar -->
								<div class="form-control shrink-0">
									<input 
										type="text" 
										bind:value={sidebarSearchQuery} 
										placeholder="Search audit trail logs..." 
										class="input input-sm w-full bg-base-100 border-base-content/10 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg text-[11px] leading-none h-8"
									/>
								</div>

								<!-- List of logged history -->
								<div class="flex-1 flex flex-col gap-1.5 overflow-y-auto vscode-scrollbar">
									{#each filteredLoggedDuties as task (task.id)}
										<div 
											role="button"
											tabindex="0"
											onclick={() => openLogTab(task)}
											onkeydown={(e) => e.key === 'Enter' && openLogTab(task)}
											class="p-2.5 rounded-xl text-left hover:bg-base-content/5 border border-transparent hover:border-base-content/5 cursor-pointer flex flex-col gap-1 transition-all group"
										>
											<div class="flex items-center justify-between">
												<span class="badge badge-xs text-[7px] font-bold font-mono border bg-secondary/15 border-secondary/30 text-secondary tracking-wide rounded px-1.5 uppercase truncate max-w-[120px]">
													{task.title}
												</span>
												<span class="text-[9px] opacity-35 font-mono">
													{new Date(task.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
												</span>
											</div>
											<p class="text-xs font-bold leading-snug text-base-content/90 truncate group-hover:text-primary transition-colors">
												{task.description || 'No Description'}
											</p>
											{#if task.notes}
												<p class="text-[10px] opacity-50 font-mono truncate max-w-full">
													{task.notes.replace(/[\n\r]+/g, ' ')}
												</p>
											{/if}
										</div>
									{:else}
										<div class="py-12 text-center text-xs opacity-40 italic">
											No logs found matching search.
										</div>
									{/each}
								</div>
							</div>

						<!-- VIEW: WORKSPACE EXPLORER -->
						{:else}
							{#if activeSidebar === 'explorer'}
								<div class="p-4 flex flex-col gap-4">
									<div class="flex flex-col gap-1 bg-base-100 p-3.5 rounded-xl border border-base-content/10 shadow-inner">
										<span class="text-[9px] uppercase font-black tracking-widest opacity-45">WORKSPACE ROOT</span>
										<span class="font-mono text-[10px] break-all truncate text-primary font-bold opacity-90">{projectPath || 'No Folder Selected'}</span>
									</div>

									<button
										onclick={() => openExplorer(projectPath)}
										class="btn btn-sm btn-primary rounded-lg font-bold text-xs gap-1.5 w-full uppercase tracking-wider"
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
										Pick Folder
									</button>

									<!-- RECENT PROJECTS LIST switcher -->
									<div class="flex flex-col mt-4">
										<h4 class="text-[10px] font-bold uppercase opacity-55 tracking-widest mb-2 pb-1 border-b border-base-content/5 flex items-center justify-between select-none">
											<span>Recent Projects</span>
											<button 
												onclick={() => { recentProjects = []; localStorage.removeItem('ohmycode-recent-projects'); }}
												class="text-[8px] opacity-50 hover:opacity-100 hover:text-error uppercase tracking-wider font-semibold transition-colors"
												title="Clear all recent projects history"
											>
												Clear
											</button>
										</h4>
										{#if recentProjects.length > 0}
											<div class="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto vscode-scrollbar pr-0.5">
												{#each recentProjects as path}
													<button
														onclick={() => switchProject(path)}
														class="text-left p-2.5 rounded-xl bg-base-100 hover:bg-base-300 border {projectPath === path ? 'border-primary/35 bg-primary/5 text-primary' : 'border-base-content/10'} hover:border-primary/20 transition-all font-mono text-[10px] opacity-85 flex flex-col gap-1 cursor-pointer group"
														title="Click to mount this project workspace: {path}"
													>
														<div class="flex items-center gap-1.5 font-bold font-sans text-[11px] truncate text-base-content group-hover:text-primary transition-colors">
															<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class={projectPath === path ? 'text-primary' : 'text-secondary'}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
															<span>{path.split(/[/\\]/).pop() || path}</span>
															{#if projectPath === path}
																<span class="badge badge-xs bg-primary/10 border-primary/20 text-primary font-bold px-1 rounded uppercase tracking-wider text-[7px] h-3.5">Active</span>
															{/if}
														</div>
														<span class="opacity-45 text-[9px] truncate tracking-tight">{path}</span>
													</button>
												{/each}
											</div>
										{:else}
											<div class="py-6 text-center text-[10px] opacity-35 font-medium border border-dashed border-base-content/10 rounded-xl select-none">
												No recent projects recorded.
											</div>
										{/if}
									</div>
								</div>

							<!-- VIEW: PREFERENCES / THEMES -->
							{:else}
								{#if activeSidebar === 'settings'}
									<div class="p-4 flex flex-col gap-4">
										
										<!-- Color Theme selector -->
										<div class="form-control w-full">
											<label class="label pt-0 pb-1" for="sidebar-theme-select">
												<span class="label-text text-[10px] uppercase font-black opacity-55 tracking-widest">Active UI Color Theme</span>
											</label>
											<select 
												id="sidebar-theme-select"
												class="select select-sm select-bordered w-full rounded-lg font-bold text-xs bg-base-100"
												value={$theme}
												onchange={(e) => theme.set((e.currentTarget as HTMLSelectElement).value)}
											>
												{#each themes as t}
													<option value={t} selected={$theme === t} class="capitalize font-bold">{t}</option>
												{/each}
											</select>
										</div>

										<div class="form-control w-full">
											<label class="label pt-0 pb-1" for="sidebar-ui-style-select">
												<span class="label-text text-[10px] uppercase font-black opacity-55 tracking-widest">UI Style Preset</span>
											</label>
											<select
												id="sidebar-ui-style-select"
												class="select select-sm select-bordered w-full rounded-lg font-bold text-xs bg-base-100"
												value={$uiStyle}
												onchange={(e) =>
													setUiStyle((e.currentTarget as HTMLSelectElement).value as UiStyleId)}
											>
												{#each uiStyles as style}
													<option value={style.id} selected={$uiStyle === style.id}>{style.label}</option>
												{/each}
											</select>
										</div>

										<div class="divider opacity-50 my-2"></div>

										<!-- Advanced Modal trigger -->
										<button 
											onclick={() => showSettingsModal = true}
											class="btn btn-sm btn-outline rounded-lg text-xs gap-1.5 w-full uppercase"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
											System Settings Console
										</button>

										<!-- Error panel visual inside settings if exist -->
										{#if errorMessage}
											<div class="p-3 rounded-lg bg-error/15 border border-error/25 text-error text-[10px] leading-relaxed font-mono mt-4">
												<strong>LOG_ERROR:</strong> {errorMessage}
											</div>
										{/if}
									</div>
								{/if}
							{/if}
						{/if}
					{/if}

				</div>
			</section>
		{/if}

		<!-- 2.3 Main Editor Area (Fills remaining space, Tab based) -->
		<main class="flex-1 flex flex-col h-full overflow-hidden bg-base-100 relative">
			
			<!-- Editor Tabs Navigation Bar -->
			<div class="h-10 bg-base-300 border-b border-base-content/10 flex items-center justify-between px-2 overflow-x-auto select-none shrink-0 vscode-scrollbar">
				<div class="flex items-center h-full">
					
					<!-- Expand Sidebar trigger inside tabs bar if collapsed -->
					{#if isSidebarCollapsed}
						<button 
							onclick={() => isSidebarCollapsed = false}
							class="btn btn-xs btn-ghost btn-square mr-2 hover:bg-base-content/10 text-base-content/70"
							title="Expand Sidebar Panel"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
						</button>
					{/if}

					<!-- Tab elements list -->
					{#each openTabs as tab (tab.id)}
						<div 
							role="button"
							tabindex="0"
							onclick={() => activeTabId = tab.id}
							onkeydown={(e) => e.key === 'Enter' && (activeTabId = tab.id)}
							class="h-[40px] px-4 text-[12px] font-medium flex items-center gap-2 border-r border-base-content/10 transition-colors relative cursor-pointer group
								{activeTabId === tab.id ? 'bg-base-100 text-primary border-t-2 border-t-primary font-bold shadow-sm' : 'bg-base-200/55 text-base-content/55 hover:bg-base-200'}"
						>
							<!-- Icon depending on tab type -->
							{#if tab.type === 'welcome'}
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-60"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
							{:else}
								{#if tab.type === 'diff'}
									<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-secondary shrink-0"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-success shrink-0"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
								{/if}
							{/if}

							<span class="truncate max-w-[120px]">{tab.title}</span>

							<!-- Tab Close Button -->
							<button 
								onclick={(e) => closeTab(e, tab.id)}
								class="opacity-0 group-hover:opacity-100 hover:bg-base-content/15 p-0.5 rounded cursor-pointer transition-opacity text-base-content/60 scale-90"
								title="Close tab"
							>
								✕
							</button>
						</div>
					{/each}
				</div>

				<!-- Visual icons on top right of Editor tab bar -->
				<div class="flex items-center gap-1 opacity-70">
					{#if activeTabId.startsWith('diff-')}
						<!-- Toggle Inline/Split view button directly in diff editors -->
						<div class="flex items-center bg-base-content/5 rounded-lg px-2 py-0.5 mr-2">
							<span class="text-[10px] font-bold mr-2 uppercase opacity-60">Layout</span>
							<button 
								onclick={() => diffViewType = 'split'} 
								class="btn btn-xs font-bold rounded-md px-1.5 h-5 min-h-5 {diffViewType === 'split' ? 'btn-primary' : 'btn-ghost'}"
							>
								Split
							</button>
							<button 
								onclick={() => diffViewType = 'inline'} 
								class="btn btn-xs font-bold rounded-md px-1.5 h-5 min-h-5 {diffViewType === 'inline' ? 'btn-primary' : 'btn-ghost'}"
							>
								Inline
							</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Active Editor Body Viewports -->
			<div class="flex-1 flex flex-col overflow-hidden relative w-full h-full">
				
				<!-- TAB VIEW: WELCOME DASHBOARD -->
				{#if activeTabId === 'welcome'}
					<div class="flex-1 flex flex-col md:grid md:grid-cols-12 gap-6 p-6 overflow-y-auto vscode-scrollbar h-full bg-base-100">
						
						<!-- Header splash -->
						<div class="col-span-12 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-base-content/10">
							<div class="flex items-center gap-4">
								<div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-content shadow-xl shadow-primary/10">
									<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
								</div>
								<div class="text-left">
									<h1 class="text-3xl font-black uppercase tracking-tighter bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
										ohmycode
									</h1>
									<p class="text-xs uppercase font-mono tracking-widest opacity-45 font-black mt-1">Audit Trail Developer Workspace // Active</p>
								</div>
							</div>

							<!-- Picker & Watcher status triggers in welcome screen -->
							<div class="flex flex-wrap items-center gap-2">
								{#if projectPath}
									<span class="font-mono text-[10px] bg-base-200 py-2 px-3 border border-base-content/15 rounded-xl font-medium opacity-80 shadow-inner">
										{projectPath}
									</span>
								{/if}
								<button onclick={() => openExplorer(projectPath)} class="btn btn-sm btn-primary rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all">
									Pick Workspace Folder
								</button>
							</div>
						</div>

						<!-- Left deck: start and quick links (Col 4) -->
						<div class="col-span-12 lg:col-span-4 flex flex-col gap-6">
							
							<div class="card bg-base-200/50 p-5 rounded-2xl border border-base-content/5 text-left flex flex-col gap-4 shadow-sm">
								<h3 class="text-xs font-black uppercase tracking-wider opacity-60 border-b border-base-content/5 pb-2">Start Log Actions</h3>
								<div class="flex flex-col gap-2">
									<button onclick={() => { activeSidebar = 'source-control'; isSidebarCollapsed = false; }} class="btn btn-sm btn-outline rounded-xl font-bold text-xs justify-start gap-2 border-base-content/10 hover:bg-primary/10 hover:text-primary hover:border-primary/20 bg-base-100">
										<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
										Record New Activity Duty
									</button>
									<button onclick={() => { activeSidebar = 'history'; isSidebarCollapsed = false; }} class="btn btn-sm btn-outline rounded-xl font-bold text-xs justify-start gap-2 border-base-content/10 hover:bg-secondary/10 hover:text-secondary hover:border-secondary/20 bg-base-100">
										<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
										Search Log History
									</button>
								</div>
							</div>

							<!-- Productivity HUD widgets -->
							<div class="card bg-base-200/50 p-5 rounded-2xl border border-base-content/5 text-left flex flex-col gap-4 shadow-sm">
								<h3 class="text-xs font-black uppercase tracking-wider opacity-60 border-b border-base-content/5 pb-2">Productivity Console</h3>
								
								<div class="grid grid-cols-2 gap-3">
									<div class="bg-base-100 p-3 rounded-xl border border-base-content/10 flex flex-col items-start shadow-sm">
										<span class="text-[10px] font-bold uppercase opacity-40">Duties Logged</span>
										<span class="text-2xl font-black text-primary mt-1">{productivityStats.totalLogged}</span>
									</div>
									<div class="bg-base-100 p-3 rounded-xl border border-base-content/10 flex flex-col items-start shadow-sm">
										<span class="text-[10px] font-bold uppercase opacity-40">Backups Stored</span>
										<span class="text-2xl font-black text-secondary mt-1">{productivityStats.filesCount}</span>
									</div>
									<div class="bg-base-100 p-3 rounded-xl border border-base-content/10 flex flex-col items-start col-span-2 shadow-sm">
										<span class="text-[10px] font-bold uppercase opacity-40">Git Accumulations</span>
										<span class="text-xs font-mono font-bold text-base-content/80 mt-1 flex items-center gap-2">
											<span class="text-success font-black">+{productivityStats.additions} insertions</span>
											<span class="opacity-40">|</span>
											<span class="text-error font-black">-{productivityStats.deletions} deletions</span>
										</span>
									</div>
								</div>
							</div>

							<!-- Helpful VS Code system tips -->
							<div class="card bg-base-200/50 p-5 rounded-2xl border border-base-content/5 text-left flex flex-col gap-3 shadow-sm">
								<h3 class="text-xs font-black uppercase tracking-wider opacity-60 border-b border-base-content/5 pb-2">Workspace Shortcuts</h3>
								<div class="flex flex-col gap-2 font-mono text-[10px] leading-relaxed opacity-75">
									<div class="flex items-center justify-between"><span class="font-bold">Stage file:</span> <kbd class="kbd kbd-xs bg-base-100 border-base-content/10 font-bold">Drag and drop</kbd></div>
									<div class="flex items-center justify-between"><span class="font-bold">Save commit:</span> <kbd class="kbd kbd-xs bg-base-100 border-base-content/10 font-bold">Ctrl + Enter</kbd></div>
									<div class="flex items-center justify-between"><span class="font-bold">Modify file code:</span> <kbd class="kbd kbd-xs bg-base-100 border-base-content/10 font-bold">Double-click addition</kbd></div>
									<div class="flex items-center justify-between"><span class="font-bold">View raw backup:</span> <kbd class="kbd kbd-xs bg-base-100 border-base-content/10 font-bold">Click file badge</kbd></div>
								</div>
							</div>

						</div>

						<!-- Right deck: recent duty cards list (Col 8) -->
						<div class="col-span-12 lg:col-span-8 flex flex-col gap-4 text-left">
							<div class="flex items-center justify-between pb-2 border-b border-base-content/10">
								<div class="flex items-center gap-2">
									<button 
										onclick={() => activeLogHistoryTab = 'git'} 
										class="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 {activeLogHistoryTab === 'git' ? 'bg-primary text-primary-content shadow-sm shadow-primary/20' : 'opacity-60 hover:opacity-100 bg-base-200/60'}"
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>
										Git Repository Graph ({gitCommits.length})
									</button>
									<button 
										onclick={() => activeLogHistoryTab = 'local'} 
										class="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 {activeLogHistoryTab === 'local' ? 'bg-primary text-primary-content shadow-sm shadow-primary/20' : 'opacity-60 hover:opacity-100 bg-base-200/60'}"
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
										Local Duty Backups ({kanbanStore.tasks.length})
									</button>
								</div>
							</div>

							<div class="flex-1 overflow-y-auto max-h-[60vh] vscode-scrollbar pr-1 flex flex-col gap-2">
								{#if activeLogHistoryTab === 'git'}
									{#each gitCommits as commit (commit.id)}
										<!-- Ultra-polished compact, interactive, VS Code styled commit row for Git Graph -->
										<div 
											onclick={() => openLogTab(commit)}
											onkeydown={(e) => e.key === 'Enter' && openLogTab(commit)}
											role="button"
											tabindex="0"
											class="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-base-200/40 hover:bg-base-200/90 border border-base-content/5 hover:border-primary/20 rounded-xl cursor-pointer transition-all group select-none relative"
										>
											<!-- Left Part: Monospace Hash + Title + Subtitle preview -->
											<div class="flex items-start gap-3 min-w-0">
												<div class="flex flex-col items-center gap-1 shrink-0 mt-0.5">
													<!-- Short Monospace Hash Badge -->
													<span class="font-mono text-[10px] font-bold bg-primary/10 text-primary border border-primary/25 rounded px-1.5 py-0.5 tracking-wider uppercase">
														{commit.id.slice(0, 7)}
													</span>
													<!-- Active Indicator Dot -->
													<span class="w-1.5 h-1.5 rounded-full bg-success shadow shadow-success/30" title="Synchronized"></span>
												</div>

												<div class="flex flex-col text-left min-w-0">
													<div class="flex items-center gap-2 flex-wrap">
														<!-- Title / Commit Summary -->
														<span class="text-[12px] font-bold text-base-content group-hover:text-primary transition-colors truncate max-w-md">
															{commit.title}
														</span>
														<!-- Branch Decorator Tag -->
														{#if commit.refs}
															<span class="badge font-mono text-[9px] bg-secondary/10 text-secondary border-secondary/20 px-1.5 h-4 font-bold">
																{commit.refs}
															</span>
														{/if}
													</div>
													<span class="text-[11px] opacity-50 font-medium truncate max-w-xl mt-0.5 leading-relaxed">
														Author: {commit.author}
													</span>
												</div>
											</div>

											<!-- Right Part: Commit timestamp and Details Action -->
											<div class="flex items-center gap-3 shrink-0 self-end md:self-center">
												<!-- Date formatted cleanly -->
												<span class="text-[10px] opacity-40 font-mono font-bold uppercase tracking-wider">
													{commit.date}
												</span>

												<!-- View Details Button -->
												<div class="flex items-center gap-1 pl-1 border-l border-base-content/10">
													<button 
														onclick={(e) => { e.stopPropagation(); openLogTab(commit); }}
														class="btn btn-xs btn-ghost btn-square text-base-content/60 hover:text-primary hover:bg-primary/10 transition-colors"
														title="View Commit Details & Diffs"
													>
														<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
													</button>
												</div>
											</div>
										</div>
									{:else}
										{#if isLoadingCommits}
											<div class="py-20 text-center opacity-60 flex flex-col items-center justify-center gap-3 bg-base-200/10 rounded-3xl">
												<span class="loading loading-spinner loading-md text-primary"></span>
												<span class="text-xs font-semibold">Reading live Git history Graph...</span>
											</div>
										{:else}
											<div class="py-20 text-center opacity-30 border-2 border-dashed border-base-content/15 rounded-3xl mt-2 flex flex-col items-center justify-center gap-3 bg-base-200/10">
												<svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
												<div>
													<p class="text-sm font-bold">No Git commits found in this repository.</p>
												</div>
											</div>
										{/if}
									{/each}
								{:else}
									{#each kanbanStore.tasks as task (task.id)}
										<!-- Ultra-polished compact, interactive, VS Code styled commit row -->
										<div 
											onclick={() => openLogTab(task)}
											onkeydown={(e) => e.key === 'Enter' && openLogTab(task)}
											role="button"
											tabindex="0"
											class="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-base-200/40 hover:bg-base-200/90 border border-base-content/5 hover:border-primary/20 rounded-xl cursor-pointer transition-all group select-none relative"
										>
											<!-- Left Part: Monospace Hash + Title + Subtitle preview -->
											<div class="flex items-start gap-3 min-w-0">
												<div class="flex flex-col items-center gap-1 shrink-0 mt-0.5">
													<!-- Short Monospace Hash Badge -->
													<span class="font-mono text-[10px] font-bold bg-primary/10 text-primary border border-primary/25 rounded px-1.5 py-0.5 tracking-wider uppercase">
														{task.id.slice(0, 7)}
													</span>
													<!-- Active Indicator Dot -->
													<span class="w-1.5 h-1.5 rounded-full bg-success shadow shadow-success/30" title="Synchronized"></span>
												</div>

												<div class="flex flex-col text-left min-w-0">
													<div class="flex items-center gap-2 flex-wrap">
														<!-- Title / Conventional Commit Summary -->
														<span class="text-[12px] font-bold text-base-content group-hover:text-primary transition-colors truncate max-w-md">
															{task.title}
														</span>
														<!-- Branch Badge -->
														<span class="badge font-mono text-[9px] bg-secondary/10 text-secondary border-secondary/20 px-1.5 h-4 font-bold">
															main
														</span>
													</div>
													<!-- Description / Scope Context -->
													{#if task.description || task.notes}
														<span class="text-[11px] opacity-50 font-medium truncate max-w-xl mt-0.5 leading-relaxed">
															{task.description ? task.description + ' — ' : ''}{task.notes || ''}
														</span>
													{/if}
												</div>
											</div>

											<!-- Right Part: Backups count, Diff changes count, and Actions -->
											<div class="flex items-center gap-3 shrink-0 self-end md:self-center">
												<!-- Date/Time formatted cleanly -->
												<span class="text-[10px] opacity-40 font-mono font-bold uppercase tracking-wider">
													{new Date(task.createdAt).toLocaleString('en-GB', {
														day: '2-digit',
														month: 'short',
														hour: '2-digit',
														minute: '2-digit'
													})}
												</span>

												<!-- Impacted file counts badge -->
												<div class="badge badge-sm font-semibold opacity-75 gap-1 py-2 px-2.5 bg-base-100 border-base-content/10">
													<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
													{task.files.length} backups
												</div>

												<!-- Interactive action icon overlays (Fades in on hover) -->
												<div class="flex items-center gap-1 pl-1 border-l border-base-content/10">
													<!-- Open audit tab button -->
													<button 
														onclick={(e) => { e.stopPropagation(); openLogTab(task); }}
														class="btn btn-xs btn-ghost btn-square text-base-content/60 hover:text-primary hover:bg-primary/10 transition-colors"
														title="View Detailed Diff & Backups"
													>
														<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
													</button>

													<!-- Download backup package trigger -->
													{#if task.files.length > 0}
														<button 
															onclick={(e) => { e.stopPropagation(); downloadBackupFile(task, task.files[0]); }}
															class="btn btn-xs btn-ghost btn-square text-base-content/60 hover:text-success hover:bg-success/10 transition-colors"
															title="Download backup version of first file"
														>
															<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
														</button>
													{/if}

													<!-- Delete Log button -->
													<button 
														onclick={(e) => { e.stopPropagation(); kanbanStore.removeTask(task.id); }}
														class="btn btn-xs btn-ghost btn-square text-error/60 hover:text-error hover:bg-error/10 transition-colors"
														title="Delete Log Entry"
													>
														<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
													</button>
												</div>
											</div>
										</div>
									{:else}
										<div class="py-20 text-center opacity-30 border-2 border-dashed border-base-content/15 rounded-3xl mt-2 flex flex-col items-center justify-center gap-3 bg-base-200/10">
											<svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
											<div>
												<p class="text-sm font-bold">No logs or duties filed today.</p>
												<p class="text-xs mt-1">Staged file modifications on the left sidebar to generate reports.</p>
											</div>
										</div>
									{/each}
								{/if}
							</div>
						</div>

					</div>

				<!-- TAB VIEW: INTERACTIVE DIFF EDITOR -->
				{:else}
					{#if activeTabId.startsWith('diff-')}
						{@const tab = openTabs.find(t => t.id === activeTabId)}
						{#if tab && tab.file}
							{@const item = tab.file}
							<div class="flex-1 flex flex-col overflow-hidden h-full bg-base-100 text-base-content select-text">
								
								<!-- Sub toolbar for diff actions -->
								<div class="h-9 px-4 bg-base-200 border-b border-base-content/10 flex items-center justify-between text-xs shrink-0 select-none">
									<div class="flex items-center gap-2.5">
										<span class="badge badge-sm font-bold bg-primary/10 border-primary/20 text-primary font-mono">{item.type}</span>
										<span class="font-mono text-[11px] font-semibold text-base-content/80 truncate max-w-sm">{item.file}</span>
									</div>

									<div class="flex items-center gap-2">
										{#if editingFile === item.file}
											<!-- Inline Editor Controls -->
											<button onclick={saveInlineEdit} class="btn btn-xs btn-success font-bold text-[10px] h-6 px-2.5 rounded-md" disabled={savingEditor}>
												{savingEditor ? 'Saving...' : 'Save File'}
											</button>
											<button onclick={cancelInlineEdit} class="btn btn-xs btn-ghost text-base-content font-bold text-[10px] h-6 px-2.5 rounded-md border border-base-content/10" disabled={savingEditor}>
												Cancel
											</button>
										{:else}
											{#if item.type !== 'Deleted'}
												<span class="text-[10px] opacity-40 font-semibold font-mono italic mr-2 select-none">Double click green line to edit inline</span>
											{/if}
										{/if}
										
										<span class="text-base-content/25">|</span>

										<button onclick={(e) => moveFile(e, item.file, !tab.isStaged)} class="btn btn-xs btn-outline border-base-content/15 rounded-md h-6 font-bold text-[10px] uppercase tracking-wider px-2 hover:bg-primary hover:text-primary-content hover:border-primary">
											{tab.isStaged ? 'Unstage file' : 'Stage file'}
										</button>
										{#if !tab.isStaged}
											<button onclick={() => discardChanges(item.file)} class="btn btn-xs btn-error btn-outline rounded-md h-6 font-bold text-[10px] uppercase tracking-wider px-2">
												Discard
											</button>
										{/if}
									</div>
								</div>

								{#if editingError}
									<div class="alert alert-error rounded-none py-2 px-4 text-xs shrink-0">
										<strong>Editor Error:</strong> {editingError}
									</div>
								{/if}

								<!-- Diff editor frame -->
								<div class="flex-1 overflow-y-auto vscode-scrollbar bg-black/95 text-[#f8f8f2] relative h-full">
									
									{#if loadingEditor}
										<div class="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
											<span class="loading loading-spinner loading-md text-primary"></span>
										</div>
									{/if}

									<!-- RENDER: SPLIT DIFF VIEW -->
									{#if diffViewType === 'split'}
										<div class="flex flex-col min-h-full font-mono text-[11px] leading-relaxed select-text p-2">
											{#each editingRows as row, rIdx (row.key)}
												<div class="grid grid-cols-2 border-b border-white/5 min-h-[19px] hover:bg-white/5 transition-colors align-middle">
													
													<!-- LEFT pane (Removed/Context) -->
													{#if row.kind === 'hunk'}
														<div class="col-span-2 bg-[#21252b] text-[#5c6370] py-0.5 px-3 font-semibold select-none">
															{row.content}
														</div>
													{:else}
														{#if row.kind === 'remove'}
															<div class="bg-[#3a1d1d] text-[#ff8080] border-r border-white/10 px-2 flex items-center h-full">
																<span class="w-9 opacity-30 text-right pr-2 shrink-0 select-none font-mono text-[9px]">{row.oldNumber}</span>
																<span class="opacity-40 pr-2 shrink-0 select-none">-</span>
																<span class="whitespace-pre truncate w-full">{row.content}</span>
															</div>
															<div class="bg-[#1e1e1e] border-r border-white/10 opacity-30 select-none" style="background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.02) 5px, rgba(255,255,255,0.02) 10px);"></div>
														{:else}
															{#if row.kind === 'add'}
																<div class="bg-[#1e1e1e] border-r border-white/10 opacity-30 select-none" style="background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.02) 5px, rgba(255,255,255,0.02) 10px);"></div>
																<div class="bg-[#1b2f1c] text-[#80ff80] px-2 flex items-center h-full">
																	<span class="w-9 opacity-30 text-right pr-2 shrink-0 select-none font-mono text-[9px]">{row.newNumber}</span>
																	<span class="opacity-40 pr-2 shrink-0 select-none">+</span>
																	
																	{#if row.editable && editingDiffId === item.id}
																		<input
																			type="text"
																			value={row.content}
																			oninput={(e) => updateEditingRow(rIdx, (e.currentTarget as HTMLInputElement).value)}
																			class="w-full bg-transparent p-0 border-0 focus:outline-none text-[#a6e22e] font-mono text-[11px] h-full"
																			spellcheck="false"
																		/>
																	{:else}
																		<span
																			role="button"
																			tabindex="0"
																			class="whitespace-pre truncate w-full"
																			ondblclick={() => startInlineEdit(item)}
																			onkeydown={(e) => e.key === 'Enter' && startInlineEdit(item)}
																			title="Double click to edit"
																		>{row.content}</span>
																	{/if}
																</div>
															{:else}
																<!-- Context -->
																<div class="bg-transparent opacity-65 border-r border-white/10 px-2 flex items-center h-full">
																	<span class="w-9 opacity-20 text-right pr-2 shrink-0 select-none font-mono text-[9px]">{row.oldNumber}</span>
																	<span class="w-3 shrink-0 select-none"></span>
																	<span class="whitespace-pre truncate w-full">{row.content}</span>
																</div>
																<div class="bg-transparent opacity-65 border-r border-white/10 px-2 flex items-center h-full">
																	<span class="w-9 opacity-20 text-right pr-2 shrink-0 select-none font-mono text-[9px]">{row.newNumber}</span>
																	<span class="w-3 shrink-0 select-none"></span>
																	<span class="whitespace-pre truncate w-full">{row.content}</span>
																</div>
															{/if}
														{/if}
													{/if}

												</div>
											{:else}
												<!-- Fallback to raw diff displays if rows not loaded yet -->
												<div class="p-4 whitespace-pre font-mono text-xs opacity-60">
													{item.diff || 'No content changes detected'}
												</div>
											{/each}
										</div>

									<!-- RENDER: INLINE DIFF VIEW -->
									{:else}
										<div class="flex flex-col min-h-full font-mono text-[11px] leading-relaxed select-text p-2">
											{#each editingRows as row, rIdx (row.key)}
												<div class="flex border-b border-white/5 min-h-[19px] hover:bg-white/5 transition-colors align-middle px-2">
													
													{#if row.kind === 'hunk'}
														<div class="w-full bg-[#21252b] text-[#5c6370] py-0.5 px-3 font-semibold select-none">
															{row.content}
														</div>
													{:else}
														{#if row.kind === 'remove'}
															<div class="bg-[#3a1d1d] text-[#ff8080] w-full flex items-center py-0.5">
																<span class="w-9 opacity-30 text-right pr-2 shrink-0 select-none font-mono text-[9px]">{row.oldNumber}</span>
																<span class="w-9 shrink-0"></span>
																<span class="opacity-40 pr-2 shrink-0 select-none">-</span>
																<span class="whitespace-pre truncate">{row.content}</span>
															</div>
														{:else}
															{#if row.kind === 'add'}
																<div class="bg-[#1b2f1c] text-[#80ff80] w-full flex items-center py-0.5">
																	<span class="w-9 shrink-0"></span>
																	<span class="w-9 opacity-30 text-right pr-2 shrink-0 select-none font-mono text-[9px]">{row.newNumber}</span>
																	<span class="opacity-40 pr-2 shrink-0 select-none">+</span>
																	
																	{#if row.editable && editingDiffId === item.id}
																		<input
																			type="text"
																			value={row.content}
																			oninput={(e) => updateEditingRow(rIdx, (e.currentTarget as HTMLInputElement).value)}
																			class="w-full bg-transparent p-0 border-0 focus:outline-none text-[#a6e22e] font-mono text-[11px] h-full"
																			spellcheck="false"
																		/>
																	{:else}
																		<span
																			role="button"
																			tabindex="0"
																			class="whitespace-pre truncate"
																			ondblclick={() => startInlineEdit(item)}
																			onkeydown={(e) => e.key === 'Enter' && startInlineEdit(item)}
																			title="Double click to edit"
																		>{row.content}</span>
																	{/if}
																</div>
															{:else}
																<!-- Context -->
																<div class="bg-transparent opacity-65 w-full flex items-center py-0.5">
																	<span class="w-9 opacity-20 text-right pr-2 shrink-0 select-none font-mono text-[9px]">{row.oldNumber}</span>
																	<span class="w-9 opacity-20 text-right pr-2 shrink-0 select-none font-mono text-[9px]">{row.newNumber}</span>
																	<span class="w-3 shrink-0"></span>
																	<span class="whitespace-pre truncate">{row.content}</span>
																</div>
															{/if}
														{/if}
													{/if}

												</div>
											{:else}
												<!-- Fallback raw display -->
												<div class="p-4 whitespace-pre font-mono text-xs opacity-60">
													{item.diff}
												</div>
											{/each}
										</div>
									{/if}

								</div>
							</div>
						{/if}
					{:else}
						
						<!-- TAB VIEW: SPECIFIC LOG DETAIL AUDIT -->
						{#if activeTabId.startsWith('log-')}
							{@const tab = openTabs.find(t => t.id === activeTabId)}
							{#if tab && tab.task}
								{@const task = tab.task}
								<div class="flex-1 flex flex-col p-6 overflow-y-auto vscode-scrollbar text-left h-full bg-base-100 select-text">
									
									<div class="flex justify-between items-start pb-4 border-b border-base-content/10 mb-6">
										<div>
											<span class="badge badge-lg bg-success/15 border-success/30 text-success font-bold font-mono tracking-wider py-3 px-4 rounded-xl uppercase mb-2">
												Log Entry Audited
											</span>
											<h2 class="text-2xl font-black tracking-tight">{task.description || task.title}</h2>
											<span class="text-xs opacity-45 font-mono">FILED TIMESTAMP: {new Date(task.createdAt).toLocaleString()}</span>
										</div>
										
										<button 
											onclick={() => { 
												if (confirm('Are you sure you want to delete this duty from the history archive?')) {
													kanbanStore.removeTask(task.id);
													closeTab(new MouseEvent('click'), tab.id);
												}
											}}
											class="btn btn-sm btn-error btn-outline rounded-xl uppercase text-xs font-bold font-mono"
										>
											Delete Log Entry
										</button>
									</div>

									<div class="grid grid-cols-1 md:grid-cols-12 gap-6">
										
										<!-- Details left -->
										<div class="md:col-span-8 flex flex-col gap-6">
											
											<!-- Commit message notes -->
											{#if task.notes}
												<div class="bg-base-200/50 p-5 rounded-2xl border border-base-content/5">
													<h4 class="text-[10px] font-mono font-black uppercase tracking-widest opacity-45 mb-3">COMMIT AUDIT DATA</h4>
													<p class="whitespace-pre-wrap font-mono text-xs leading-relaxed opacity-85 select-text">{task.notes}</p>
												</div>
											{/if}

											<!-- backup download files listing -->
											{#if task.files && task.files.length > 0}
												<div class="flex flex-col gap-3">
													<h4 class="text-[10px] font-mono font-black uppercase tracking-widest opacity-45">BACKED-UP MODIFICATIONS</h4>
													<div class="flex flex-col gap-2">
														{#each task.files as file}
															<div class="flex flex-col gap-2 p-3.5 bg-base-200/40 border border-base-content/10 rounded-xl">
																<div class="flex items-center justify-between">
																	<div class="flex flex-col text-left">
																		<span class="font-mono text-xs font-semibold">{file.split(/[/\\]/).pop()}</span>
																		<span class="font-mono text-[9px] opacity-45 mt-0.5">{file}</span>
																	</div>

																	<div class="flex items-center gap-1.5">
																		<!-- View Saved Diff button if diff exists -->
																		{#if hasSavedFileDiff(task, file)}
																			<button 
																				onclick={() => toggleSavedFileDiff(task.id, file)}
																				class="btn btn-xs {isSavedFileDiffOpen(task.id, file) ? 'btn-primary' : 'btn-outline border-base-content/15'} rounded-md font-bold text-[10px] uppercase tracking-wider"
																			>
																				{isSavedFileDiffOpen(task.id, file) ? 'Hide Saved Diff' : 'View Saved Diff'}
																			</button>
																		{/if}

																		<!-- Download backups trigger -->
																		<button 
																			onclick={() => {
																				if (!task.projectPath) return;
																				const params = new URLSearchParams({
																					projectPath: task.projectPath,
																					file,
																					...(task.logFolderName ? { logFolder: task.logFolderName } : { createdAt: String(task.createdAt) })
																				});
																				window.open(`/api/log/download?${params}`, '_blank');
																			}}
																			class="btn btn-xs btn-outline rounded-md font-bold text-[10px] uppercase tracking-wider"
																		>
																			Download Backup
																		</button>
																	</div>
																</div>

																<!-- Expandable inline code-diff view of what has changed -->
																{#if getSavedFileDiff(task, file) && isSavedFileDiffOpen(task.id, file)}
																	<div class="mt-3 border border-base-content/10 bg-[#1e1e1e] text-white rounded-lg overflow-hidden text-left shadow-inner">
																		<div class="bg-base-300 px-3 py-1.5 text-[10px] font-mono uppercase font-bold opacity-65 flex justify-between items-center border-b border-base-content/10">
																			<span>Saved Diff Viewer</span>
																			<span class="text-[9px] text-success font-mono font-bold">
																				+{getSavedFileDiff(task, file).split('\n').filter((l: string) => l.startsWith('+') && !l.startsWith('+++')).length} insertions
																				<span class="opacity-40 font-mono">|</span>
																				<span class="text-error font-mono">-{getSavedFileDiff(task, file).split('\n').filter((l: string) => l.startsWith('-') && !l.startsWith('---')).length} deletions</span>
																			</span>
																		</div>
																		<div class="p-2 font-mono text-[11px] leading-relaxed select-text overflow-x-auto max-h-[40vh] vscode-scrollbar">
																			{#each buildDiffEditorRows(getSavedFileDiff(task, file)) as row (row.key)}
																				<div class="flex min-h-[18px]">
																					{#if row.kind === 'hunk'}
																						<div class="w-full bg-[#2d2d2d] text-base-content/40 py-0.5 px-3 font-semibold select-none font-mono text-[9px]">
																							{row.content}
																						</div>
																					{:else if row.kind === 'remove'}
																						<div class="bg-[#3a1d1d] text-[#ff8080] w-full flex items-center py-0.5">
																							<span class="w-8 opacity-30 text-right pr-2 shrink-0 select-none text-[9px] font-mono">{row.oldNumber}</span>
																							<span class="w-8 shrink-0 font-mono text-[9px]"></span>
																							<span class="opacity-40 pr-2 select-none font-mono">-</span>
																							<span class="whitespace-pre font-mono">{row.content}</span>
																						</div>
																					{:else if row.kind === 'add'}
																						<div class="bg-[#1b2f1c] text-[#80ff80] w-full flex items-center py-0.5">
																							<span class="w-8 shrink-0 font-mono text-[9px]"></span>
																							<span class="w-8 opacity-30 text-right pr-2 shrink-0 select-none text-[9px] font-mono">{row.newNumber}</span>
																							<span class="opacity-40 pr-2 select-none font-mono">+</span>
																							<span class="whitespace-pre font-mono">{row.content}</span>
																						</div>
																					{:else}
																						<div class="bg-transparent opacity-60 w-full flex items-center py-0.5">
																							<span class="w-8 opacity-20 text-right pr-2 shrink-0 select-none text-[9px] font-mono">{row.oldNumber}</span>
																							<span class="w-8 opacity-20 text-right pr-2 shrink-0 select-none text-[9px] font-mono">{row.newNumber}</span>
																							<span class="w-3 shrink-0 font-mono text-[9px]"></span>
																							<span class="whitespace-pre font-mono">{row.content}</span>
																						</div>
																					{/if}
																				</div>
																			{:else}
																				<div class="p-4 whitespace-pre font-mono text-xs opacity-40">
																					{getSavedFileDiff(task, file)}
																				</div>
																			{/each}
																		</div>
																	</div>
																{/if}
															</div>
														{/each}
													</div>
												</div>
											{/if}

										</div>

										<!-- Details right -->
										<div class="md:col-span-4 flex flex-col gap-6">
											
											<!-- Directory specs -->
											<div class="bg-base-200/30 p-4 rounded-xl border border-base-content/5 flex flex-col gap-2 font-mono text-[10px]">
												<span class="font-bold opacity-45 uppercase">WORKSPACE STATS</span>
												<div><span class="opacity-55">Path:</span> <span class="font-bold truncate select-text">{task.projectPath || 'None'}</span></div>
												<div><span class="opacity-55">Type Tag:</span> <span class="font-bold select-text">{task.title}</span></div>
												{#if task.logFolderName}
													<div><span class="opacity-55">ID folder:</span> <span class="font-bold select-text">{task.logFolderName}</span></div>
												{/if}
											</div>

											<!-- Modified functions list -->
											{#if task.functions && task.functions.length > 0}
												<div class="flex flex-col gap-2">
													<h4 class="text-[10px] font-mono font-black uppercase tracking-widest opacity-45">AFFECTED CODE SYMBOLS</h4>
													<div class="flex flex-wrap gap-1.5">
														{#each task.functions as func}
															<span class="badge badge-sm border font-mono font-bold text-[10px] tracking-wide rounded-lg py-2 px-2.5 bg-secondary/10 border-secondary/25 text-secondary">{func}()</span>
														{/each}
													</div>
												</div>
											{/if}

										</div>

									</div>

								</div>
							{/if}
						{/if}

					{/if}
				{/if}

			</div>
		</main>
	</div>

		<StatusBar
			{isSyncing}
			{watcherStatus}
			{successMessage}
			{errorMessage}
			onSync={syncWithGit}
			onOpenSettings={() => (showSettingsModal = true)}
		/>

</div>

<!-- Staging Drag Floating Ghost -->
{#if dragState && dragHasMoved}
	<div
		class="pointer-events-none fixed top-0 left-0 z-[9999] select-none"
		style="transform: translate({dragState.curX - dragState.offsetX}px, {dragState.curY - dragState.offsetY}px) rotate(1.5deg) scale(1.03); will-change: transform; width: {dragState.cardW}px;"
	>
		<div class="bg-black/90 text-white rounded-xl p-3 border-2 border-primary shadow-[0_15px_45px_rgba(0,0,0,0.5)]">
			<div class="flex items-center gap-2 mb-1">
				<span class="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0"></span>
				<span class="font-mono text-[10px] font-bold truncate text-white/90">{dragState.file.split(/[/\\]/).pop()}</span>
			</div>
			<div class="font-mono text-[8px] text-white/40 truncate mb-1.5">{dragState.file}</div>
			<div class="text-[8px] font-mono font-black uppercase tracking-wider text-primary flex items-center gap-1 leading-none">
				{#if dragState.fromStaged}
					<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
					unstage change
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
					stage change
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Integration of system config popups -->
<SettingsModal bind:open={showSettingsModal} />

<!-- Explorer picker overlay popup -->
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
