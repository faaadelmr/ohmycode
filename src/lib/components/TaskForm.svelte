<!-- eslint-disable svelte/no-at-html-tags -->
<script lang="ts">
	import { kanbanStore, type DutyTask } from '$lib/kanban.svelte';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { theme, themes } from '$lib/theme';
	import CommitForm from './CommitForm.svelte';
	import SettingsModal from './SettingsModal.svelte';
	import StatusBar from './StatusBar.svelte';
	import { SvelteSet } from 'svelte/reactivity';

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
	let isCommitting = $state(false);

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
		editable?: boolean;
	};

	let suggestions = $state<GitChangeItem[]>([]);
	let stagedChanges = $state<GitChangeItem[]>([]);
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

	let cloneSourcePath = $state('');
	let cloneTargetPath = $state('');
	let isCloning = $state(false);
	let cloneProgress = $state(0);

	// Real-time Watcher State
	let eventSource: EventSource | null = null;
	let watcherStatus = $state<'connecting' | 'live' | 'offline'>('offline');
	let fallbackInterval: ReturnType<typeof setInterval> | null = null;

	let currentBranch = $state('main');
	let isPushing = $state(false);
	let isPulling = $state(false);

	// ── Pointer-based drag state ───────────────────────────────────────
	type DragState = {
		file: string;
		fromStaged: boolean;
		startX: number;
		startY: number;
		curX: number;
		curY: number;
		offsetX: number;
		offsetY: number;
		cardW: number;
		cardH: number;
	};
	let dragState = $state<DragState | null>(null);
	let dropTarget = $state<'staged' | 'unstaged' | null>(null);
	let droppedFile = $state<string | null>(null);

	let stagedZoneEl = $state<HTMLElement | undefined>(undefined);
	let unstagedZoneEl = $state<HTMLElement | undefined>(undefined);

	let dragHasMoved = $derived(
		dragState !== null &&
			(Math.abs(dragState.curX - dragState.startX) > 4 ||
				Math.abs(dragState.curY - dragState.startY) > 4)
	);
	let selectedChangeCount = $derived(
		[...stagedChanges, ...suggestions].filter((s) => s.selected).length
	);
	let hasGitCommitTargets = $derived(selectedChangeCount > 0 || stagedChanges.length > 0);
	let canSubmitLog = $derived(
		Boolean(title.trim()) &&
			!isCommitting &&
			(!includeGitCommit || (Boolean(projectPath) && hasGitCommitTargets))
	);

	let stagedZoneClass = $derived(
		!dragState
			? 'border-dashed border-base-300 bg-base-100/50'
			: dragState.fromStaged
				? 'border-dashed border-base-300 bg-base-100/20 opacity-40'
				: dropTarget === 'staged'
					? 'border-success bg-success/10 shadow-[0_0_40px_rgba(0,200,100,0.18)] scale-[1.02]'
					: 'border-dashed border-success/40 bg-success/5'
	);
	let unstagedZoneClass = $derived(
		!dragState
			? 'border-dashed border-base-300 bg-base-100/50'
			: !dragState.fromStaged
				? 'border-dashed border-base-300 bg-base-100/20 opacity-40'
				: dropTarget === 'unstaged'
					? 'border-warning bg-warning/10 shadow-[0_0_40px_rgba(255,170,0,0.18)] scale-[1.02]'
					: 'border-dashed border-warning/40 bg-warning/5'
	);

	// ── VS Code IDE States ────────────────────────────────────────────────
	let activeSidebar = $state<'source-control' | 'history' | 'explorer' | 'settings' | 'compare'>(
		'source-control'
	);
	let isSidebarCollapsed = $state(false);
	let showSettingsModal = $state(false);
	let diffViewType = $state<'split' | 'inline'>('split');
	let sidebarSearchQuery = $state('');

	type ManualComparison = {
		id: string;
		title: string;
		beforeCode: string;
		afterCode: string;
		viewMode: 'edit' | 'diff';
		layout: 'split' | 'inline';
	};

	let manualComparisons = $state<ManualComparison[]>([]);

	type Tab = {
		id: string;
		type: 'welcome' | 'diff' | 'log' | 'manual-compare';
		title: string;
		file?: GitChangeItem;
		isStaged?: boolean;
		task?: DutyTask;
		comparisonId?: string;
	};

	let openTabs = $state<Tab[]>([{ id: 'welcome', type: 'welcome', title: 'Welcome' }]);
	let activeTabId = $state<string>('welcome');

	const openTab = (tab: Tab) => {
		if (!openTabs.some((t) => t.id === tab.id)) {
			openTabs.push(tab);
		}
		activeTabId = tab.id;
	};

	const closeTab = (e: MouseEvent, tabId: string) => {
		e.stopPropagation();
		const idx = openTabs.findIndex((t) => t.id === tabId);
		if (idx === -1) return;

		openTabs.splice(idx, 1);
		if (activeTabId === tabId) {
			activeTabId = openTabs[openTabs.length - 1]?.id || 'welcome';
		}
	};

	const diffManualLines = (oldStr: string, newStr: string) => {
		const oldLines = oldStr.split('\n');
		const newLines = newStr.split('\n');
		const matrix: number[][] = Array(oldLines.length + 1)
			.fill(null)
			.map(() => Array(newLines.length + 1).fill(0));

		for (let i = 1; i <= oldLines.length; i++) {
			for (let j = 1; j <= newLines.length; j++) {
				if (oldLines[i - 1] === newLines[j - 1]) {
					matrix[i][j] = matrix[i - 1][j - 1] + 1;
				} else {
					matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
				}
			}
		}

		const rows: DiffEditorRow[] = [];
		let i = oldLines.length;
		let j = newLines.length;

		while (i > 0 || j > 0) {
			if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
				rows.unshift({
					kind: 'context',
					oldNumber: i,
					newNumber: j,
					content: oldLines[i - 1],
					key: `ctx-${i}-${j}`
				});
				i--;
				j--;
			} else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
				rows.unshift({
					kind: 'add',
					oldNumber: null,
					newNumber: j,
					content: newLines[j - 1],
					key: `add-${j}`
				});
				j--;
			} else {
				rows.unshift({
					kind: 'remove',
					oldNumber: i,
					newNumber: null,
					content: oldLines[i - 1],
					key: `rem-${i}`
				});
				i--;
			}
		}
		return rows;
	};

	const renderLineContent = (content: string) => {
		if (!content) return '&nbsp;';
		return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	};

	let isSyncingScroll = false;
	const handleScroll = (e: Event, partnerId: string) => {
		if (isSyncingScroll) return;
		isSyncingScroll = true;
		const el = e.currentTarget as HTMLElement;
		const partner = document.getElementById(partnerId);
		if (partner) {
			partner.scrollTop = el.scrollTop;
			partner.scrollLeft = el.scrollLeft;
		}
		window.requestAnimationFrame(() => {
			isSyncingScroll = false;
		});
	};

	const createManualComparison = () => {
		const id = `compare-${Date.now()}`;
		const index = manualComparisons.length + 1;
		const newItem: ManualComparison = {
			id,
			title: `Comparison ${index}`,
			beforeCode: '',
			afterCode: '',
			viewMode: 'edit',
			layout: 'split'
		};
		manualComparisons.push(newItem);
		openTab({
			id: `manual-compare-${id}`,
			type: 'manual-compare',
			title: newItem.title,
			comparisonId: id
		});
	};

	const deleteManualComparison = (e: MouseEvent, id: string) => {
		e.stopPropagation();
		manualComparisons = manualComparisons.filter((c) => c.id !== id);
		closeTab(e, `manual-compare-${id}`);
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
			const index = targetList.findIndex(
				(entry) => entry.file === item.file && entry.type === item.type
			);
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

	const openLogTab = async (task: DutyTask) => {
		// If it's a real Git commit (id is short commit hash and has no files loaded yet)
		if (task.id && task.id.length <= 10 && (!task.files || task.files.length === 0)) {
			try {
				const res = await fetch(
					`/api/git/commits?path=${encodeURIComponent(projectPath)}&commit=${task.id}`
				);
				const data = await res.json();
				if (data.success && data.files) {
					task.files = data.files.map((f: { file: string }) => f.file);
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

	const downloadBackupFile = (task: DutyTask, file: string) => {
		if (!task.projectPath && !projectPath) return;
		const params = new URLSearchParams({
			projectPath: task.projectPath || projectPath,
			file,
			...(task.logFolderName
				? { logFolder: task.logFolderName }
				: { createdAt: String(task.createdAt) })
		});
		window.open(`/api/log/download?${params}`, '_blank');
	};

	let openSavedDiffs = $state<Record<string, boolean>>({});

	const toggleSavedFileDiff = async (taskId: string, file: string) => {
		const key = `${taskId}-${file}`;
		openSavedDiffs[key] = !openSavedDiffs[key];

		// Load saved or Git commit diffs on-demand so localStorage stays small.
		if (openSavedDiffs[key] && taskId.length <= 10) {
			const tab = openTabs.find((t) => t.id === `log-${taskId}`);
			if (tab && tab.task && (!tab.task.fileDiffs || !tab.task.fileDiffs[file])) {
				try {
					const res = await fetch(
						`/api/git/commits?path=${encodeURIComponent(projectPath)}&commit=${taskId}&file=${encodeURIComponent(file)}`
					);
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
			const tab = openTabs.find((t) => t.id === `log-${taskId}`);
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

	const hasSavedFileDiff = (task: DutyTask, file: string) => {
		return Boolean(task.fileDiffs?.[file] || task.hasSavedDiffs || task.id?.length <= 10);
	};

	const getSavedFileDiff = (task: DutyTask, file: string) => {
		return task.fileDiffs?.[file] || '';
	};

	// Derived lists of logged duties filtered by search query
	const filteredLoggedDuties = $derived(
		kanbanStore.tasks.filter(
			(t) =>
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

		tasks.forEach((t) => {
			filesCount += t.files.length;
			if (t.fileDiffs) {
				Object.values(t.fileDiffs).forEach((diff) => {
					diff.split('\n').forEach((line) => {
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
		recentProjects = recentProjects.filter((p) => p !== path);
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

	$effect(() => {
		localStorage.setItem('ohmycode-manual-comparisons', JSON.stringify(manualComparisons));
	});

	onMount(() => {
		const storedComparisons = localStorage.getItem('ohmycode-manual-comparisons');
		if (storedComparisons) {
			try {
				manualComparisons = JSON.parse(storedComparisons);
			} catch (e) {
				console.error('Failed to parse manual comparisons', e);
			}
		}

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

		document.addEventListener('pointermove', onGlobalPointerMove, { passive: true });
		document.addEventListener('pointerup', onGlobalPointerUp);
		document.addEventListener('pointercancel', onGlobalPointerUp);

		return () => {
			cleanupWatcher();
			document.removeEventListener('pointermove', onGlobalPointerMove);
			document.removeEventListener('pointerup', onGlobalPointerUp);
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

		eventSource.addEventListener('change', (e: MessageEvent) => {
			console.log('[Watcher] Remote change detected:', e.data);
			debouncedSyncWithGit();
		});

		eventSource.onerror = () => {
			console.warn('[Watcher] SSE Connection error, switching to fallback polling...');
			cleanupWatcher();
			startFallbackPolling();
		};
	};

	const startFallbackPolling = () => {
		watcherStatus = 'connecting';
		// Poll every 10 seconds as fallback
		fallbackInterval = setInterval(() => {
			console.log('[Watcher] Polling for changes...');
			syncWithGit();
			watcherStatus = 'live';
		}, 10000);
	};

	const openFolderPicker = async (target: 'project' | 'clone-source' | 'clone-target') => {
		try {
			const res = await fetch('/api/git/picker/native');
			const data = await res.json();
			if (data.success && data.path) {
				if (target === 'project') {
					switchProject(data.path);
				} else if (target === 'clone-source') {
					cloneSourcePath = data.path;
				} else if (target === 'clone-target') {
					cloneTargetPath = data.path;
				}
			}
		} catch (e) {
			console.error('Failed to open native folder picker', e);
		}
	};

	const handleCloneProject = async () => {
		if (!cloneSourcePath.trim() || !cloneTargetPath.trim() || isCloning) return;
		isCloning = true;
		cloneProgress = 0;
		errorMessage = '';
		successMessage = 'Cloning project...';

		const progressInterval = setInterval(() => {
			if (cloneProgress < 90) {
				const diff = (90 - cloneProgress) * 0.15;
				cloneProgress += Math.max(1, Math.round(diff));
			}
		}, 150);

		try {
			const res = await fetch('/api/git/clone', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sourcePath: cloneSourcePath,
					targetPath: cloneTargetPath
				})
			});
			const data = await res.json();
			clearInterval(progressInterval);

			if (data.success) {
				cloneProgress = 100;
				successMessage = 'Project cloned successfully!';
				setTimeout(() => (successMessage = ''), 3000);
				await new Promise((resolve) => setTimeout(resolve, 500));
				switchProject(cloneTargetPath);
				cloneSourcePath = '';
				cloneTargetPath = '';
			} else {
				cloneProgress = 0;
				errorMessage = `Clone failed: ${data.error || 'Unknown error'}`;
			}
		} catch (e) {
			clearInterval(progressInterval);
			cloneProgress = 0;
			errorMessage = `Failed to clone: ${(e as Error).message}`;
		} finally {
			isCloning = false;
		}
	};

	let refetchPending = false;
	let syncDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

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
				const syncList = (newList: GitChangeItem[], oldList: GitChangeItem[]) => {
					return newList.map((newItem) => {
						const oldItem = oldList.find((o) => o.file === newItem.file && o.type === newItem.type);
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
				if (data.branch) {
					currentBranch = data.branch;
				}

				// Automatically update currently open Diff tab structures if their corresponding items have changed
				openTabs.forEach((tab, index) => {
					if (tab.type === 'diff' && tab.file) {
						const isStaged = tab.isStaged;
						const list = isStaged ? stagedChanges : suggestions;
						const match = list.find((x) => x.file === tab.file?.file);
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
		if (syncDebounceTimeout) {
			clearTimeout(syncDebounceTimeout);
		}
		syncDebounceTimeout = setTimeout(() => {
			syncWithGit();
		}, 500); // 500ms quiet-window debounce
	};

	type GitCommitFile = {
		file: string;
		type: string;
		status?: string;
	};

	type GitCommit = {
		id: string;
		title: string;
		message?: string;
		author?: string;
		date?: string;
		refs?: string;
		files?: GitCommitFile[];
	};

	let gitCommits = $state<GitCommit[]>([]);
	let isLoadingCommits = $state(false);
	let activeLogHistoryTab = $state<'git' | 'local'>('git');

	let expandedCommitId = $state<string | null>(null);
	let loadingCommitId = $state<string | null>(null);

	const isCommitOutgoing = (index: number) => {
		const firstOriginIdx = gitCommits.findIndex(
			(c) => c.refs && c.refs.toLowerCase().includes('origin/')
		);
		if (firstOriginIdx === -1) return false;
		return index < firstOriginIdx;
	};

	const toggleCommitAccordion = async (commit: GitCommit | DutyTask) => {
		if (expandedCommitId === commit.id) {
			expandedCommitId = null;
			return;
		}

		expandedCommitId = commit.id;

		if (!('createdAt' in commit) && (!commit.files || commit.files.length === 0)) {
			loadingCommitId = commit.id;
			try {
				const res = await fetch(
					`/api/git/commits?path=${encodeURIComponent(projectPath)}&commit=${commit.id}`
				);
				const data = await res.json();
				if (data.success && data.files) {
					(commit as GitCommit).files = data.files;
				}
			} catch (e) {
				console.error('Failed to fetch commit files', e);
			} finally {
				loadingCommitId = null;
			}
		}
	};

	const handleUndoCommit = async (commit: GitCommit) => {
		const matchingTask = kanbanStore.tasks.find((t) => t.gitCommitHash === commit.id);
		if (matchingTask) {
			await kanbanStore.removeTask(matchingTask.id);
		} else {
			const shouldUndo = confirm(
				'Undo this Git commit? (This will perform a soft reset to HEAD~1)'
			);
			if (!shouldUndo) return;
			const res = await kanbanStore.undoGitCommit(projectPath, commit.id);
			if (res.success) {
				syncWithGit();
			} else {
				alert(`Failed to undo commit: ${res.error || res.raw}`);
			}
		}
	};

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
		const changedLines = new SvelteSet<number>();
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
		} catch {
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
		} catch {
			editingError = 'Failed to save file';
		} finally {
			savingEditor = false;
		}
	};

	const inferConventionalType = (
		items: GitChangeItem[]
	): { type: string; scope: string; summary: string } => {
		const files = items.map((s) => s.file.toLowerCase());
		const types = items.map((s) => s.type.toLowerCase());

		const isTest = files.some(
			(f) => /\.(test|spec)\.[jt]sx?$/.test(f) || /\/(tests?|__tests?__)\//i.test(f)
		);
		const isDoc = files.some((f) => /\.(md|mdx|rst|txt)$/.test(f) || /\/docs?\//i.test(f));
		const isCi = files.some(
			(f) =>
				/\/(\.github|\.circleci|\.gitlab)\//i.test(f) ||
				/dockerfile/i.test(f) ||
				/\.github\/workflows\//i.test(f)
		);
		const isBuild = files.some(
			(f) =>
				/(webpack|vite|rollup|esbuild|babel)\.config/.test(f) ||
				/\.(npmrc|nvmrc)$/.test(f) ||
				/^package\.json$/.test(f.split(/[/\\]/).pop() ?? '')
		);
		const isConfig = files.some(
			(f) =>
				/\.(yaml|yml|toml|env|ini|cfg)$/.test(f) ||
				/(\.eslintrc|\.prettierrc|tsconfig|svelte\.config|tailwind\.config)/.test(f) ||
				/^\./.test(f.split(/[/\\]/).pop() ?? '')
		);
		const isStyle = files.some((f) => /\.(css|scss|sass|less|styl)$/.test(f));
		const isPerf = files.some((f) => /(perf|performance|optim|bench)/i.test(f));

		const hasAdded = types.some((t) => t.includes('added') || t.includes('new'));
		const hasDeleted = types.some((t) => t.includes('deleted'));
		const hasModified = types.some((t) => t.includes('modified'));
		const hasRenamed = types.some((t) => t.includes('renamed'));

		const scope = (() => {
			if (items.length === 1) {
				const parts = items[0].file.split(/[/\\]/);
				return parts.length > 1 ? parts[parts.length - 2] : '';
			}
			const allParts = items.map((s) => s.file.split(/[/\\]/).slice(0, -1));
			const shortest = allParts.reduce((a, b) => (a.length <= b.length ? a : b));
			let common = '';
			for (let i = 0; i < shortest.length; i++) {
				if (allParts.every((p) => p[i] === shortest[i])) common = shortest[i];
				else break;
			}
			return common;
		})();

		let type: string;
		if (isCi) type = 'ci';
		else if (isBuild) type = 'build';
		else if (isDoc) type = 'docs';
		else if (isTest) type = 'test';
		else if (isStyle) type = 'style';
		else if (isPerf) type = 'perf';
		else if (isConfig) type = 'chore';
		else if (hasRenamed) type = 'refactor';
		else if (hasAdded && !hasModified) type = 'feat';
		else if (hasDeleted && !hasAdded && !hasModified) type = 'chore';
		else if (hasModified) type = 'fix';
		else type = 'chore';

		const verb =
			hasAdded && !hasModified
				? 'add'
				: hasDeleted && !hasAdded
					? 'remove'
					: hasRenamed
						? 'rename'
						: 'update';

		const summary =
			items.length === 1
				? `${verb} ${items[0].file.split(/[/\\]/).pop()}`
				: `${verb} ${items.length} files`;

		return { type, scope, summary };
	};

	const generateSmartSummary = (items: GitChangeItem[]): string => {
		if (items.length === 0) return '';

		const files = items.map((s) => s.file);
		const hasFile = (name: string) => files.some((f) => f.includes(name));

		const hasTaskForm = hasFile('TaskForm.svelte');
		const hasGitApi = hasFile('+server.ts') || hasFile('watch') || hasFile('api/git');
		const hasKanbanColumn = hasFile('KanbanColumn.svelte');
		const hasKanbanCard = hasFile('KanbanCard.svelte');
		const hasKanbanStore = hasFile('kanban.svelte.ts');
		const hasTheme = hasFile('theme.ts') || hasFile('layout.css') || hasFile('+layout.svelte');

		// 1. TaskForm + Git API -> EXACTLY the user's requested example scenario!
		if (hasTaskForm && hasGitApi) {
			const isPerf = items.some(
				(s) =>
					s.diff &&
					(s.diff.includes('debounce') ||
						s.diff.includes('isSyncing') ||
						s.diff.includes('limit') ||
						s.diff.includes('threshold'))
			);
			if (isPerf) {
				return 'perf: optimize TaskForm component and Git API endpoints to prevent lags on big projects.';
			}
			const isDiffViewer = items.some(
				(s) =>
					s.diff &&
					(s.diff.includes('Saved Diff') ||
						s.diff.includes('fileDiffs') ||
						s.diff.includes('openSavedDiffs'))
			);
			if (isDiffViewer) {
				return 'feat: implement TaskForm component and integrate inline Saved Diff Viewer for log audit history.';
			}
			const isRecentProjects = items.some(
				(s) => s.diff && (s.diff.includes('recentProjects') || s.diff.includes('switchProject'))
			);
			if (isRecentProjects) {
				return 'feat: implement TaskForm component and integrate Recent Projects workspace switcher in Explorer.';
			}
			return 'feat: implement TaskForm component and initialize Git watcher API route for project synchronization.';
		}

		// 2. Just TaskForm
		if (hasTaskForm) {
			const isPerf = items.some(
				(s) =>
					s.diff &&
					(s.diff.includes('debounce') ||
						s.diff.includes('isSyncing') ||
						s.diff.includes('limit') ||
						s.diff.includes('threshold'))
			);
			if (isPerf) {
				return 'perf: optimize TaskForm UI reactivity and reduce DOM rendering lag for massive repositories.';
			}
			const isDiffViewer = items.some(
				(s) =>
					s.diff &&
					(s.diff.includes('Saved Diff') ||
						s.diff.includes('fileDiffs') ||
						s.diff.includes('openSavedDiffs'))
			);
			if (isDiffViewer) {
				return 'feat: implement inline Saved Diff Viewer inside log history audits for precise code reviews.';
			}
			const isRecentProjects = items.some(
				(s) => s.diff && (s.diff.includes('recentProjects') || s.diff.includes('switchProject'))
			);
			if (isRecentProjects) {
				return 'feat: implement Recent Projects list in Explorer for rapid workspace hot-swapping.';
			}
			return 'feat: implement TaskForm component and enhance VS Code-inspired Source Control user interface.';
		}

		// 3. Just Git API / Server
		if (hasGitApi) {
			const isPerf = items.some(
				(s) =>
					s.diff &&
					(s.diff.includes('debounce') ||
						s.diff.includes('limit') ||
						s.diff.includes('threshold') ||
						s.diff.includes('depth'))
			);
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
			type === 'feat'
				? 'implement'
				: type === 'fix'
					? 'resolve issue in'
					: type === 'refactor'
						? 'refactor'
						: type === 'style'
							? 'refine style of'
							: 'update';

		if (items.length === 1) {
			return `${type}: ${verb} ${basename} module and sync changes with workspace.`;
		} else {
			return `${type}: ${verb} ${items.length} files including ${basename} to refine workspace logic.`;
		}
	};

	const updateFormFromSelected = () => {
		const selectedUnstaged = suggestions.filter((s) => s.selected);
		const selectedStaged = stagedChanges.filter((s) => s.selected);
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
			filesInput = selected.map((s) => s.file).join(', ');
			functionsInput = selected
				.flatMap((s) => s.functions)
				.filter((v, i, a) => a.indexOf(v) === i)
				.join(', ');
		}
	};

	// ── Pointer-based Drag & Drop ──────────────────────────────────────

	const onCardPointerDown = (e: PointerEvent, file: string, fromStaged: boolean) => {
		if (e.button !== 0) return;
		if ((e.target as HTMLElement).closest('button, input, a, textarea')) return;
		e.preventDefault();

		const cardEl = e.currentTarget as HTMLElement;
		const rect = cardEl.getBoundingClientRect();

		dragState = {
			file,
			fromStaged,
			startX: e.clientX,
			startY: e.clientY,
			curX: e.clientX,
			curY: e.clientY,
			offsetX: e.clientX - rect.left,
			offsetY: e.clientY - rect.top,
			cardW: rect.width,
			cardH: rect.height
		};

		document.body.style.userSelect = 'none';
		document.body.style.cursor = 'grabbing';
	};

	const onGlobalPointerMove = (e: PointerEvent) => {
		if (!dragState) return;
		dragState = { ...dragState, curX: e.clientX, curY: e.clientY };

		if (!stagedZoneEl || !unstagedZoneEl) {
			dropTarget = null;
			return;
		}

		const sr = stagedZoneEl.getBoundingClientRect();
		const ur = unstagedZoneEl.getBoundingClientRect();

		if (
			e.clientX >= sr.left &&
			e.clientX <= sr.right &&
			e.clientY >= sr.top &&
			e.clientY <= sr.bottom
		) {
			dropTarget = 'staged';
		} else if (
			e.clientX >= ur.left &&
			e.clientX <= ur.right &&
			e.clientY >= ur.top &&
			e.clientY <= ur.bottom
		) {
			dropTarget = 'unstaged';
		} else {
			dropTarget = null;
		}
	};

	const onGlobalPointerUp = async () => {
		if (!dragState) return;

		document.body.style.userSelect = '';
		document.body.style.cursor = '';

		const { file, fromStaged } = dragState;
		const target = dropTarget;

		dragState = null;
		dropTarget = null;

		const toStaged = target === 'staged';
		const shouldMove = target !== null && toStaged !== fromStaged;
		if (!shouldMove) return;

		const previousSuggestions = suggestions.map((item) => ({ ...item }));
		const previousStagedChanges = stagedChanges.map((item) => ({ ...item }));

		if (toStaged) {
			const idx = suggestions.findIndex((s) => s.file === file);
			if (idx !== -1) {
				const item = suggestions[idx];
				suggestions.splice(idx, 1);
				stagedChanges.push({ ...item, isStaged: true });
			}
		} else {
			const idx = stagedChanges.findIndex((s) => s.file === file);
			if (idx !== -1) {
				const item = stagedChanges[idx];
				stagedChanges.splice(idx, 1);
				suggestions.push({ ...item, isStaged: false });
			}
		}

		droppedFile = file;
		setTimeout(() => {
			if (droppedFile === file) droppedFile = null;
		}, 700);

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
		} catch {
			errorMessage = 'Failed to call discard API';
		}
	};

	const handleCommitKeyDown = (e: KeyboardEvent) => {
		if (e.ctrlKey && e.key === 'Enter') {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleSubmit = async (_e?: SubmitEvent) => {
		if (_e) _e.preventDefault();
		if (!canSubmitLog) return;

		const selectedItems = [...stagedChanges, ...suggestions].filter((s) => s.selected);
		const selectedFiles = selectedItems.map((s) => s.file);
		const stagedFiles = stagedChanges.map((s) => s.file);
		const manualFiles = filesInput
			.split(',')
			.map((f) => f.trim())
			.filter((f) => f !== '');
		const files =
			selectedFiles.length > 0 ? selectedFiles : includeGitCommit ? stagedFiles : manualFiles;
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
					setTimeout(() => (successMessage = ''), 3000);
				}
			} catch {
				errorMessage = 'Failed to execute git commit API';
				isCommitting = false;
				return;
			} finally {
				isCommitting = false;
			}
		}

		const newTask = kanbanStore.addTask(
			title,
			files,
			functions,
			description,
			notes,
			projectPath,
			fileDiffs,
			gitCommitHash
		);

		if (projectPath) {
			kanbanStore.syncToLocal(newTask, projectPath, includeGitCommit, fileDiffs);
		}

		title = '';
		description = '';
		notes = '';
		filesInput = '';
		functionsInput = '';
		includeGitCommit = false;
		suggestions = suggestions.map((s) => ({ ...s, selected: false, showDiff: false }));
		stagedChanges = stagedChanges.map((s) => ({ ...s, selected: false, showDiff: false }));
		errorMessage = '';

		// Return to welcome dashboard
		activeTabId = 'welcome';
		syncWithGit();
	};

	const gitPush = async () => {
		if (!projectPath || isPushing || isPulling) return;
		isPushing = true;
		errorMessage = '';
		successMessage = 'Pushing commits to remote...';

		try {
			const res = await fetch('/api/git/push', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath })
			});
			const data = await res.json();
			if (data.success) {
				successMessage = 'Git Push Successful!';
				setTimeout(() => (successMessage = ''), 3000);
				syncWithGit();
			} else {
				errorMessage = `Push failed: ${data.error || 'Unknown error'}`;
				if (data.raw) {
					errorMessage += ` Details: ${data.raw.substring(0, 150)}`;
				}
			}
		} catch {
			errorMessage = 'Failed to execute git push API';
		} finally {
			isPushing = false;
		}
	};

	const gitPull = async () => {
		if (!projectPath || isPushing || isPulling) return;
		isPulling = true;
		errorMessage = '';
		successMessage = 'Pulling changes from remote...';

		try {
			const res = await fetch('/api/git/pull', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath })
			});
			const data = await res.json();
			if (data.success) {
				successMessage = 'Git Pull Successful!';
				setTimeout(() => (successMessage = ''), 3000);
				syncWithGit();
			} else {
				errorMessage = `Pull failed: ${data.error || 'Unknown error'}`;
				if (data.raw) {
					errorMessage += ` Details: ${data.raw.substring(0, 150)}`;
				}
			}
		} catch {
			errorMessage = 'Failed to execute git pull API';
		} finally {
			isPulling = false;
		}
	};
</script>

<!-- VS Code Style Root Layout -->
<div
	class="vscode-font vscode-noselect flex h-screen w-screen flex-col overflow-hidden bg-base-100 text-base-content select-none"
>
	<!-- 2. VS Code Main Workspace Container -->
	<div class="flex w-full flex-1 overflow-hidden">
		<!-- 2.1 Activity Bar (Far Left) -->
		<aside
			class="glass-panel relative z-20 flex w-12 shrink-0 flex-col items-center justify-between border-r border-base-content/8 py-2 select-none"
		>
			<div class="flex w-full flex-col items-center gap-3.5">
				<!-- Explorer Icon -->
				<button
					onclick={() => {
						activeSidebar = 'explorer';
						isSidebarCollapsed = false;
					}}
					class="group relative rounded-lg p-2.5 text-base-content/50 transition-colors hover:text-base-content {activeSidebar ===
						'explorer' && !isSidebarCollapsed
						? 'bg-base-content/5 text-primary'
						: ''}"
					title="Explorer"
				>
					<div
						class="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 scale-y-0 rounded-r bg-primary transition-all group-hover:scale-y-75 {activeSidebar ===
							'explorer' && !isSidebarCollapsed
							? 'scale-y-100'
							: ''}"
					></div>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline
							points="14 2 14 8 20 8"
						></polyline></svg
					>
				</button>

				<!-- Source Control Icon -->
				<button
					onclick={() => {
						activeSidebar = 'source-control';
						isSidebarCollapsed = false;
					}}
					class="group relative rounded-lg p-2.5 text-base-content/50 transition-colors hover:text-base-content {activeSidebar ===
						'source-control' && !isSidebarCollapsed
						? 'bg-base-content/5 text-primary'
						: ''}"
					title="Source Control"
				>
					<div
						class="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 scale-y-0 rounded-r bg-primary transition-all group-hover:scale-y-75 {activeSidebar ===
							'source-control' && !isSidebarCollapsed
							? 'scale-y-100'
							: ''}"
					></div>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle
							cx="6"
							cy="18"
							r="3"
						></circle><path d="M20.39 18.39A5 5 0 0 0 18 13H6"></path><path d="M6 9v6"></path></svg
					>
					{#if suggestions.length + stagedChanges.length > 0}
						<span
							class="absolute top-1 right-1 badge min-w-[14px] bg-primary px-1.5 py-1 font-mono badge-xs text-[8px] font-bold text-primary-content"
						>
							{suggestions.length + stagedChanges.length}
						</span>
					{/if}
				</button>

				<!-- History/Logs Icon -->
				<button
					onclick={() => {
						activeSidebar = 'history';
						isSidebarCollapsed = false;
					}}
					class="group relative rounded-lg p-2.5 text-base-content/50 transition-colors hover:text-base-content {activeSidebar ===
						'history' && !isSidebarCollapsed
						? 'bg-base-content/5 text-primary'
						: ''}"
					title="Duty Logs History"
				>
					<div
						class="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 scale-y-0 rounded-r bg-primary transition-all group-hover:scale-y-75 {activeSidebar ===
							'history' && !isSidebarCollapsed
							? 'scale-y-100'
							: ''}"
					></div>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"
						></polyline></svg
					>
				</button>

				<!-- Manual Code Comparator Icon -->
				<button
					onclick={() => {
						activeSidebar = 'compare';
						isSidebarCollapsed = false;
					}}
					class="group relative rounded-lg p-2.5 text-base-content/50 transition-colors hover:text-base-content {activeSidebar ===
						'compare' && !isSidebarCollapsed
						? 'bg-base-content/5 text-primary'
						: ''}"
					title="Manual Code Comparator"
				>
					<div
						class="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 scale-y-0 rounded-r bg-primary transition-all group-hover:scale-y-75 {activeSidebar ===
							'compare' && !isSidebarCollapsed
							? 'scale-y-100'
							: ''}"
					></div>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
						<line x1="12" y1="3" x2="12" y2="17" />
						<line x1="12" y1="21" x2="12" y2="21" />
						<path d="M7 21h10" />
					</svg>
				</button>

				<!-- Direct Preferences View -->
				<button
					onclick={() => {
						activeSidebar = 'settings';
						isSidebarCollapsed = false;
					}}
					class="group relative rounded-lg p-2.5 text-base-content/50 transition-colors hover:text-base-content {activeSidebar ===
						'settings' && !isSidebarCollapsed
						? 'bg-base-content/5 text-primary'
						: ''}"
					title="Settings & Themes"
				>
					<div
						class="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 scale-y-0 rounded-r bg-primary transition-all group-hover:scale-y-75 {activeSidebar ===
							'settings' && !isSidebarCollapsed
							? 'scale-y-100'
							: ''}"
					></div>
					<svg
						width="22"
						height="22"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
						></path></svg
					>
				</button>
			</div>

			<!-- Settings gear at bottom -->
			<div class="flex w-full flex-col items-center gap-2">
				<button
					onclick={() => (showSettingsModal = true)}
					class="rounded-lg p-2.5 text-base-content/50 transition-all hover:bg-primary/10 hover:text-primary"
					title="System Settings Configuration"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						><circle cx="12" cy="12" r="3"></circle><path
							d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
						></path></svg
					>
				</button>
			</div>
		</aside>

		<!-- 2.2 Sidebar Panel (Collapsible, holds active views) -->
		{#if !isSidebarCollapsed}
			<section
				class="glass-panel relative z-10 flex h-full w-[310px] shrink-0 flex-col border-r border-base-content/8 select-none"
				transition:slide={{ axis: 'x', duration: 200 }}
			>
				<!-- Sidebar Header -->
				<div
					class="flex h-10 shrink-0 items-center justify-between border-b border-base-content/8 bg-base-content/3 px-4"
				>
					<span class="text-[11px] font-bold tracking-widest uppercase opacity-70">
						{#if activeSidebar === 'source-control'}
							Source Control: Git
						{:else}
							{activeSidebar}
						{/if}
					</span>
					<div class="flex items-center gap-1.5">
						{#if activeSidebar === 'source-control'}
							<button
								onclick={gitPull}
								class="btn btn-square text-base-content/60 btn-ghost btn-xs hover:text-base-content"
								disabled={isPulling || isPushing || !projectPath}
								title="Git Pull"
							>
								{#if isPulling}
									<span class="loading h-3 w-3 loading-spinner text-primary"></span>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"
										></polyline></svg
									>
								{/if}
							</button>

							<button
								onclick={gitPush}
								class="btn btn-square text-base-content/60 btn-ghost btn-xs hover:text-base-content"
								disabled={isPulling || isPushing || !projectPath}
								title="Git Push"
							>
								{#if isPushing}
									<span class="loading h-3 w-3 loading-spinner text-primary"></span>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"
										></polyline></svg
									>
								{/if}
							</button>

							<button
								onclick={syncWithGit}
								class="btn btn-square text-base-content/60 btn-ghost btn-xs hover:text-base-content"
								disabled={isSyncing}
								title="Refresh Git Status"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									class={isSyncing ? 'animate-spin' : ''}
									><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></svg
								>
							</button>
						{/if}
						<button
							onclick={() => (isSidebarCollapsed = true)}
							class="btn btn-square text-base-content/60 btn-ghost btn-xs hover:text-base-content"
							title="Collapse Sidebar Panel"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg
							>
						</button>
					</div>
				</div>

				<!-- Sidebar Body View Renderer -->
				<div class="vscode-scrollbar flex flex-1 flex-col overflow-y-auto">
					<!-- VIEW: SOURCE CONTROL -->
					{#if activeSidebar === 'source-control'}
						<div class="flex h-full flex-col gap-3 p-3">
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
							<div class="mt-2 flex flex-col">
								<div
									class="mb-1 flex items-center justify-between border-b border-base-content/5 px-1 py-1.5 text-[10px] font-bold tracking-wider uppercase opacity-60 select-none"
								>
									<div class="flex items-center gap-1.5">
										<input
											type="checkbox"
											checked={stagedChanges.length > 0 && stagedChanges.every((s) => s.selected)}
											class="checkbox scale-75 checkbox-xs checkbox-success"
											onchange={() => toggleSelectAll(true)}
											disabled={stagedChanges.length === 0}
											aria-label="Select all staged changes"
										/>
										<span>Staged Changes</span>
									</div>
									<div class="flex items-center gap-2">
										{#if stagedChanges.length > 0}
											<button
												onclick={() => moveAll(false)}
												class="text-[9px] transition-colors hover:text-primary">Unstage All</button
											>
										{/if}
										<span class="badge bg-base-content/10 font-mono badge-sm text-[9px] font-bold"
											>{stagedChanges.length}</span
										>
									</div>
								</div>

								<!-- Drag & Drop Staged Zone -->
								<div
									bind:this={stagedZoneEl}
									class="flex min-h-[50px] flex-col gap-1 rounded-lg p-1 transition-all duration-300 {stagedZoneClass}"
								>
									{#each stagedChanges as s, i (s.id)}
										{#if dragState?.file === s.file && dragState?.fromStaged === true && dragHasMoved}
											<div
												class="h-9 rounded-lg border border-dashed border-primary/20 bg-primary/2"
											></div>
										{:else}
											<div
												role="button"
												tabindex="0"
												class="group flex cursor-grab items-center justify-between rounded-lg border border-transparent p-2 text-left text-[11px] transition-all select-none active:cursor-grabbing {activeTabId ===
												`diff-${s.file}-staged`
													? 'border-primary/10 bg-primary/10 text-primary'
													: 'hover:bg-base-content/5'}"
												onpointerdown={(e) => onCardPointerDown(e, s.file, true)}
												onclick={() => openFileDiffTab(s, true)}
												onkeydown={(e) => e.key === 'Enter' && openFileDiffTab(s, true)}
											>
												<div class="flex flex-1 items-center gap-2 overflow-hidden">
													<!-- Selection check box -->
													<input
														type="checkbox"
														checked={s.selected}
														class="checkbox shrink-0 scale-90 checkbox-xs checkbox-primary"
														onclick={(e) => e.stopPropagation()}
														onchange={() => toggleSelection(i, true)}
														aria-label="Toggle selection"
													/>
													<span class="truncate font-mono text-xs"
														>{s.file.split(/[/\\]/).pop()}</span
													>
													<span class="max-w-[80px] truncate font-mono text-[9px] opacity-40"
														>{s.file.slice(
															0,
															Math.max(s.file.lastIndexOf('/'), s.file.lastIndexOf('\\')) || 10
														)}</span
													>
												</div>

												<div class="flex shrink-0 items-center gap-2">
													<span class="font-mono text-[10px] font-bold text-success">M</span>
													<div class="hidden items-center gap-1 transition-all group-hover:flex">
														<button
															onclick={(e) => moveFile(e, s.file, false)}
															class="btn btn-square text-error btn-ghost btn-xs"
															title="Unstage File"
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="11"
																height="11"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg
															>
														</button>
													</div>
												</div>
											</div>
										{/if}
									{/each}
									{#if stagedChanges.length === 0}
										<div
											class="rounded-lg border border-dashed border-base-content/10 py-4 text-center text-[10px] font-medium opacity-35"
										>
											No staged modifications
										</div>
									{/if}
								</div>
							</div>

							<!-- Collapsible Section: DETECTED CHANGES (CHANGES) -->
							<div class="mt-3 flex flex-col">
								<div
									class="mb-1 flex items-center justify-between border-b border-b-base-content/5 px-1 py-1.5 text-[10px] font-bold tracking-wider uppercase opacity-60 select-none"
								>
									<div class="flex items-center gap-1.5">
										<input
											type="checkbox"
											checked={suggestions.length > 0 && suggestions.every((s) => s.selected)}
											class="checkbox scale-75 checkbox-xs checkbox-warning"
											onchange={() => toggleSelectAll(false)}
											disabled={suggestions.length === 0}
											aria-label="Select all changes"
										/>
										<span>Changes</span>
									</div>
									<div class="flex items-center gap-2">
										{#if suggestions.length > 0}
											<button
												onclick={() => moveAll(true)}
												class="text-[9px] transition-colors hover:text-primary">Stage All</button
											>
										{/if}
										<span class="badge bg-base-content/10 font-mono badge-sm text-[9px] font-bold"
											>{suggestions.length}</span
										>
									</div>
								</div>

								<!-- Drag & Drop Detected Zone -->
								<div
									bind:this={unstagedZoneEl}
									class="flex min-h-[50px] flex-col gap-1 rounded-lg p-1 transition-all duration-300 {unstagedZoneClass}"
								>
									{#each suggestions as s, i (s.id)}
										{#if dragState?.file === s.file && dragState?.fromStaged === false && dragHasMoved}
											<div
												class="h-9 rounded-lg border border-dashed border-primary/20 bg-primary/2"
											></div>
										{:else}
											<div
												role="button"
												tabindex="0"
												class="group flex cursor-grab items-center justify-between rounded-lg border border-transparent p-2 text-left text-[11px] transition-all select-none active:cursor-grabbing {activeTabId ===
												`diff-${s.file}-unstaged`
													? 'border-primary/10 bg-primary/10 text-primary'
													: 'hover:bg-base-content/5'}"
												onpointerdown={(e) => onCardPointerDown(e, s.file, false)}
												onclick={() => openFileDiffTab(s, false)}
												onkeydown={(e) => e.key === 'Enter' && openFileDiffTab(s, false)}
											>
												<div class="flex flex-1 items-center gap-2 overflow-hidden">
													<!-- Selection checkbox -->
													<input
														type="checkbox"
														checked={s.selected}
														class="checkbox shrink-0 scale-90 checkbox-xs checkbox-primary"
														onclick={(e) => e.stopPropagation()}
														onchange={() => toggleSelection(i, false)}
														aria-label="Toggle selection"
													/>
													<span class="truncate font-mono text-xs"
														>{s.file.split(/[/\\]/).pop()}</span
													>
													<span class="max-w-[80px] truncate font-mono text-[9px] opacity-40"
														>{s.file}</span
													>
												</div>

												<div class="flex shrink-0 items-center gap-2">
													<span class="font-mono text-[10px] font-bold text-warning"
														>{s.status === '?' ? 'U' : 'M'}</span
													>
													<div class="hidden items-center gap-1 transition-all group-hover:flex">
														<button
															onclick={(e) => moveFile(e, s.file, true)}
															class="btn btn-square text-success btn-ghost btn-xs"
															title="Stage File"
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="11"
																height="11"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="3"
																><line x1="12" y1="5" x2="12" y2="19"></line><line
																	x1="5"
																	y1="12"
																	x2="19"
																	y2="12"
																></line></svg
															>
														</button>
														<button
															onclick={(e) => {
																e.stopPropagation();
																discardChanges(s.file);
															}}
															class="btn btn-square text-error btn-ghost btn-xs"
															title="Revert Changes"
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="11"
																height="11"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="2.5"
																><path d="M3 6h18"></path><path
																	d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
																></path></svg
															>
														</button>
													</div>
												</div>
											</div>
										{/if}
									{/each}
									{#if suggestions.length === 0}
										<div
											class="rounded-lg border border-dashed border-base-content/10 py-4 text-center text-[10px] font-medium opacity-35"
										>
											All modifications staged
										</div>
									{/if}
								</div>
							</div>
						</div>

						<!-- VIEW: DUTY LOGS HISTORY -->
					{:else if activeSidebar === 'history'}
						<div class="flex h-full flex-col gap-3 p-3">
							<!-- Search History bar -->
							<div class="form-control shrink-0">
								<input
									type="text"
									bind:value={sidebarSearchQuery}
									placeholder="Search audit trail logs..."
									class="input input-sm h-8 w-full rounded-lg border-base-content/10 bg-base-100 text-[11px] leading-none focus:border-primary focus:ring-1 focus:ring-primary"
								/>
							</div>

							<!-- List of logged history -->
							<div class="vscode-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto">
								{#each filteredLoggedDuties as task (task.id)}
									<div
										role="button"
										tabindex="0"
										onclick={() => openLogTab(task)}
										onkeydown={(e) => e.key === 'Enter' && openLogTab(task)}
										class="group flex cursor-pointer flex-col gap-1 rounded-xl border border-transparent p-2.5 text-left transition-all hover:border-base-content/5 hover:bg-base-content/5"
									>
										<div class="flex items-center justify-between">
											<span
												class="badge max-w-[120px] truncate rounded border border-secondary/30 bg-secondary/15 px-1.5 font-mono badge-xs text-[7px] font-bold tracking-wide text-secondary uppercase"
											>
												{task.title}
											</span>
											<span class="font-mono text-[9px] opacity-35">
												{new Date(task.createdAt).toLocaleTimeString('en-GB', {
													hour: '2-digit',
													minute: '2-digit'
												})}
											</span>
										</div>
										<p
											class="truncate text-xs leading-snug font-bold text-base-content/90 transition-colors group-hover:text-primary"
										>
											{task.description || 'No Description'}
										</p>
										{#if task.notes}
											<p class="max-w-full truncate font-mono text-[10px] opacity-50">
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
					{:else if activeSidebar === 'explorer'}
						<div class="flex flex-col gap-4 p-4">
							<div
								class="flex flex-col gap-1 rounded-xl border border-base-content/10 bg-base-100 p-3.5 shadow-inner"
							>
								<span class="text-[9px] font-black tracking-widest uppercase opacity-45"
									>WORKSPACE ROOT</span
								>
								<span
									class="truncate font-mono text-[10px] font-bold break-all text-primary opacity-90"
									>{projectPath || 'No Folder Selected'}</span
								>
							</div>

							<button
								onclick={() => openFolderPicker('project')}
								class="btn w-full gap-1.5 rounded-lg text-xs font-bold tracking-wider uppercase btn-sm btn-primary"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									><path
										d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
									></path></svg
								>
								Pick Folder
							</button>

							<!-- RECENT PROJECTS LIST switcher -->
							<div class="mt-4 flex flex-col">
								<h4
									class="mb-2 flex items-center justify-between border-b border-base-content/5 pb-1 text-[10px] font-bold tracking-widest uppercase opacity-55 select-none"
								>
									<span>Recent Projects</span>
									<button
										onclick={() => {
											recentProjects = [];
											localStorage.removeItem('ohmycode-recent-projects');
										}}
										class="text-[8px] font-semibold tracking-wider uppercase opacity-50 transition-colors hover:text-error hover:opacity-100"
										title="Clear all recent projects history"
									>
										Clear
									</button>
								</h4>
								{#if recentProjects.length > 0}
									<div
										class="vscode-scrollbar flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto pr-0.5"
									>
										{#each recentProjects as path (path)}
											<button
												onclick={() => switchProject(path)}
												class="rounded-xl border bg-base-100 p-2.5 text-left hover:bg-base-300 {projectPath ===
												path
													? 'border-primary/35 bg-primary/5 text-primary'
													: 'border-base-content/10'} group flex cursor-pointer flex-col gap-1 font-mono text-[10px] opacity-85 transition-all hover:border-primary/20"
												title="Click to mount this project workspace: {path}"
											>
												<div
													class="flex items-center gap-1.5 truncate font-sans text-[11px] font-bold text-base-content transition-colors group-hover:text-primary"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="11"
														height="11"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2.5"
														class={projectPath === path ? 'text-primary' : 'text-secondary'}
														><path
															d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
														></path></svg
													>
													<span>{path.split(/[/\\]/).pop() || path}</span>
													{#if projectPath === path}
														<span
															class="badge h-3.5 rounded border-primary/20 bg-primary/10 px-1 badge-xs text-[7px] font-bold tracking-wider text-primary uppercase"
															>Active</span
														>
													{/if}
												</div>
												<span class="truncate text-[9px] tracking-tight opacity-45">{path}</span>
											</button>
										{/each}
									</div>
								{:else}
									<div
										class="rounded-xl border border-dashed border-base-content/10 py-6 text-center text-[10px] font-medium opacity-35 select-none"
									>
										No recent projects recorded.
									</div>
								{/if}
							</div>

							<!-- CLONE LOCAL REPOSITORY PANEL -->
							<div class="divider my-2 opacity-30"></div>
							<div
								class="card flex flex-col gap-3 rounded-2xl border border-base-content/5 bg-base-200/50 p-4 text-left shadow-sm"
							>
								<h3 class="text-xs font-black tracking-wider uppercase opacity-60">
									Clone Local Project
								</h3>
								<p class="text-[10px] opacity-75">
									Clone any local folder to use it as your primary remote repository.
								</p>

								<div class="form-control w-full gap-1">
									<label class="label p-0" for="clone-source-input">
										<span class="label-text text-[9px] font-bold uppercase opacity-55"
											>Source Project Folder</span
										>
									</label>
									<div class="flex gap-1.5">
										<input
											id="clone-source-input"
											type="text"
											bind:value={cloneSourcePath}
											placeholder="C:/path/to/source"
											class="input-bordered input input-xs flex-1 rounded font-mono text-[10px]"
										/>
										<button
											onclick={() => openFolderPicker('clone-source')}
											class="btn btn-square rounded btn-outline btn-xs"
											title="Browse source path"
										>
											📂
										</button>
									</div>
								</div>

								<div class="form-control w-full gap-1">
									<label class="label p-0" for="clone-target-input">
										<span class="label-text text-[9px] font-bold uppercase opacity-55"
											>New Target Folder (Clone)</span
										>
									</label>
									<div class="flex gap-1.5">
										<input
											id="clone-target-input"
											type="text"
											bind:value={cloneTargetPath}
											placeholder="C:/path/to/destination"
											class="input-bordered input input-xs flex-1 rounded font-mono text-[10px]"
										/>
										<button
											onclick={() => openFolderPicker('clone-target')}
											class="btn btn-square rounded btn-outline btn-xs"
											title="Browse destination path"
										>
											📂
										</button>
									</div>
								</div>

								{#if isCloning}
									<div class="mt-1 flex flex-col gap-1">
										<div class="flex items-center justify-between font-mono text-[9px] opacity-80">
											<span>Progress:</span>
											<span class="font-bold">{cloneProgress}%</span>
										</div>
										<progress
											class="progress h-1.5 w-full rounded-full progress-secondary"
											value={cloneProgress}
											max="100"
										></progress>
									</div>
								{/if}

								<button
									onclick={handleCloneProject}
									disabled={isCloning || !cloneSourcePath || !cloneTargetPath}
									class="btn mt-1 w-full rounded font-bold tracking-wider uppercase btn-xs btn-secondary"
								>
									{#if isCloning}
										<span class="loading loading-xs loading-spinner"></span> Cloning...
									{:else}
										Clone & Open Workspace
									{/if}
								</button>
							</div>
						</div>

						<!-- VIEW: PREFERENCES / THEMES -->
					{:else if activeSidebar === 'settings'}
						<div class="flex flex-col gap-4 p-4">
							<!-- Color Theme selector -->
							<div class="form-control w-full">
								<label class="label pt-0 pb-1" for="sidebar-theme-select">
									<span
										class="label-text text-[10px] font-black tracking-widest uppercase opacity-55"
										>Active UI Color Theme</span
									>
								</label>
								<select
									id="sidebar-theme-select"
									class="select-bordered select w-full rounded-lg bg-base-100 select-sm text-xs font-bold"
									value={$theme}
									onchange={(e) => theme.set((e.currentTarget as HTMLSelectElement).value)}
								>
									{#each themes as t (t)}
										<option value={t} selected={$theme === t} class="font-bold capitalize"
											>{t}</option
										>
									{/each}
								</select>
							</div>

							<div class="divider my-2 opacity-50"></div>

							<!-- Advanced Modal trigger -->
							<button
								onclick={() => (showSettingsModal = true)}
								class="btn w-full gap-1.5 rounded-lg text-xs uppercase btn-outline btn-sm"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									><circle cx="12" cy="12" r="3"></circle><path
										d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
									></path></svg
								>
								System Settings Console
							</button>

							<!-- Error panel visual inside settings if exist -->
							{#if errorMessage}
								<div
									class="mt-4 rounded-lg border border-error/25 bg-error/15 p-3 font-mono text-[10px] leading-relaxed text-error"
								>
									<strong>LOG_ERROR:</strong>
									{errorMessage}
								</div>
							{/if}
						</div>
					{:else if activeSidebar === 'compare'}
						<div class="flex flex-col gap-4 p-4">
							<div
								class="flex flex-col gap-1 rounded-xl border border-base-content/10 bg-base-100 p-3.5 shadow-inner"
							>
								<span class="text-[9px] font-black tracking-widest uppercase opacity-45"
									>Manual Code Comparator</span
								>
								<span class="text-[10px] font-medium opacity-80"
									>Compare code changes side-by-side or inline manually.</span
								>
							</div>

							<button
								onclick={createManualComparison}
								class="btn w-full gap-1.5 rounded-lg text-xs font-bold tracking-wider uppercase btn-sm btn-primary"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
								>
									<line x1="12" y1="5" x2="12" y2="19"></line>
									<line x1="5" y1="12" x2="19" y2="12"></line>
								</svg>
								New Comparison
							</button>

							<div class="mt-4 flex flex-col">
								<h4
									class="mb-2 border-b border-base-content/5 pb-1 text-[10px] font-bold tracking-widest uppercase opacity-55 select-none"
								>
									Comparisons List
								</h4>
								{#if manualComparisons.length > 0}
									<div
										class="vscode-scrollbar flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto pr-0.5"
									>
										{#each manualComparisons as comp (comp.id)}
											<div
												role="button"
												tabindex="0"
												onclick={() =>
													openTab({
														id: `manual-compare-${comp.id}`,
														type: 'manual-compare',
														title: comp.title,
														comparisonId: comp.id
													})}
												onkeydown={(e) =>
													e.key === 'Enter' &&
													openTab({
														id: `manual-compare-${comp.id}`,
														type: 'manual-compare',
														title: comp.title,
														comparisonId: comp.id
													})}
												class="rounded-xl border bg-base-100 p-2.5 text-left hover:bg-base-300 {activeTabId ===
												`manual-compare-${comp.id}`
													? 'border-primary/35 bg-primary/5 text-primary'
													: 'border-base-content/10'} group flex cursor-pointer items-center justify-between gap-1 font-mono text-[10px] opacity-85 transition-all hover:border-primary/20"
											>
												<div
													class="flex items-center gap-1.5 truncate font-sans text-[11px] font-bold text-base-content transition-colors group-hover:text-primary"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="11"
														height="11"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2.5"
														class={activeTabId === `manual-compare-${comp.id}`
															? 'text-primary'
															: 'text-secondary'}
													>
														<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
														<line x1="12" y1="3" x2="12" y2="17" />
													</svg>
													<span>{comp.title}</span>
												</div>
												<button
													onclick={(e) => deleteManualComparison(e, comp.id)}
													class="btn btn-square text-error/60 opacity-0 btn-ghost transition-opacity btn-xs group-hover:opacity-100 hover:bg-error/10 hover:text-error"
													title="Delete this comparison"
												>
													✕
												</button>
											</div>
										{/each}
									</div>
								{:else}
									<div
										class="rounded-xl border border-dashed border-base-content/10 py-6 text-center text-[10px] font-medium opacity-35 select-none"
									>
										No comparisons created yet.
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</section>
		{/if}

		<!-- 2.3 Main Editor Area (Fills remaining space, Tab based) -->
		<main class="relative flex h-full flex-1 flex-col overflow-hidden bg-base-100">
			<!-- Editor Tabs Navigation Bar -->
			<div
				class="vscode-scrollbar flex h-10 shrink-0 items-center justify-between overflow-x-auto border-b border-base-content/10 bg-base-300 px-2 select-none"
			>
				<div class="flex h-full items-center">
					<!-- Expand Sidebar trigger inside tabs bar if collapsed -->
					{#if isSidebarCollapsed}
						<button
							onclick={() => (isSidebarCollapsed = false)}
							class="btn mr-2 btn-square text-base-content/70 btn-ghost btn-xs hover:bg-base-content/10"
							title="Expand Sidebar Panel"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg
							>
						</button>
					{/if}

					<!-- Tab elements list -->
					{#each openTabs as tab (tab.id)}
						<div
							role="button"
							tabindex="0"
							onclick={() => (activeTabId = tab.id)}
							onkeydown={(e) => e.key === 'Enter' && (activeTabId = tab.id)}
							class="group relative flex h-[40px] cursor-pointer items-center gap-2 border-r border-base-content/10 px-4 text-[12px] font-medium transition-colors
								{activeTabId === tab.id
								? 'border-t-2 border-t-primary bg-base-100 font-bold text-primary shadow-sm'
								: 'bg-base-200/55 text-base-content/55 hover:bg-base-200'}"
						>
							<!-- Icon depending on tab type -->
							{#if tab.type === 'welcome'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="opacity-60"
									><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline
										points="9 22 9 12 15 12 15 22"
									></polyline></svg
								>
							{:else if tab.type === 'diff'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									class="shrink-0 text-secondary"
									><path d="M12 20h9"></path><path
										d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
									></path></svg
								>
							{:else if tab.type === 'manual-compare'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									class="shrink-0 text-primary"
								>
									<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
									<line x1="12" y1="3" x2="12" y2="17" />
								</svg>
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									class="shrink-0 text-success"
									><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"
									></polyline></svg
								>
							{/if}

							<span class="max-w-[120px] truncate">{tab.title}</span>

							<!-- Tab Close Button -->
							<button
								onclick={(e) => closeTab(e, tab.id)}
								class="scale-90 cursor-pointer rounded p-0.5 text-base-content/60 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-base-content/15"
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
						<div class="mr-2 flex items-center rounded-lg bg-base-content/5 px-2 py-0.5">
							<span class="mr-2 text-[10px] font-bold uppercase opacity-60">Layout</span>
							<button
								onclick={() => (diffViewType = 'split')}
								class="btn h-5 min-h-5 rounded-md px-1.5 font-bold btn-xs {diffViewType === 'split'
									? 'btn-primary'
									: 'btn-ghost'}"
							>
								Split
							</button>
							<button
								onclick={() => (diffViewType = 'inline')}
								class="btn h-5 min-h-5 rounded-md px-1.5 font-bold btn-xs {diffViewType === 'inline'
									? 'btn-primary'
									: 'btn-ghost'}"
							>
								Inline
							</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Active Editor Body Viewports -->
			<div class="relative flex h-full w-full flex-1 flex-col overflow-hidden">
				<!-- TAB VIEW: WELCOME DASHBOARD -->
				{#if activeTabId === 'welcome'}
					<div
						class="vscode-scrollbar flex h-full flex-1 flex-col gap-6 overflow-y-auto bg-base-100 p-6 md:grid md:grid-cols-12"
					>
						<!-- Header splash -->
						<div
							class="col-span-12 flex flex-col items-start justify-between gap-4 border-b border-base-content/10 pb-6 sm:flex-row sm:items-center"
						>
							<div class="flex items-center gap-4">
								<div
									class="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-secondary text-primary-content shadow-xl shadow-primary/10"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-8 w-8"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
										></path><polyline points="14 2 14 8 20 8"></polyline></svg
									>
								</div>
								<div class="text-left">
									<h1
										class="bg-linear-to-r from-primary via-secondary to-accent bg-clip-text text-3xl font-black tracking-tighter text-transparent uppercase"
									>
										ohmycode
									</h1>
									<p class="mt-1 font-mono text-xs font-black tracking-widest uppercase opacity-45">
										Audit Trail Developer Workspace // Active
									</p>
								</div>
							</div>

							<!-- Picker & Watcher status triggers in welcome screen -->
							<div class="flex flex-wrap items-center gap-2">
								{#if projectPath}
									<span
										class="rounded-xl border border-base-content/15 bg-base-200 px-3 py-2 font-mono text-[10px] font-medium opacity-80 shadow-inner"
									>
										{projectPath}
									</span>
								{/if}
								<button
									onclick={() => openFolderPicker('project')}
									class="btn rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all btn-sm btn-primary"
								>
									Pick Workspace Folder
								</button>
							</div>
						</div>

						<!-- Left deck: start and quick links (Col 4) -->
						<div class="col-span-12 flex flex-col gap-6 lg:col-span-4">
							<div
								class="hover-lift glass-panel card flex flex-col gap-4 rounded-2xl border border-base-content/8 p-5 text-left shadow-xl"
							>
								<h3
									class="border-b border-base-content/8 pb-2 text-[10px] font-black tracking-widest uppercase opacity-50"
								>
									Start Log Actions
								</h3>
								<div class="flex flex-col gap-2">
									<button
										onclick={() => {
											activeSidebar = 'source-control';
											isSidebarCollapsed = false;
										}}
										class="btn justify-start gap-2 rounded-xl border-base-content/10 bg-base-100 text-xs font-bold btn-outline btn-sm hover:border-primary/20 hover:bg-primary/10 hover:text-primary"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg
										>
										Record New Activity Duty
									</button>
									<button
										onclick={() => {
											activeSidebar = 'history';
											isSidebarCollapsed = false;
										}}
										class="btn justify-start gap-2 rounded-xl border-base-content/10 bg-base-100 text-xs font-bold btn-outline btn-sm hover:border-secondary/20 hover:bg-secondary/10 hover:text-secondary"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"
											></polyline></svg
										>
										Search Log History
									</button>
								</div>
							</div>

							<!-- Productivity HUD widgets -->
							<div
								class="hover-lift glass-panel card flex flex-col gap-4 rounded-2xl border border-base-content/8 p-5 text-left shadow-xl"
							>
								<h3
									class="border-b border-base-content/8 pb-2 text-[10px] font-black tracking-widest uppercase opacity-50"
								>
									Productivity Console
								</h3>

								<div class="grid grid-cols-2 gap-3">
									<div
										class="flex flex-col items-start rounded-xl border border-primary/15 bg-primary/5 p-3 transition-colors hover:bg-primary/10"
									>
										<span class="text-[9px] font-bold tracking-wider uppercase opacity-50"
											>Duties Logged</span
										>
										<span class="mt-1 text-2xl font-black text-primary"
											>{productivityStats.totalLogged}</span
										>
									</div>
									<div
										class="flex flex-col items-start rounded-xl border border-secondary/15 bg-secondary/5 p-3 transition-colors hover:bg-secondary/10"
									>
										<span class="text-[9px] font-bold tracking-wider uppercase opacity-50"
											>Backups Stored</span
										>
										<span class="mt-1 text-2xl font-black text-secondary"
											>{productivityStats.filesCount}</span
										>
									</div>
									<div
										class="col-span-2 flex flex-col items-start rounded-xl border border-accent/15 bg-accent/5 p-3 transition-colors hover:bg-accent/10"
									>
										<span class="text-[10px] font-bold uppercase opacity-40">Git Accumulations</span
										>
										<span
											class="mt-1 flex items-center gap-2 font-mono text-xs font-bold text-base-content/80"
										>
											<span class="font-black text-success"
												>+{productivityStats.additions} insertions</span
											>
											<span class="opacity-40">|</span>
											<span class="font-black text-error"
												>-{productivityStats.deletions} deletions</span
											>
										</span>
									</div>
								</div>
							</div>

							<!-- Helpful VS Code system tips -->
							<div
								class="hover-lift glass-panel card flex flex-col gap-3 rounded-2xl border border-base-content/8 p-5 text-left shadow-xl"
							>
								<h3
									class="border-b border-base-content/5 pb-2 text-xs font-black tracking-wider uppercase opacity-60"
								>
									Workspace Shortcuts
								</h3>
								<div class="flex flex-col gap-2 font-mono text-[10px] leading-relaxed opacity-75">
									<div class="flex items-center justify-between">
										<span class="font-bold">Stage file:</span>
										<kbd class="kbd border-base-content/10 bg-base-100 kbd-xs font-bold"
											>Drag and drop</kbd
										>
									</div>
									<div class="flex items-center justify-between">
										<span class="font-bold">Save commit:</span>
										<kbd class="kbd border-base-content/10 bg-base-100 kbd-xs font-bold"
											>Ctrl + Enter</kbd
										>
									</div>
									<div class="flex items-center justify-between">
										<span class="font-bold">Modify file code:</span>
										<kbd class="kbd border-base-content/10 bg-base-100 kbd-xs font-bold"
											>Double-click addition</kbd
										>
									</div>
									<div class="flex items-center justify-between">
										<span class="font-bold">View raw backup:</span>
										<kbd class="kbd border-base-content/10 bg-base-100 kbd-xs font-bold"
											>Click file badge</kbd
										>
									</div>
								</div>
							</div>
						</div>

						<!-- Right deck: recent duty cards list (Col 8) -->
						<div class="col-span-12 flex flex-col gap-4 text-left lg:col-span-8">
							<div class="flex items-center justify-between border-b border-base-content/10 pb-2">
								<div class="flex items-center gap-2">
									<button
										onclick={() => (activeLogHistoryTab = 'git')}
										class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black tracking-wider uppercase transition-all {activeLogHistoryTab ===
										'git'
											? 'bg-primary text-primary-content shadow-sm shadow-primary/20'
											: 'bg-base-200/60 opacity-60 hover:opacity-100'}"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="10"
											height="10"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
											><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"
											></circle></svg
										>
										Git Repository Graph ({gitCommits.length})
									</button>
									<button
										onclick={() => (activeLogHistoryTab = 'local')}
										class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black tracking-wider uppercase transition-all {activeLogHistoryTab ===
										'local'
											? 'bg-primary text-primary-content shadow-sm shadow-primary/20'
											: 'bg-base-200/60 opacity-60 hover:opacity-100'}"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="10"
											height="10"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
											><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline
												points="7 10 12 15 17 10"
											></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg
										>
										Local Duty Backups ({kanbanStore.tasks.length})
									</button>
								</div>
							</div>

							<div
								class="vscode-scrollbar flex max-h-[60vh] flex-1 flex-col gap-2 overflow-y-auto pr-1"
							>
								{#if activeLogHistoryTab === 'git'}
									{#each gitCommits as commit, index (commit.id)}
										<!-- Timeline Row Container -->
										<div class="relative py-1 pl-7">
											<!-- Vertical line connecting dots -->
											{#if index < gitCommits.length - 1}
												<div
													class="absolute top-[24px] bottom-[-24px] left-[13px] w-0.5 {isCommitOutgoing(
														index
													)
														? 'bg-primary'
														: 'bg-secondary/40'}"
												></div>
											{/if}

											<!-- Colored Dot -->
											<div
												class="absolute top-[14px] left-[9px] z-10 flex h-2.5 w-2.5 items-center justify-center"
											>
												{#if isCommitOutgoing(index)}
													<div
														class="h-2.5 w-2.5 rounded-full border-2 border-primary bg-base-100 ring-2 ring-primary/20"
													></div>
												{:else}
													<div
														class="h-2.5 w-2.5 rounded-full bg-secondary ring-2 ring-secondary/20"
													></div>
												{/if}
											</div>

											<!-- Interactive Row Card -->
											<div
												onclick={() => toggleCommitAccordion(commit)}
												onkeydown={(e) => e.key === 'Enter' && toggleCommitAccordion(commit)}
												role="button"
												tabindex="0"
												class="group flex cursor-pointer flex-col gap-2 rounded-xl border border-base-content/5 bg-base-200/40 p-3 text-left transition-all select-none hover:border-primary/20 hover:bg-base-200/90"
											>
												<div
													class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
												>
													<!-- Title / Commit Summary -->
													<div
														class="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center"
													>
														<!-- Short Monospace Hash Badge -->
														<span
															class="w-fit rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-primary uppercase"
														>
															{commit.id.slice(0, 7)}
														</span>
														<span
															class="truncate text-[12px] font-bold text-base-content transition-colors group-hover:text-primary"
														>
															{commit.title}
														</span>
													</div>

													<!-- Branch Decorator Tags with Premium Icons -->
													{#if commit.refs}
														<div class="flex flex-wrap gap-1">
															{#each commit.refs.split(',') as rawRef (rawRef)}
																{@const ref = rawRef.trim()}
																{#if ref.includes('HEAD ->')}
																	<span
																		class="badge h-4.5 gap-1 border-primary/20 bg-primary/10 px-2 font-mono text-[9px] font-bold text-primary"
																	>
																		<svg
																			xmlns="http://www.w3.org/2000/svg"
																			width="9"
																			height="9"
																			viewBox="0 0 24 24"
																			fill="none"
																			stroke="currentColor"
																			stroke-width="3"
																			stroke-linecap="round"
																			stroke-linejoin="round"
																			><circle cx="12" cy="12" r="10" /><circle
																				cx="12"
																				cy="12"
																				r="3"
																			/></svg
																		>
																		{ref.replace('HEAD ->', '').trim()}
																	</span>
																{:else if ref.toLowerCase().includes('origin/') || ref
																		.toLowerCase()
																		.includes('upstream/')}
																	<span
																		class="badge h-4.5 gap-1 border-secondary/20 bg-secondary/10 px-2 font-mono text-[9px] font-bold text-secondary"
																	>
																		<svg
																			xmlns="http://www.w3.org/2000/svg"
																			width="9"
																			height="9"
																			viewBox="0 0 24 24"
																			fill="none"
																			stroke="currentColor"
																			stroke-width="3"
																			stroke-linecap="round"
																			stroke-linejoin="round"
																			><path
																				d="M17.5 19A3.5 3.5 0 0 0 21 15.5c0-2.79-2.54-4.5-5-4.5-.47 0-.89.09-1.3.26A5 5 0 0 0 5 13c0 2.2 1.8 4 4 4h8.5Z"
																			/></svg
																		>
																		{ref}
																	</span>
																{:else}
																	<span
																		class="badge h-4.5 border-base-content/10 bg-base-200 px-2 font-mono text-[9px] font-bold opacity-60"
																	>
																		{ref}
																	</span>
																{/if}
															{/each}
														</div>
													{/if}
												</div>

												<div class="flex items-center justify-between text-[11px] opacity-50">
													<span>Author: {commit.author}</span>
													<div class="flex items-center gap-1.5">
														<span class="font-mono">{commit.date}</span>
														{#if index === 0}
															<button
																onclick={(e) => {
																	e.stopPropagation();
																	handleUndoCommit(commit);
																}}
																class="btn btn-square text-warning/70 btn-ghost transition-colors btn-xs hover:bg-warning/10 hover:text-warning"
																title="Undo Last Commit"
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
																	><path d="M3 7v6h6" /><path
																		d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
																	/></svg
																>
															</button>
														{/if}
													</div>
												</div>

												<!-- Accordion Panel Details -->
												{#if expandedCommitId === commit.id}
													<div
														class="mt-2 flex flex-col gap-2 border-t border-base-content/10 pt-2"
														transition:slide
													>
														{#if loadingCommitId === commit.id}
															<div
																class="flex items-center gap-2 py-2 text-xs font-semibold text-primary"
															>
																<span class="loading loading-xs loading-spinner"></span>
																<span>Loading modified files...</span>
															</div>
														{:else if commit.files && commit.files.length > 0}
															<div class="flex flex-col gap-1">
																<p
																	class="font-mono text-[9px] tracking-widest uppercase opacity-45"
																>
																	Modified Files
																</p>
																{#each commit.files as f (f.file)}
																	<div
																		class="flex items-center justify-between gap-4 rounded-lg border border-base-content/5 bg-base-200/50 px-2.5 py-1.5 font-mono text-[10px] transition-all hover:bg-base-200"
																	>
																		<span class="truncate text-base-content/95">{f.file}</span>
																		<span
																			class="badge scale-90 border-transparent badge-xs font-bold {f.type ===
																			'Added'
																				? 'bg-success/20 text-success'
																				: f.type === 'Deleted'
																					? 'bg-error/20 text-error'
																					: 'bg-warning/20 text-warning'}"
																		>
																			{f.status || 'M'}
																		</span>
																	</div>
																{/each}
															</div>
														{:else}
															<p class="py-1 font-mono text-xs opacity-40">
																No file changes detected.
															</p>
														{/if}
													</div>
												{/if}
											</div>
										</div>
									{:else}
										{#if isLoadingCommits}
											<div
												class="py-20 text-center opacity-60 flex flex-col items-center justify-center gap-3 bg-base-200/10 rounded-3xl"
											>
												<span class="loading loading-spinner loading-md text-primary"></span>
												<span class="text-xs font-semibold">Reading live Git history Graph...</span>
											</div>
										{:else}
											<div
												class="py-20 text-center opacity-30 border-2 border-dashed border-base-content/15 rounded-3xl mt-2 flex flex-col items-center justify-center gap-3 bg-base-200/10"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="w-12 h-12 text-primary"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="1.5"
													><circle cx="12" cy="12" r="10"></circle><polyline
														points="12 6 12 12 16 14"
													></polyline></svg
												>
												<div>
													<p class="text-sm font-bold">No Git commits found in this repository.</p>
												</div>
											</div>
										{/if}
									{/each}
								{:else}
									{#each kanbanStore.tasks as task, index (task.id)}
										<!-- Timeline Row Container -->
										<div class="relative py-1 pl-7">
											<!-- Vertical line connecting dots -->
											{#if index < kanbanStore.tasks.length - 1}
												<div
													class="absolute top-[24px] bottom-[-24px] left-[13px] w-0.5 bg-success/30"
												></div>
											{/if}

											<!-- Colored Dot -->
											<div
												class="absolute top-[14px] left-[9px] z-10 flex h-2.5 w-2.5 items-center justify-center"
											>
												<div
													class="h-2.5 w-2.5 rounded-full bg-success ring-2 ring-success/20"
												></div>
											</div>

											<!-- Interactive Row Card -->
											<div
												onclick={() => toggleCommitAccordion(task)}
												onkeydown={(e) => e.key === 'Enter' && toggleCommitAccordion(task)}
												role="button"
												tabindex="0"
												class="group flex cursor-pointer flex-col gap-2 rounded-xl border border-base-content/5 bg-base-200/40 p-3 text-left transition-all select-none hover:border-primary/20 hover:bg-base-200/90"
											>
												<div
													class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
												>
													<!-- Title / Conventional Commit Summary -->
													<div
														class="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center"
													>
														<!-- Short Monospace Hash Badge -->
														<span
															class="w-fit rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-primary uppercase"
														>
															{task.id.slice(0, 7)}
														</span>
														<span
															class="truncate text-[12px] font-bold text-base-content transition-colors group-hover:text-primary"
														>
															{task.title}
														</span>

														<!-- Branch Badge -->
														<span
															class="badge h-4 border-secondary/20 bg-secondary/10 px-1.5 font-mono text-[9px] font-bold text-secondary"
														>
															main
														</span>
													</div>

													<div class="flex items-center gap-2">
														<!-- Backups count badge -->
														<span
															class="badge gap-1 border-base-content/10 bg-base-100 px-2 py-1 badge-sm font-semibold opacity-75"
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="9"
																height="9"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="2.5"
																><path
																	d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
																></path><polyline points="14 2 14 8 20 8"></polyline></svg
															>
															{task.files.length} backups
														</span>

														<!-- Actions on the right -->
														<div
															class="flex items-center gap-1 border-l border-base-content/10 pl-1"
														>
															<!-- Undo Last Commit or Delete Log button -->
															{#if task.id === kanbanStore.tasks[0]?.id && task.gitCommitHash}
																<button
																	onclick={(e) => {
																		e.stopPropagation();
																		kanbanStore.removeTask(task.id);
																	}}
																	class="btn btn-square text-warning/70 btn-ghost transition-colors btn-xs hover:bg-warning/10 hover:text-warning"
																	title="Undo Last Commit & Delete Log"
																>
																	<svg
																		xmlns="http://www.w3.org/2000/svg"
																		width="13"
																		height="13"
																		viewBox="0 0 24 24"
																		fill="none"
																		stroke="currentColor"
																		stroke-width="2.5"
																		stroke-linecap="round"
																		stroke-linejoin="round"
																		><path d="M3 7v6h6" /><path
																			d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
																		/></svg
																	>
																</button>
															{:else}
																<button
																	onclick={(e) => {
																		e.stopPropagation();
																		kanbanStore.removeTask(task.id);
																	}}
																	class="btn btn-square text-error/60 btn-ghost transition-colors btn-xs hover:bg-error/10 hover:text-error"
																	title="Delete Log Entry"
																>
																	<svg
																		xmlns="http://www.w3.org/2000/svg"
																		width="13"
																		height="13"
																		viewBox="0 0 24 24"
																		fill="none"
																		stroke="currentColor"
																		stroke-width="2.5"
																		><line x1="18" y1="6" x2="6" y2="18"></line><line
																			x1="6"
																			y1="6"
																			x2="18"
																			y2="18"
																		></line></svg
																	>
																</button>
															{/if}
														</div>
													</div>
												</div>

												{#if task.description || task.notes}
													<p
														class="truncate text-left text-[11px] leading-relaxed font-medium opacity-50"
													>
														{task.description ? task.description + ' — ' : ''}{task.notes || ''}
													</p>
												{/if}

												<div class="flex items-center justify-between text-[11px] opacity-40">
													<span class="font-mono">
														{new Date(task.createdAt).toLocaleString('en-GB', {
															day: '2-digit',
															month: 'short',
															hour: '2-digit',
															minute: '2-digit'
														})}
													</span>
												</div>

												<!-- Accordion Panel Details -->
												{#if expandedCommitId === task.id}
													<div
														class="mt-2 flex flex-col gap-2 border-t border-base-content/10 pt-2"
														transition:slide
													>
														{#if task.files && task.files.length > 0}
															<div class="flex flex-col gap-1">
																<p
																	class="font-mono text-[9px] tracking-widest uppercase opacity-45"
																>
																	Backup Files
																</p>
																{#each task.files as file (file)}
																	<div
																		class="flex items-center justify-between gap-4 rounded-lg border border-base-content/5 bg-base-200/50 px-2.5 py-1 font-mono text-[10px] transition-all hover:bg-base-200"
																	>
																		<span class="truncate text-base-content/95">{file}</span>
																		<button
																			onclick={(e) => {
																				e.stopPropagation();
																				downloadBackupFile(task, file);
																			}}
																			class="btn rounded-md font-bold text-primary btn-ghost btn-xs hover:bg-primary/10"
																		>
																			Download
																		</button>
																	</div>
																{/each}
															</div>
														{:else}
															<p class="py-1 font-mono text-xs opacity-40">
																No backup files found.
															</p>
														{/if}
													</div>
												{/if}
											</div>
										</div>
									{:else}
										<div
											class="py-20 text-center opacity-30 border-2 border-dashed border-base-content/15 rounded-3xl mt-2 flex flex-col items-center justify-center gap-3 bg-base-200/10"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="w-12 h-12 text-primary"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="1.5"
												><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"
												></polyline></svg
											>
											<div>
												<p class="text-sm font-bold">No logs or duties filed today.</p>
												<p class="text-xs mt-1">
													Staged file modifications on the left sidebar to generate reports.
												</p>
											</div>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					</div>

					<!-- TAB VIEW: INTERACTIVE DIFF EDITOR -->
				{:else if activeTabId.startsWith('diff-')}
					{@const tab = openTabs.find((t) => t.id === activeTabId)}
					{#if tab && tab.file}
						{@const item = tab.file}
						<div
							class="flex h-full flex-1 flex-col overflow-hidden bg-base-100 text-base-content select-text"
						>
							<!-- Sub toolbar for diff actions -->
							<div
								class="flex h-9 shrink-0 items-center justify-between border-b border-base-content/10 bg-base-200 px-4 text-xs select-none"
							>
								<div class="flex items-center gap-2.5">
									<span
										class="badge border-primary/20 bg-primary/10 font-mono badge-sm font-bold text-primary"
										>{item.type}</span
									>
									<span
										class="max-w-sm truncate font-mono text-[11px] font-semibold text-base-content/80"
										>{item.file}</span
									>
								</div>

								<div class="flex items-center gap-2">
									{#if editingFile === item.file}
										<!-- Inline Editor Controls -->
										<button
											onclick={saveInlineEdit}
											class="btn h-6 rounded-md px-2.5 text-[10px] font-bold btn-xs btn-success"
											disabled={savingEditor}
										>
											{savingEditor ? 'Saving...' : 'Save File'}
										</button>
										<button
											onclick={cancelInlineEdit}
											class="btn h-6 rounded-md border border-base-content/10 px-2.5 text-[10px] font-bold text-base-content btn-ghost btn-xs"
											disabled={savingEditor}
										>
											Cancel
										</button>
									{:else if item.type !== 'Deleted'}
										<span
											class="mr-2 font-mono text-[10px] font-semibold italic opacity-40 select-none"
											>Double click green line to edit inline</span
										>
									{/if}

									<span class="text-base-content/25">|</span>

									<button
										onclick={(e) => moveFile(e, item.file, !tab.isStaged)}
										class="btn h-6 rounded-md border-base-content/15 px-2 text-[10px] font-bold tracking-wider uppercase btn-outline btn-xs hover:border-primary hover:bg-primary hover:text-primary-content"
									>
										{tab.isStaged ? 'Unstage file' : 'Stage file'}
									</button>
									{#if !tab.isStaged}
										<button
											onclick={() => discardChanges(item.file)}
											class="btn h-6 rounded-md px-2 text-[10px] font-bold tracking-wider uppercase btn-outline btn-xs btn-error"
										>
											Discard
										</button>
									{/if}
								</div>
							</div>

							{#if editingError}
								<div class="alert shrink-0 rounded-none px-4 py-2 text-xs alert-error">
									<strong>Editor Error:</strong>
									{editingError}
								</div>
							{/if}

							<!-- Diff editor frame -->
							<div
								class="vscode-scrollbar relative h-full flex-1 bg-black/95 text-[#f8f8f2] {diffViewType ===
								'split'
									? 'overflow-hidden'
									: 'overflow-auto'}"
							>
								{#if loadingEditor}
									<div class="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
										<span class="loading loading-md loading-spinner text-primary"></span>
									</div>
								{/if}

								<!-- RENDER: SPLIT DIFF VIEW -->
								{#if diffViewType === 'split'}
									{#if editingRows && editingRows.length > 0}
										<div
											class="flex h-full w-full overflow-hidden font-mono text-[11px] leading-relaxed select-text"
										>
											<!-- Left Pane (Original) -->
											<div
												id="git-diff-left-{item.id}"
												class="vscode-scrollbar h-full min-w-0 flex-1 overflow-auto bg-black/95 p-2"
												onscroll={(e) => handleScroll(e, `git-diff-right-${item.id}`)}
											>
												{#each editingRows as row (row.key)}
													<div
														class="flex min-h-[19px] items-center border-b border-white/5 transition-colors hover:bg-white/5"
													>
														{#if row.kind === 'hunk'}
															<div
																class="w-full bg-[#21252b] px-3 py-0.5 font-semibold text-[#5c6370] select-none"
															>
																{row.content}
															</div>
														{:else if row.kind === 'remove'}
															<div
																class="flex h-full w-full items-center bg-[#3a1d1d] px-2 text-[#ff8080]"
															>
																<span
																	class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-30 select-none"
																	>{row.oldNumber}</span
																>
																<span class="shrink-0 pr-2 opacity-40 select-none">-</span>
																<span class="w-full whitespace-pre"
																	>{@html renderLineContent(row.content)}</span
																>
															</div>
														{:else if row.kind === 'add'}
															<div
																class="h-full w-full opacity-35 select-none"
																style="background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.02) 5px, rgba(255,255,255,0.02) 10px); min-height: 18px;"
															></div>
														{:else}
															<!-- Context -->
															<div
																class="flex h-full w-full items-center bg-transparent px-2 opacity-65"
															>
																<span
																	class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-20 select-none"
																	>{row.oldNumber}</span
																>
																<span class="w-3 shrink-0 select-none"></span>
																<span class="w-full whitespace-pre"
																	>{@html renderLineContent(row.content)}</span
																>
															</div>
														{/if}
													</div>
												{/each}
											</div>

											<!-- Central Diff Track Bar -->
											<div
												class="relative h-full w-2 shrink-0 border-x border-white/10 bg-base-300/10 select-none"
											>
												{#each editingRows as row, idx (row.key)}
													{#if row.kind === 'remove'}
														<div
															class="absolute right-0 left-0 h-[3px] bg-error/80"
															style="top: {(idx / editingRows.length) * 100}%"
														></div>
													{:else if row.kind === 'add'}
														<div
															class="absolute right-0 left-0 h-[3px] bg-success/80"
															style="top: {(idx / editingRows.length) * 100}%"
														></div>
													{/if}
												{/each}
											</div>

											<!-- Right Pane (Modified) -->
											<div
												id="git-diff-right-{item.id}"
												class="vscode-scrollbar h-full min-w-0 flex-1 overflow-auto bg-black/95 p-2"
												onscroll={(e) => handleScroll(e, `git-diff-left-${item.id}`)}
											>
												{#each editingRows as row, rIdx (row.key)}
													<div
														class="flex min-h-[19px] items-center border-b border-white/5 transition-colors hover:bg-white/5"
													>
														{#if row.kind === 'hunk'}
															<div
																class="w-full bg-[#21252b] px-3 py-0.5 font-semibold text-[#5c6370] select-none"
															>
																{row.content}
															</div>
														{:else if row.kind === 'add'}
															<div
																class="flex h-full w-full items-center bg-[#1b2f1c] px-2 text-[#80ff80]"
															>
																<span
																	class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-30 select-none"
																	>{row.newNumber}</span
																>
																<span class="shrink-0 pr-2 opacity-40 select-none">+</span>
																{#if row.editable && editingDiffId === item.id}
																	<input
																		type="text"
																		value={row.content}
																		oninput={(e) =>
																			updateEditingRow(
																				rIdx,
																				(e.currentTarget as HTMLInputElement).value
																			)}
																		class="h-full w-full border-0 bg-transparent p-0 font-mono text-[11px] text-[#a6e22e] focus:outline-none"
																		spellcheck="false"
																	/>
																{:else}
																	<span
																		role="button"
																		tabindex="0"
																		class="w-full whitespace-pre"
																		ondblclick={() => startInlineEdit(item)}
																		onkeydown={(e) => e.key === 'Enter' && startInlineEdit(item)}
																		title="Double click to edit">{row.content}</span
																	>
																{/if}
															</div>
														{:else if row.kind === 'remove'}
															<div
																class="h-full w-full opacity-35 select-none"
																style="background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.02) 5px, rgba(255,255,255,0.02) 10px); min-height: 18px;"
															></div>
														{:else}
															<!-- Context -->
															<div
																class="flex h-full w-full items-center bg-transparent px-2 opacity-65"
															>
																<span
																	class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-20 select-none"
																	>{row.newNumber}</span
																>
																<span class="w-3 shrink-0 select-none"></span>
																<span class="w-full whitespace-pre"
																	>{@html renderLineContent(row.content)}</span
																>
															</div>
														{/if}
													</div>
												{/each}
											</div>
										</div>
									{:else}
										<div class="p-4 font-mono text-xs whitespace-pre opacity-60">
											{item.diff || 'No content changes detected'}
										</div>
									{/if}

									<!-- RENDER: INLINE DIFF VIEW -->
								{:else}
									<div
										class="flex min-h-full min-w-max flex-col p-2 font-mono text-[11px] leading-relaxed select-text"
									>
										{#each editingRows as row, rIdx (row.key)}
											<div
												class="flex min-h-[19px] border-b border-white/5 px-2 align-middle transition-colors hover:bg-white/5"
											>
												{#if row.kind === 'hunk'}
													<div
														class="w-full bg-[#21252b] px-3 py-0.5 font-semibold text-[#5c6370] select-none"
													>
														{row.content}
													</div>
												{:else if row.kind === 'remove'}
													<div class="flex w-full items-center bg-[#3a1d1d] py-0.5 text-[#ff8080]">
														<span
															class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-30 select-none"
															>{row.oldNumber}</span
														>
														<span class="w-9 shrink-0"></span>
														<span class="shrink-0 pr-2 opacity-40 select-none">-</span>
														<span class="whitespace-pre"
															>{@html renderLineContent(row.content)}</span
														>
													</div>
												{:else if row.kind === 'add'}
													<div class="flex w-full items-center bg-[#1b2f1c] py-0.5 text-[#80ff80]">
														<span class="w-9 shrink-0"></span>
														<span
															class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-30 select-none"
															>{row.newNumber}</span
														>
														<span class="shrink-0 pr-2 opacity-40 select-none">+</span>

														{#if row.editable && editingDiffId === item.id}
															<input
																type="text"
																value={row.content}
																oninput={(e) =>
																	updateEditingRow(
																		rIdx,
																		(e.currentTarget as HTMLInputElement).value
																	)}
																class="h-full w-full border-0 bg-transparent p-0 font-mono text-[11px] text-[#a6e22e] focus:outline-none"
																spellcheck="false"
															/>
														{:else}
															<span
																role="button"
																tabindex="0"
																class="whitespace-pre"
																ondblclick={() => startInlineEdit(item)}
																onkeydown={(e) => e.key === 'Enter' && startInlineEdit(item)}
																title="Double click to edit">{row.content}</span
															>
														{/if}
													</div>
												{:else}
													<!-- Context -->
													<div class="flex w-full items-center bg-transparent py-0.5 opacity-65">
														<span
															class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-20 select-none"
															>{row.oldNumber}</span
														>
														<span
															class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-20 select-none"
															>{row.newNumber}</span
														>
														<span class="w-3 shrink-0"></span>
														<span class="whitespace-pre"
															>{@html renderLineContent(row.content)}</span
														>
													</div>
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
				{:else if activeTabId.startsWith('manual-compare-')}
					{@const tab = openTabs.find((t) => t.id === activeTabId)}
					{#if tab && tab.comparisonId}
						{@const compIndex = manualComparisons.findIndex((c) => c.id === tab.comparisonId)}
						{#if compIndex !== -1}
							{@const comp = manualComparisons[compIndex]}
							<div
								class="flex h-full flex-1 flex-col overflow-hidden bg-base-100 text-base-content select-text"
							>
								<!-- Toolbar -->
								<div
									class="flex h-9 shrink-0 items-center justify-between border-b border-base-content/10 bg-base-200 px-4 text-xs select-none"
								>
									<div class="flex items-center gap-3">
										<input
											type="text"
											bind:value={manualComparisons[compIndex].title}
											class="input input-xs w-48 rounded border border-base-content/10 bg-base-100 text-xs font-bold"
											placeholder="Comparison Name"
										/>
									</div>
									<div class="flex items-center gap-2">
										<div class="mr-2 flex items-center rounded-lg bg-base-content/5 px-2 py-0.5">
											<span class="mr-2 text-[10px] font-bold uppercase opacity-60">Mode</span>
											<button
												onclick={() => (manualComparisons[compIndex].viewMode = 'edit')}
												class="btn h-5 min-h-5 rounded-md px-1.5 font-bold btn-xs {comp.viewMode ===
												'edit'
													? 'btn-primary'
													: 'btn-ghost'}"
											>
												Edit Code
											</button>
											<button
												onclick={() => (manualComparisons[compIndex].viewMode = 'diff')}
												class="btn h-5 min-h-5 rounded-md px-1.5 font-bold btn-xs {comp.viewMode ===
												'diff'
													? 'btn-primary'
													: 'btn-ghost'}"
											>
												Diff View
											</button>
										</div>

										{#if comp.viewMode === 'diff'}
											<div class="flex items-center rounded-lg bg-base-content/5 px-2 py-0.5">
												<span class="mr-2 text-[10px] font-bold uppercase opacity-60">Layout</span>
												<button
													onclick={() => (manualComparisons[compIndex].layout = 'split')}
													class="btn h-5 min-h-5 rounded-md px-1.5 font-bold btn-xs {comp.layout ===
													'split'
														? 'btn-primary'
														: 'btn-ghost'}"
												>
													Split
												</button>
												<button
													onclick={() => (manualComparisons[compIndex].layout = 'inline')}
													class="btn h-5 min-h-5 rounded-md px-1.5 font-bold btn-xs {comp.layout ===
													'inline'
														? 'btn-primary'
														: 'btn-ghost'}"
												>
													Inline
												</button>
											</div>
										{/if}
									</div>
								</div>

								<!-- Workspace editor area -->
								<div class="relative flex-1 overflow-hidden">
									{#if comp.viewMode === 'edit'}
										<!-- Side by side textareas -->
										<div
											class="grid h-full grid-cols-2 divide-x divide-base-content/10 bg-black/95"
										>
											<div class="flex h-full flex-col p-4">
												<div
													class="mb-2 font-mono text-[10px] font-bold tracking-widest text-[#5c6370] uppercase"
												>
													BEFORE (ORIGINAL)
												</div>
												<textarea
													bind:value={manualComparisons[compIndex].beforeCode}
													class="custom-scrollbar w-full flex-1 resize-none rounded border border-white/5 bg-transparent p-2 font-mono text-[11px] leading-relaxed text-[#f8f8f2] focus:outline-none"
													placeholder="Paste or type original code here..."
													spellcheck="false"
												></textarea>
											</div>
											<div class="flex h-full flex-col p-4">
												<div
													class="mb-2 font-mono text-[10px] font-bold tracking-widest text-[#5c6370] uppercase"
												>
													AFTER (MODIFIED)
												</div>
												<textarea
													bind:value={manualComparisons[compIndex].afterCode}
													class="custom-scrollbar w-full flex-1 resize-none rounded border border-white/5 bg-transparent p-2 font-mono text-[11px] leading-relaxed text-[#f8f8f2] focus:outline-none"
													placeholder="Paste or type modified code here..."
													spellcheck="false"
												></textarea>
											</div>
										</div>
									{:else}
										<!-- Render dynamic diff generated from beforeCode and afterCode -->
										{@const diffRows = diffManualLines(comp.beforeCode, comp.afterCode)}
										<div
											class="vscode-scrollbar h-full bg-black/95 p-2 text-[#f8f8f2] {comp.layout ===
											'split'
												? 'overflow-hidden'
												: 'overflow-auto'}"
										>
											{#if comp.layout === 'split'}
												<div
													class="flex h-full w-full overflow-hidden font-mono text-[11px] leading-relaxed select-text"
												>
													<div
														id="manual-diff-left-{comp.id}"
														class="vscode-scrollbar h-full min-w-0 flex-1 overflow-auto bg-black/95 p-2"
														onscroll={(e) => handleScroll(e, `manual-diff-right-${comp.id}`)}
													>
														{#each diffRows as row (row.key)}
															<div
																class="flex min-h-[19px] items-center border-b border-white/5 transition-colors hover:bg-white/5"
															>
																{#if row.kind === 'remove'}
																	<div
																		class="flex h-full w-full items-center bg-[#3a1d1d] px-2 text-[#ff8080]"
																	>
																		<span
																			class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-30 select-none"
																			>{row.oldNumber}</span
																		>
																		<span class="shrink-0 pr-2 opacity-40 select-none">-</span>
																		<span class="w-full whitespace-pre"
																			>{@html renderLineContent(row.content)}</span
																		>
																	</div>
																{:else if row.kind === 'add'}
																	<div
																		class="h-full w-full opacity-35 select-none"
																		style="background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.02) 5px, rgba(255,255,255,0.02) 10px); min-height: 18px;"
																	></div>
																{:else}
																	<!-- Context -->
																	<div
																		class="flex h-full w-full items-center bg-transparent px-2 opacity-65"
																	>
																		<span
																			class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-20 select-none"
																			>{row.oldNumber}</span
																		>
																		<span class="w-3 shrink-0 select-none"></span>
																		<span class="w-full whitespace-pre"
																			>{@html renderLineContent(row.content)}</span
																		>
																	</div>
																{/if}
															</div>
														{:else}
															<div class="p-8 text-center text-xs opacity-40 italic">
																No differences found. Code is identical.
															</div>
														{/each}
													</div>

													<!-- Central Diff Track Bar -->
													<div
														class="relative h-full w-2 shrink-0 border-x border-white/10 bg-base-300/10 select-none"
													>
														{#each diffRows as row, idx (row.key)}
															{#if row.kind === 'remove'}
																<div
																	class="absolute right-0 left-0 h-[3px] bg-error/80"
																	style="top: {(idx / diffRows.length) * 100}%"
																></div>
															{:else if row.kind === 'add'}
																<div
																	class="absolute right-0 left-0 h-[3px] bg-success/80"
																	style="top: {(idx / diffRows.length) * 100}%"
																></div>
															{/if}
														{/each}
													</div>

													<!-- Right Pane (Modified) -->
													<div
														id="manual-diff-right-{comp.id}"
														class="vscode-scrollbar h-full min-w-0 flex-1 overflow-auto bg-black/95 p-2"
														onscroll={(e) => handleScroll(e, `manual-diff-left-${comp.id}`)}
													>
														{#each diffRows as row (row.key)}
															<div
																class="flex min-h-[19px] items-center border-b border-white/5 transition-colors hover:bg-white/5"
															>
																{#if row.kind === 'add'}
																	<div
																		class="flex h-full w-full items-center bg-[#1b2f1c] px-2 text-[#80ff80]"
																	>
																		<span
																			class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-30 select-none"
																			>{row.newNumber}</span
																		>
																		<span class="shrink-0 pr-2 opacity-40 select-none">+</span>
																		<span class="w-full whitespace-pre"
																			>{@html renderLineContent(row.content)}</span
																		>
																	</div>
																{:else if row.kind === 'remove'}
																	<div
																		class="h-full w-full opacity-35 select-none"
																		style="background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.02) 5px, rgba(255,255,255,0.02) 10px); min-height: 18px;"
																	></div>
																{:else}
																	<!-- Context -->
																	<div
																		class="flex h-full w-full items-center bg-transparent px-2 opacity-65"
																	>
																		<span
																			class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-20 select-none"
																			>{row.newNumber}</span
																		>
																		<span class="w-3 shrink-0 select-none"></span>
																		<span class="w-full whitespace-pre"
																			>{@html renderLineContent(row.content)}</span
																		>
																	</div>
																{/if}
															</div>
														{:else}
															<div class="p-8 text-center text-xs opacity-40 italic">
																No differences found. Code is identical.
															</div>
														{/each}
													</div>
												</div>
											{:else}
												<!-- Inline layout -->
												<div
													class="flex min-h-full min-w-max flex-col font-mono text-[11px] leading-relaxed select-text"
												>
													{#each diffRows as row (row.key)}
														<div
															class="flex min-h-[19px] border-b border-white/5 px-2 align-middle transition-colors hover:bg-white/5"
														>
															{#if row.kind === 'remove'}
																<div
																	class="flex w-full items-center bg-[#3a1d1d] py-0.5 text-[#ff8080]"
																>
																	<span
																		class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-30 select-none"
																		>{row.oldNumber}</span
																	>
																	<span class="w-9 shrink-0"></span>
																	<span class="shrink-0 pr-2 opacity-40 select-none">-</span>
																	<span class="whitespace-pre"
																		>{@html renderLineContent(row.content)}</span
																	>
																</div>
															{:else if row.kind === 'add'}
																<div
																	class="flex w-full items-center bg-[#1b2f1c] py-0.5 text-[#80ff80]"
																>
																	<span class="w-9 shrink-0"></span>
																	<span
																		class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-30 select-none"
																		>{row.newNumber}</span
																	>
																	<span class="shrink-0 pr-2 opacity-40 select-none">+</span>
																	<span class="whitespace-pre"
																		>{@html renderLineContent(row.content)}</span
																	>
																</div>
															{:else}
																<!-- Context -->
																<div
																	class="flex w-full items-center bg-transparent py-0.5 opacity-65"
																>
																	<span
																		class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-20 select-none"
																		>{row.oldNumber}</span
																	>
																	<span
																		class="w-9 shrink-0 pr-2 text-right font-mono text-[9px] opacity-20 select-none"
																		>{row.newNumber}</span
																	>
																	<span class="w-3 shrink-0"></span>
																	<span class="whitespace-pre"
																		>{@html renderLineContent(row.content)}</span
																	>
																</div>
															{/if}
														</div>
													{:else}
														<div class="p-8 text-center text-xs opacity-40 italic">
															No differences found. Code is identical.
														</div>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					{/if}
				{:else}
					<!-- TAB VIEW: SPECIFIC LOG DETAIL AUDIT -->
					{#if activeTabId.startsWith('log-')}
						{@const tab = openTabs.find((t) => t.id === activeTabId)}
						{#if tab && tab.task}
							{@const task = tab.task}
							<div
								class="vscode-scrollbar flex h-full flex-1 flex-col overflow-y-auto bg-base-100 p-6 text-left select-text"
							>
								<div
									class="mb-6 flex items-start justify-between border-b border-base-content/10 pb-4"
								>
									<div>
										<span
											class="mb-2 badge rounded-xl border-success/30 bg-success/15 px-4 py-3 font-mono badge-lg font-bold tracking-wider text-success uppercase"
										>
											Log Entry Audited
										</span>
										<h2 class="text-2xl font-black tracking-tight">
											{task.description || task.title}
										</h2>
										<span class="font-mono text-xs opacity-45"
											>FILED TIMESTAMP: {new Date(task.createdAt).toLocaleString()}</span
										>
									</div>

									{#if task.id === kanbanStore.tasks[0]?.id && task.gitCommitHash}
										<button
											onclick={() => {
												kanbanStore.removeTask(task.id);
												closeTab(new MouseEvent('click'), tab.id);
											}}
											class="btn rounded-xl font-mono text-xs font-bold uppercase btn-outline btn-sm btn-warning"
										>
											Undo Last Commit & Delete Log
										</button>
									{:else}
										<button
											onclick={() => {
												if (
													confirm(
														'Are you sure you want to delete this duty from the history archive?'
													)
												) {
													kanbanStore.removeTask(task.id);
													closeTab(new MouseEvent('click'), tab.id);
												}
											}}
											class="btn rounded-xl font-mono text-xs font-bold uppercase btn-outline btn-sm btn-error"
										>
											Delete Log Entry
										</button>
									{/if}
								</div>

								<div class="grid grid-cols-1 gap-6 md:grid-cols-12">
									<!-- Details left -->
									<div class="flex flex-col gap-6 md:col-span-8">
										<!-- Commit message notes -->
										{#if task.notes}
											<div class="rounded-2xl border border-base-content/5 bg-base-200/50 p-5">
												<h4
													class="mb-3 font-mono text-[10px] font-black tracking-widest uppercase opacity-45"
												>
													COMMIT AUDIT DATA
												</h4>
												<p
													class="font-mono text-xs leading-relaxed whitespace-pre-wrap opacity-85 select-text"
												>
													{task.notes}
												</p>
											</div>
										{/if}

										<!-- backup download files listing -->
										{#if task.files && task.files.length > 0}
											<div class="flex flex-col gap-3">
												<h4
													class="font-mono text-[10px] font-black tracking-widest uppercase opacity-45"
												>
													BACKED-UP MODIFICATIONS
												</h4>
												<div class="flex flex-col gap-2">
													{#each task.files as file (file)}
														<div
															class="flex flex-col gap-2 rounded-xl border border-base-content/10 bg-base-200/40 p-3.5"
														>
															<div class="flex items-center justify-between">
																<div class="flex flex-col text-left">
																	<span class="font-mono text-xs font-semibold"
																		>{file.split(/[/\\]/).pop()}</span
																	>
																	<span class="mt-0.5 font-mono text-[9px] opacity-45">{file}</span>
																</div>

																<div class="flex items-center gap-1.5">
																	<!-- View Saved Diff button if diff exists -->
																	{#if hasSavedFileDiff(task, file)}
																		<button
																			onclick={() => toggleSavedFileDiff(task.id, file)}
																			class="btn btn-xs {isSavedFileDiffOpen(task.id, file)
																				? 'btn-primary'
																				: 'border-base-content/15 btn-outline'} rounded-md text-[10px] font-bold tracking-wider uppercase"
																		>
																			{isSavedFileDiffOpen(task.id, file)
																				? 'Hide Saved Diff'
																				: 'View Saved Diff'}
																		</button>
																	{/if}

																	<!-- Download backups trigger -->
																	<button
																		onclick={() => {
																			if (!task.projectPath) return;
																			const params = new URLSearchParams({
																				projectPath: task.projectPath,
																				file,
																				...(task.logFolderName
																					? { logFolder: task.logFolderName }
																					: { createdAt: String(task.createdAt) })
																			});
																			window.open(`/api/log/download?${params}`, '_blank');
																		}}
																		class="btn rounded-md text-[10px] font-bold tracking-wider uppercase btn-outline btn-xs"
																	>
																		Download Backup
																	</button>
																</div>
															</div>

															<!-- Expandable inline code-diff view of what has changed -->
															{#if getSavedFileDiff(task, file) && isSavedFileDiffOpen(task.id, file)}
																<div
																	class="mt-3 overflow-hidden rounded-lg border border-base-content/10 bg-[#1e1e1e] text-left text-white shadow-inner"
																>
																	<div
																		class="flex items-center justify-between border-b border-base-content/10 bg-base-300 px-3 py-1.5 font-mono text-[10px] font-bold uppercase opacity-65"
																	>
																		<span>Saved Diff Viewer</span>
																		<span class="font-mono text-[9px] font-bold text-success">
																			+{getSavedFileDiff(task, file)
																				.split('\n')
																				.filter(
																					(l: string) => l.startsWith('+') && !l.startsWith('+++')
																				).length} insertions
																			<span class="font-mono opacity-40">|</span>
																			<span class="font-mono text-error"
																				>-{getSavedFileDiff(task, file)
																					.split('\n')
																					.filter(
																						(l: string) => l.startsWith('-') && !l.startsWith('---')
																					).length} deletions</span
																			>
																		</span>
																	</div>
																	<div
																		class="vscode-scrollbar max-h-[40vh] overflow-x-auto p-2 font-mono text-[11px] leading-relaxed select-text"
																	>
																		{#each buildDiffEditorRows(getSavedFileDiff(task, file)) as row (row.key)}
																			<div class="flex min-h-[18px]">
																				{#if row.kind === 'hunk'}
																					<div
																						class="w-full bg-[#2d2d2d] px-3 py-0.5 font-mono text-[9px] font-semibold text-base-content/40 select-none"
																					>
																						{row.content}
																					</div>
																				{:else if row.kind === 'remove'}
																					<div
																						class="flex w-full items-center bg-[#3a1d1d] py-0.5 text-[#ff8080]"
																					>
																						<span
																							class="w-8 shrink-0 pr-2 text-right font-mono text-[9px] opacity-30 select-none"
																							>{row.oldNumber}</span
																						>
																						<span class="w-8 shrink-0 font-mono text-[9px]"></span>
																						<span class="pr-2 font-mono opacity-40 select-none"
																							>-</span
																						>
																						<span class="font-mono whitespace-pre"
																							>{row.content}</span
																						>
																					</div>
																				{:else if row.kind === 'add'}
																					<div
																						class="flex w-full items-center bg-[#1b2f1c] py-0.5 text-[#80ff80]"
																					>
																						<span class="w-8 shrink-0 font-mono text-[9px]"></span>
																						<span
																							class="w-8 shrink-0 pr-2 text-right font-mono text-[9px] opacity-30 select-none"
																							>{row.newNumber}</span
																						>
																						<span class="pr-2 font-mono opacity-40 select-none"
																							>+</span
																						>
																						<span class="font-mono whitespace-pre"
																							>{row.content}</span
																						>
																					</div>
																				{:else}
																					<div
																						class="flex w-full items-center bg-transparent py-0.5 opacity-60"
																					>
																						<span
																							class="w-8 shrink-0 pr-2 text-right font-mono text-[9px] opacity-20 select-none"
																							>{row.oldNumber}</span
																						>
																						<span
																							class="w-8 shrink-0 pr-2 text-right font-mono text-[9px] opacity-20 select-none"
																							>{row.newNumber}</span
																						>
																						<span class="w-3 shrink-0 font-mono text-[9px]"></span>
																						<span class="font-mono whitespace-pre"
																							>{row.content}</span
																						>
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
									<div class="flex flex-col gap-6 md:col-span-4">
										<!-- Directory specs -->
										<div
											class="flex flex-col gap-2 rounded-xl border border-base-content/5 bg-base-200/30 p-4 font-mono text-[10px]"
										>
											<span class="font-bold uppercase opacity-45">WORKSPACE STATS</span>
											<div>
												<span class="opacity-55">Path:</span>
												<span class="truncate font-bold select-text"
													>{task.projectPath || 'None'}</span
												>
											</div>
											<div>
												<span class="opacity-55">Type Tag:</span>
												<span class="font-bold select-text">{task.title}</span>
											</div>
											{#if task.logFolderName}
												<div>
													<span class="opacity-55">ID folder:</span>
													<span class="font-bold select-text">{task.logFolderName}</span>
												</div>
											{/if}
										</div>

										<!-- Modified functions list -->
										{#if task.functions && task.functions.length > 0}
											<div class="flex flex-col gap-2">
												<h4
													class="font-mono text-[10px] font-black tracking-widest uppercase opacity-45"
												>
													AFFECTED CODE SYMBOLS
												</h4>
												<div class="flex flex-wrap gap-1.5">
													{#each task.functions as func (func)}
														<span
															class="badge rounded-lg border border-secondary/25 bg-secondary/10 px-2.5 py-2 font-mono badge-sm text-[10px] font-bold tracking-wide text-secondary"
															>{func}()</span
														>
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
			</div>
		</main>
	</div>

	<StatusBar
		branch={currentBranch}
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
		class="pointer-events-none fixed top-0 left-0 z-9999 select-none"
		style="transform: translate({dragState.curX - dragState.offsetX}px, {dragState.curY -
			dragState.offsetY}px) rotate(1.5deg) scale(1.03); will-change: transform; width: {dragState.cardW}px;"
	>
		<div
			class="rounded-xl border-2 border-primary bg-black/90 p-3 text-white shadow-[0_15px_45px_rgba(0,0,0,0.5)]"
		>
			<div class="mb-1 flex items-center gap-2">
				<span class="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary"
				></span>
				<span class="truncate font-mono text-[10px] font-bold text-white/90"
					>{dragState.file.split(/[/\\]/).pop()}</span
				>
			</div>
			<div class="mb-1.5 truncate font-mono text-[8px] text-white/40">{dragState.file}</div>
			<div
				class="flex items-center gap-1 font-mono text-[8px] leading-none font-black tracking-wider text-primary uppercase"
			>
				{#if dragState.fromStaged}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="9"
						height="9"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
						><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg
					>
					unstage change
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="9"
						height="9"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
						><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg
					>
					stage change
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Integration of system config popups -->
<SettingsModal bind:open={showSettingsModal} />
