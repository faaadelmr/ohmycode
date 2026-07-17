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

<div class="flex flex-col gap-2 rounded-xl border border-base-content/10 bg-base-100 p-3 shadow-sm">
	<div class="form-control">
		<input
			type="text"
			bind:value={title}
			placeholder="Summary (Required, e.g. feat: add login)"
			class="input input-sm w-full rounded-lg border-base-content/10 bg-base-200/50 text-xs focus:border-primary focus:bg-base-200 focus:ring-1 focus:ring-primary"
			required
			onkeydown={(e) => onCommitKeyDown?.(e)}
		/>
	</div>

	<div class="form-control">
		<textarea
			bind:value={notes}
			placeholder="Description (Ctrl+Enter to commit & save log)"
			class="textarea min-h-[90px] w-full rounded-lg border-base-content/10 bg-base-200/50 font-mono text-[11px] textarea-sm leading-relaxed focus:border-primary focus:bg-base-200 focus:ring-1 focus:ring-primary"
			onkeydown={(e) => onCommitKeyDown?.(e)}
		></textarea>
	</div>

	<div class="mt-1 flex items-center justify-between border-t border-base-content/5 pt-1">
		<div class="flex flex-col text-left">
			<span class="text-[9px] font-black tracking-wider text-primary uppercase"
				>Create Git Commit</span
			>
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
		class="btn mt-1 w-full gap-1.5 rounded-lg text-xs font-bold shadow-md btn-sm btn-primary hover:shadow-primary/20 {isCommitting
			? 'loading'
			: ''}"
		disabled={!canSubmitLog}
	>
		{#if !isCommitting}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg
			>
		{/if}
		{includeGitCommit ? 'Commit & Save Log' : 'Save Log'}
	</button>

	{#if includeGitCommit && !hasGitCommitTargets}
		<p class="font-mono text-[9px] leading-snug text-warning">
			Select files or stage changes before creating a Git commit.
		</p>
	{/if}
</div>
