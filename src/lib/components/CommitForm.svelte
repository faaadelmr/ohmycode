<script lang="ts">
	let {
		title = $bindable(''),
		notes = $bindable(''),
		includeGitCommit = $bindable(false),
		projectPath = '',
		isCommitting = false,
		canSubmitLog = false,
		hasGitCommitTargets = false,
		onSubmit,
		onCommitKeyDown
	}: {
		title: string;
		notes: string;
		includeGitCommit: boolean;
		projectPath?: string;
		isCommitting?: boolean;
		canSubmitLog?: boolean;
		hasGitCommitTargets?: boolean;
		onSubmit?: () => void;
		onCommitKeyDown?: (event: KeyboardEvent) => void;
	} = $props();
</script>

<div class="flex flex-col gap-2 bg-base-100 p-3 rounded-xl border border-base-content/10 shadow-sm">
	<div class="form-control">
		<input
			type="text"
			bind:value={title}
			placeholder="Summary (Required, e.g. feat: add login)"
			class="input input-sm w-full bg-base-200/50 focus:bg-base-200 border-base-content/10 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg text-xs"
			required
			onkeydown={(e) => onCommitKeyDown?.(e)}
		/>
	</div>

	<div class="form-control">
		<textarea
			bind:value={notes}
			placeholder="Description (Ctrl+Enter to commit & save log)"
			class="textarea textarea-sm w-full bg-base-200/50 focus:bg-base-200 border-base-content/10 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg text-[11px] leading-relaxed min-h-[90px] font-mono"
			onkeydown={(e) => onCommitKeyDown?.(e)}
		></textarea>
	</div>

	<div class="flex items-center justify-between pt-1 border-t border-base-content/5 mt-1">
		<div class="flex flex-col text-left">
			<span class="text-[9px] uppercase font-black tracking-wider text-primary">Create Git Commit</span>
			<span class="text-[8px] opacity-40">Commit selected or staged files with this log</span>
		</div>
		<input
			type="checkbox"
			class="toggle toggle-primary toggle-xs"
			bind:checked={includeGitCommit}
			disabled={!projectPath}
		/>
	</div>

	<button
		onclick={() => onSubmit?.()}
		class="btn btn-sm btn-primary w-full rounded-lg font-bold text-xs gap-1.5 mt-1 shadow-md hover:shadow-primary/20 {isCommitting ? 'loading' : ''}"
		disabled={!canSubmitLog}
	>
		{#if !isCommitting}
			<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
		{/if}
		{includeGitCommit ? 'Commit & Save Log' : 'Save Log'}
	</button>

	{#if includeGitCommit && !hasGitCommitTargets}
		<p class="text-[9px] text-warning font-mono leading-snug">
			Select files or stage changes before creating a Git commit.
		</p>
	{/if}
</div>
