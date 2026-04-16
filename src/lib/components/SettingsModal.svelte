<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { onMount } from 'svelte';

	let { open = $bindable(false) } = $props();

	// ─── Settings State ────────────────────────────────────────────────
	let logStoragePath = $state('');
	let defaultLogsRoot = $state('');
	let currentLogsRoot = $state('');
	let isLoadingSettings = $state(false);
	let isSaving = $state(false);

	// ─── Export State ──────────────────────────────────────────────────
	let isExporting = $state(false);
	let exportStats = $state<{ logs: number; files: number } | null>(null);

	// ─── Import State ──────────────────────────────────────────────────
	let importFile = $state<File | null>(null);
	let isImporting = $state(false);
	let importFileInput: HTMLInputElement;

	// ─── Folder Picker State ───────────────────────────────────────────
	let showPicker = $state(false);
	let explorerPath = $state('');
	let explorerParent = $state('');
	let explorerDirs = $state<string[]>([]);
	let pathSep = $state('/');
	let isPickerLoading = $state(false);

	// ─── Feedback ──────────────────────────────────────────────────────
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	let messageTimer: ReturnType<typeof setTimeout>;

	function showMsg(type: 'success' | 'error', text: string) {
		clearTimeout(messageTimer);
		message = { type, text };
		messageTimer = setTimeout(() => (message = null), 4000);
	}

	// ─── Load settings on open ─────────────────────────────────────────
	$effect(() => {
		if (open) loadSettings();
	});

	async function loadSettings() {
		isLoadingSettings = true;
		try {
			const res = await fetch('/api/settings');
			const data = await res.json();
			if (data.success) {
				logStoragePath = data.settings.logStoragePath ?? '';
				defaultLogsRoot = data.defaultLogsRoot ?? '';
				currentLogsRoot = data.logsRoot ?? '';
			}
		} catch {
			showMsg('error', 'Failed to load settings');
		} finally {
			isLoadingSettings = false;
		}
	}

	async function saveStoragePath() {
		isSaving = true;
		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ logStoragePath: logStoragePath.trim() || null })
			});
			const data = await res.json();
			if (data.success) {
				currentLogsRoot = data.logsRoot;
				showMsg('success', 'Storage location saved!');
			} else {
				showMsg('error', data.error ?? 'Failed to save');
			}
		} catch {
			showMsg('error', 'Connection error');
		} finally {
			isSaving = false;
		}
	}

	function resetToDefault() {
		logStoragePath = '';
	}

	// ─── Folder Picker ─────────────────────────────────────────────────
	async function openPicker(navPath: string = '') {
		showPicker = true;
		isPickerLoading = true;
		try {
			const res = await fetch(`/api/git/picker?path=${encodeURIComponent(navPath)}`);
			const data = await res.json();
			if (data.success) {
				explorerPath = data.currentPath;
				explorerParent = data.parentPath;
				explorerDirs = data.directories;
				pathSep = data.sep;
			}
		} finally {
			isPickerLoading = false;
		}
	}

	function confirmPicker() {
		logStoragePath = explorerPath;
		showPicker = false;
	}

	// ─── Export ────────────────────────────────────────────────────────
	async function exportLogs() {
		isExporting = true;
		exportStats = null;
		try {
			const tasks = JSON.parse(localStorage.getItem('ohmycode-kanban-tasks') ?? '[]');
			const res = await fetch('/api/log/export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tasks })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: 'Export failed' }));
				showMsg('error', err.error ?? 'Export failed');
				return;
			}

			// Read stats from custom response header (avoids parsing the ZIP body)
			const statsHeader = res.headers.get('X-Ohmycode-Stats');
			if (statsHeader) {
				try {
					const s = JSON.parse(statsHeader);
					exportStats = { logs: s.logs ?? 0, files: s.files ?? 0 };
				} catch {}
			}

			// Download the ZIP blob directly — no JSON parsing
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `ohmycode-backup-${new Date().toISOString().slice(0, 10)}.zip`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			const statsText = exportStats
				? `${tasks.length} tasks · ${exportStats.logs} logs · ${exportStats.files} files`
				: `${tasks.length} tasks`;
			showMsg('success', `Exported ${statsText}`);
		} catch {
			showMsg('error', 'Export failed');
		} finally {
			isExporting = false;
		}
	}

	// ─── Import ────────────────────────────────────────────────────────
	function onFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		importFile = input.files?.[0] ?? null;
	}

	async function importLogs() {
		if (!importFile) return;
		isImporting = true;
		try {
			// Validate file extension before uploading
			if (!importFile.name.toLowerCase().endsWith('.zip')) {
				showMsg('error', 'Invalid file: please select a .zip backup file');
				return;
			}

			// Send as FormData so the server receives a proper binary ZIP
			const formData = new FormData();
			formData.append('file', importFile);

			const res = await fetch('/api/log/import', {
				method: 'POST',
				body: formData
				// Note: do NOT set Content-Type — browser sets it with boundary automatically
			});
			const data = await res.json();
			if (!data.success) {
				showMsg('error', data.error ?? 'Import failed');
				return;
			}

			// Merge tasks into localStorage (imported tasks take precedence)
			const existing: any[] = JSON.parse(localStorage.getItem('ohmycode-kanban-tasks') ?? '[]');
			const importedIds = new Set(data.tasks.map((t: any) => t.id));
			const merged = [...data.tasks, ...existing.filter((t: any) => !importedIds.has(t.id))];
			localStorage.setItem('ohmycode-kanban-tasks', JSON.stringify(merged));

			showMsg(
				'success',
				`Imported ${data.stats.tasks} tasks · ${data.stats.files} files. Reloading…`
			);
			importFile = null;
			if (importFileInput) importFileInput.value = '';

			setTimeout(() => window.location.reload(), 1800);
		} catch {
			showMsg('error', 'Import failed');
		} finally {
			isImporting = false;
		}
	}

	function close() {
		if (showPicker) { showPicker = false; return; }
		open = false;
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
		role="presentation"
		onclick={close}
	></div>

	<!-- Panel -->
	<div
		class="fixed inset-0 z-[201] flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Settings"
	>
		<div
			class="relative w-full max-w-lg bg-base-100 rounded-[2rem] shadow-2xl border border-base-300 flex flex-col max-h-[90vh]"
			in:fly={{ y: 24, duration: 280 }}
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-8 py-6 border-b border-base-300 shrink-0">
				<h2 class="text-lg font-black uppercase tracking-tight flex items-center gap-3">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
					Settings
				</h2>
				<button
					class="btn btn-ghost btn-sm btn-circle rounded-full"
					onclick={() => (open = false)}
					aria-label="Close settings"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
				</button>
			</div>

			<!-- Scrollable body -->
			<div class="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-8 custom-scrollbar">

				<!-- ── Section 1: Storage Location ── -->
				<section>
					<div class="flex items-center gap-2 mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
						<span class="text-[10px] font-black uppercase tracking-widest opacity-60">Log Storage Location</span>
					</div>

					{#if isLoadingSettings}
						<div class="flex items-center gap-2 opacity-40 text-xs py-4">
							<span class="loading loading-spinner loading-xs"></span>
							<span>Loading…</span>
						</div>
					{:else}
						<!-- Active path display -->
						<div class="mb-3 px-4 py-3 rounded-xl bg-base-200 border border-base-300 flex items-center gap-2">
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-40 shrink-0"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
							<span class="font-mono text-[10px] opacity-60 truncate">Active: {currentLogsRoot || defaultLogsRoot}</span>
						</div>

						<div class="flex gap-2">
							<input
								type="text"
								bind:value={logStoragePath}
								placeholder={defaultLogsRoot || '~/.ohmycode/logs (default)'}
								class="input input-bordered input-sm flex-1 font-mono text-xs focus:border-primary rounded-xl"
							/>
							<button
								type="button"
								class="btn btn-sm btn-ghost rounded-xl border border-base-300 gap-1.5"
								onclick={() => openPicker(logStoragePath || '')}
								title="Browse folders"
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
								<span class="hidden sm:inline text-[10px] font-bold">Browse</span>
							</button>
						</div>

						<div class="flex gap-2 mt-3">
							<button
								type="button"
								class="btn btn-xs btn-ghost rounded-full border border-base-300 font-bold px-4"
								onclick={resetToDefault}
								title="Reset to default path"
							>
								Reset Default
							</button>
							<button
								type="button"
								class="btn btn-xs btn-primary rounded-full font-black px-6 ml-auto gap-1.5"
								onclick={saveStoragePath}
								disabled={isSaving}
							>
								{#if isSaving}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
								{/if}
								Save
							</button>
						</div>
					{/if}
				</section>

				<div class="divider my-0 opacity-30"></div>

				<!-- ── Section 2: Export ── -->
				<section>
					<div class="flex items-center gap-2 mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
						<span class="text-[10px] font-black uppercase tracking-widest opacity-60">Export Logs</span>
					</div>

					<p class="text-xs opacity-50 mb-4 leading-relaxed">
						Download all your logs, task data, and backup source files as a single portable
						<span class="font-black font-mono">.zip</span> archive. Use this to migrate to another machine or keep an offline backup.
					</p>

					<button
						type="button"
						class="btn btn-outline btn-sm rounded-full font-black gap-2 w-full"
						onclick={exportLogs}
						disabled={isExporting}
					>
						{#if isExporting}
							<span class="loading loading-spinner loading-xs"></span>
							Preparing export…
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
							Export All Logs
						{/if}
					</button>

					{#if exportStats}
						<div class="mt-3 flex gap-3 text-[10px] font-black opacity-50">
							<span>{exportStats.logs} log files</span>
							<span>·</span>
							<span>{exportStats.files} source files</span>
						</div>
					{/if}
				</section>

				<div class="divider my-0 opacity-30"></div>

				<!-- ── Section 3: Import ── -->
				<section>
					<div class="flex items-center gap-2 mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
						<span class="text-[10px] font-black uppercase tracking-widest opacity-60">Import Logs</span>
					</div>

					<p class="text-xs opacity-50 mb-4 leading-relaxed">
						Restore task data and log files from a previously exported
						<span class="font-black font-mono">ohmycode-backup-*.zip</span> file. Imported tasks will be merged with existing data.
					</p>

					<div class="flex flex-col gap-3">
						<label
							class="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-base-300 hover:border-primary/50 transition-colors cursor-pointer group"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-40 group-hover:opacity-80 group-hover:text-primary transition-all shrink-0"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
							<span class="text-xs flex-1 {importFile ? 'font-bold text-primary' : 'opacity-40'}">
								{importFile ? importFile.name : 'Choose backup file (.zip)…'}
							</span>
							<input
								bind:this={importFileInput}
								type="file"
								accept=".zip,application/zip,application/x-zip-compressed"
								class="hidden"
								onchange={onFileChange}
							/>
						</label>

						<button
							type="button"
							class="btn btn-sm btn-primary rounded-full font-black gap-2 w-full"
							onclick={importLogs}
							disabled={!importFile || isImporting}
						>
							{#if isImporting}
								<span class="loading loading-spinner loading-xs"></span>
								Importing…
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
								Import & Restore
							{/if}
						</button>
					</div>
				</section>
			</div>

			<!-- Feedback toast pinned to bottom of modal -->
			{#if message}
				<div
					class="mx-8 mb-6 shrink-0 px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2
						{message.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-error/10 text-error border border-error/20'}"
					transition:fade={{ duration: 200 }}
				>
					{#if message.type === 'success'}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
					{/if}
					{message.text}
				</div>
			{/if}
		</div>

		<!-- ── Folder Picker overlay ── -->
		{#if showPicker}
			<div class="fixed inset-0 z-[210] flex items-center justify-center p-4" in:fade={{ duration: 100 }}>
				<div class="card w-full max-w-xl bg-base-100 shadow-2xl border border-base-300 max-h-[80vh] flex flex-col" in:fly={{ y: 16 }}>
					<div class="card-body p-0 overflow-hidden flex flex-col">
						<div class="p-6 border-b border-base-300 bg-base-200/50">
							<h3 class="font-black uppercase tracking-widest text-sm mb-4">Select Folder</h3>
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="btn btn-sm btn-ghost"
									onclick={() => openPicker(explorerParent)}
									disabled={isPickerLoading}
									title="Go up"
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
								</button>
								<div class="bg-base-100 px-4 py-2 rounded-xl border border-base-300 flex-1 font-mono text-[10px] truncate">
									{explorerPath || '…'}
								</div>
							</div>
						</div>
						<div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
							{#if isPickerLoading}
								<div class="col-span-2 flex items-center justify-center py-10 opacity-30 gap-2">
									<span class="loading loading-spinner loading-sm"></span>
									<span class="text-xs">Loading…</span>
								</div>
							{:else}
								{#each explorerDirs as dir}
									<button
										type="button"
										class="flex items-center gap-3 p-3 rounded-xl hover:bg-primary/10 hover:text-primary transition-colors text-left group"
										onclick={() => openPicker(explorerPath + pathSep + dir)}
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-40 group-hover:opacity-100 transition-opacity"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
										<span class="text-xs font-bold truncate">{dir}</span>
									</button>
								{/each}
								{#if explorerDirs.length === 0}
									<div class="col-span-2 flex items-center justify-center py-10 opacity-20 text-xs italic">
										No subdirectories
									</div>
								{/if}
							{/if}
						</div>
						<div class="p-5 border-t border-base-300 bg-base-200/50 flex justify-between gap-4">
							<button type="button" class="btn btn-ghost btn-sm rounded-full px-6" onclick={() => (showPicker = false)}>Cancel</button>
							<button type="button" class="btn btn-primary btn-sm rounded-full px-8 font-black" onclick={confirmPicker}>Select This Folder</button>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.custom-scrollbar::-webkit-scrollbar { width: 4px; }
	.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
	.custom-scrollbar::-webkit-scrollbar-thumb { background: #888; border-radius: 10px; }
	.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
</style>
