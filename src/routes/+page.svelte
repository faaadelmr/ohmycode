<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
</script>

<div class="container mx-auto px-4 max-w-7xl">
	{#if mounted}
		<div in:fly={{ y: 20, duration: 800, delay: 200 }}>
			<TaskForm />
		</div>

		<div in:fade={{ duration: 1000, delay: 400 }} class="mt-12">
			<KanbanBoard />
		</div>

		<section class="mt-32 bg-gradient-to-br from-base-200 to-base-300 rounded-[3rem] p-8 sm:p-16 text-center border border-base-300 shadow-inner overflow-hidden relative">
			<!-- Background Pattern -->
			<div class="absolute inset-0 opacity-10 pointer-events-none" style="background-image: radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0); background-size: 24px 24px;"></div>
			
			<div in:fade={{ duration: 1000, delay: 800 }} class="relative z-10">
				<h2 class="text-3xl font-black mb-6 uppercase tracking-tighter">Your Coding Audit Trail</h2>
				<p class="text-lg opacity-70 max-w-3xl mx-auto mb-10 leading-relaxed">
					This dashboard acts as your automated brain. By reading your `.git` history and local project changes, 
					it helps you generate accurate daily work reports in seconds.
				</p>
				<div class="flex flex-wrap justify-center gap-4">
					<div class="badge badge-lg badge-primary font-black py-5 px-6 rounded-2xl shadow-lg shadow-primary/20">NO STATUS OVERHEAD</div>
					<div class="badge badge-lg badge-secondary font-black py-5 px-6 rounded-2xl shadow-lg shadow-secondary/20">PURE LOG FOCUS</div>
					<div class="badge badge-lg badge-ghost font-black py-5 px-6 rounded-2xl border-base-300 bg-base-100">LOCAL FIRST</div>
				</div>
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
