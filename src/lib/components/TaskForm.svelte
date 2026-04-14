<script lang="ts">
	import { kanbanStore } from '$lib/kanban.svelte';

	let title = $state('');
	let filesInput = $state('');
	let functionsInput = $state('');

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

		kanbanStore.addTask(title, files, functions);

		// Reset form
		title = '';
		filesInput = '';
		functionsInput = '';
	};
</script>

<div class="card bg-base-100 border border-base-300 shadow-xl mb-12">
	<form onsubmit={handleSubmit} class="card-body p-6 sm:p-8">
		<h2 class="card-title text-2xl font-black mb-6">Log New Duty</h2>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<div class="form-control">
				<label class="label pt-0" for="duty-title">
					<span class="label-text font-bold uppercase text-xs opacity-60">What are you working on?</span>
				</label>
				<input
					id="duty-title"
					type="text"
					bind:value={title}
					placeholder="Refactoring auth flow"
					class="input input-bordered w-full bg-base-200 focus:bg-base-100 transition-colors"
					required
				/>
			</div>

			<div class="form-control">
				<label class="label pt-0" for="duty-files">
					<span class="label-text font-bold uppercase text-xs opacity-60">Files (comma separated)</span>
				</label>
				<input
					id="duty-files"
					type="text"
					bind:value={filesInput}
					placeholder="auth.ts, login.svelte"
					class="input input-bordered w-full bg-base-200 focus:bg-base-100 transition-colors"
				/>
			</div>

			<div class="form-control">
				<label class="label pt-0" for="duty-functions">
					<span class="label-text font-bold uppercase text-xs opacity-60">Functions (comma separated)</span>
				</label>
				<input
					id="duty-functions"
					type="text"
					bind:value={functionsInput}
					placeholder="handleLogin, validateToken"
					class="input input-bordered w-full bg-base-200 focus:bg-base-100 transition-colors"
				/>
			</div>
		</div>

		<div class="card-actions justify-end mt-8">
			<button type="submit" class="btn btn-primary px-8 rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-transform">
				Add to Kanban
			</button>
		</div>
	</form>
</div>
