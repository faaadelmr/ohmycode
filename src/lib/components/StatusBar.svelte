<script lang="ts">
	let {
		isSyncing = false,
		watcherStatus = 'offline',
		successMessage = '',
		errorMessage = '',
		onSync,
		onOpenSettings
	}: {
		isSyncing?: boolean;
		watcherStatus?: 'connecting' | 'live' | 'offline';
		successMessage?: string;
		errorMessage?: string;
		onSync?: () => void;
		onOpenSettings?: () => void;
	} = $props();
</script>

<footer class="h-6 bg-primary text-primary-content flex items-center justify-between px-2 text-[11px] select-none shrink-0 font-medium z-10">
	<div class="flex items-center gap-3">
		<div class="flex items-center gap-1.5 hover:bg-white/10 h-full px-2 cursor-pointer transition-colors">
			<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M20.39 18.39A5 5 0 0 0 18 13H6"></path><path d="M6 9v6"></path></svg>
			<span class="font-bold">main</span>
		</div>

		<button onclick={() => onSync?.()} class="flex items-center gap-1 hover:bg-white/10 h-full px-2 cursor-pointer transition-colors font-semibold" title="Synchronize local changes">
			<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="{isSyncing ? 'animate-spin' : ''}"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
			Sync changes
		</button>

		<div class="opacity-50">|</div>

		{#if successMessage}
			<span class="text-[10px] font-black tracking-wide text-white animate-pulse">
				[SYSTEM] {successMessage}
			</span>
		{:else if errorMessage}
			<span class="text-[10px] font-black tracking-wide text-error-content">
				[ERR] {errorMessage}
			</span>
		{/if}
	</div>

	<div class="flex items-center gap-3">
		<div class="flex items-center gap-1.5 hover:bg-white/10 h-full px-2 cursor-pointer transition-colors" title="Watcher monitoring details">
			<span class="w-1.5 h-1.5 rounded-full {watcherStatus === 'live' ? 'bg-[#a3e635] animate-pulse shadow-[0_0_8px_rgba(163,230,53,0.8)]' : watcherStatus === 'connecting' ? 'bg-[#facc15]' : 'bg-[#f87171]'}"></span>
			<span class="font-semibold text-[10px] font-mono lowercase">{watcherStatus}</span>
		</div>

		<div class="opacity-40">|</div>

		<button
			type="button"
			class="hover:bg-white/10 h-full px-2 cursor-pointer transition-colors font-mono uppercase text-[10px]"
			onclick={() => onOpenSettings?.()}
		>
			UTF-8
		</button>
	</div>
</footer>
