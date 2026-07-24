<script lang="ts">
	import { smoothTransitionV2 } from 'smooth-transitionv2';

	let {
		branch = 'main',
		isSyncing = false,
		watcherStatus = 'offline',
		successMessage = '',
		errorMessage = '',
		onSync,
		onOpenSettings
	}: {
		branch?: string;
		isSyncing?: boolean;
		watcherStatus?: 'connecting' | 'live' | 'offline';
		successMessage?: string;
		errorMessage?: string;
		onSync?: () => void;
		onOpenSettings?: () => void;
	} = $props();

	const handleEasterEgg = () => {
		smoothTransitionV2({ appName: 'ohmycode', enableSmooth: true, smoothDuration: 600 });
	};
</script>

<footer
	class="z-10 flex h-6 shrink-0 items-center justify-between bg-primary px-2 text-[11px] font-medium text-primary-content select-none"
>
	<div class="flex items-center gap-3">
		<div
			class="flex h-full cursor-pointer items-center gap-1.5 px-2 transition-colors hover:bg-white/10"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="11"
				height="11"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="3"
				><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle
					cx="6"
					cy="18"
					r="3"
				></circle><path d="M20.39 18.39A5 5 0 0 0 18 13H6"></path><path d="M6 9v6"></path></svg
			>
			<span class="font-bold">{branch}</span>
		</div>

		<button
			onclick={() => onSync?.()}
			class="flex h-full cursor-pointer items-center gap-1 px-2 font-semibold transition-colors hover:bg-white/10"
			title="Synchronize local changes"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="10"
				height="10"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="3"
				class={isSyncing ? 'animate-spin' : ''}
				><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></svg
			>
			Sync changes
		</button>

		<div class="opacity-50">|</div>

		{#if successMessage}
			<span class="animate-pulse text-[10px] font-black tracking-wide text-white">
				[SYSTEM] {successMessage}
			</span>
		{:else if errorMessage}
			<span class="text-[10px] font-black tracking-wide text-error-content">
				[ERR] {errorMessage}
			</span>
		{/if}
	</div>

	<div class="flex items-center gap-3">
		<div
			class="flex h-full cursor-pointer items-center gap-1.5 px-2 transition-colors hover:bg-white/10"
			title="Watcher monitoring details"
		>
			<span
				class="h-1.5 w-1.5 rounded-full {watcherStatus === 'live'
					? 'animate-pulse bg-[#a3e635] shadow-[0_0_8px_rgba(163,230,53,0.8)]'
					: watcherStatus === 'connecting'
						? 'bg-[#facc15]'
						: 'bg-[#f87171]'}"
			></span>
			<span class="font-mono text-[10px] font-semibold lowercase">{watcherStatus}</span>
		</div>

		<div class="opacity-40">|</div>

		<button
			type="button"
			class="h-full cursor-pointer px-2 font-mono text-[10px] uppercase transition-colors hover:bg-white/10"
			onclick={() => onOpenSettings?.()}
		>
			UTF-8
		</button>

		<a
			href="https://faaadelmr.dev"
			target="_blank"
			rel="noopener noreferrer"
			onclick={handleEasterEgg}
			class="flex h-full items-center px-1 text-[8px] transition-colors hover:bg-white/10 hover:underline"
		>
			Crafted by faaadelmr
		</a>
	</div>
</footer>
