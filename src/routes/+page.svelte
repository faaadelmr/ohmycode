<script lang="ts">
	import { fade, fly, scale } from 'svelte/transition';
	import { onMount } from 'svelte';
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
</script>

<div class="container mx-auto px-4 py-12 sm:py-20 max-w-7xl">
	{#if mounted}
		<section class="flex flex-col items-center text-center gap-8 mb-16">
			<div in:scale={{ duration: 600, delay: 200 }}>
				<h1 class="text-6xl sm:text-8xl font-black tracking-tighter mb-4 leading-none uppercase">
					Duty <span class="text-primary italic">Kanban</span>
				</h1>
				<p class="text-xl sm:text-2xl opacity-70 max-w-2xl mx-auto leading-relaxed">
					Track your <span class="font-bold text-base-content">ohmycode</span> progress. 
					Log what you're working on, which files you're touching, and which functions you're refactoring.
				</p>
			</div>
		</section>

		<div in:fly={{ y: 20, duration: 800, delay: 400 }}>
			<TaskForm />
		</div>

		<div in:fade={{ duration: 1000, delay: 600 }} class="mt-12">
			<KanbanBoard />
		</div>

		<section class="mt-24 bg-gradient-to-br from-base-200 to-base-300 rounded-3xl p-8 sm:p-12 text-center border border-base-300 shadow-inner">
			<div in:fade={{ duration: 1000, delay: 1000 }}>
				<h2 class="text-2xl font-black mb-4 uppercase tracking-tighter">Pro Tip</h2>
				<p class="text-lg opacity-70 max-w-2xl mx-auto">
					Drag and drop cards across columns to update their status. 
					Your duties are automatically saved to your browser's local storage.
				</p>
			</div>
		</section>
	{/if}
</div>

<style>
	:global(body) {
		background-image: radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0);
		background-size: 40px 40px;
		background-attachment: fixed;
	}
	:global(body[data-theme]) {
		opacity: 0.95;
	}
</style>
