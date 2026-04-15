<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { theme, themes } from '$lib/theme';
	import { onMount } from 'svelte';
	import { normalizeViewport } from '@faaadelmr/css-viewport';

	let { children } = $props();

	onMount(() => {
		// Initialize viewport normalization
		normalizeViewport();

		// Initial theme sync
		const savedTheme = localStorage.getItem('theme') || 'cupcake';
		theme.set(savedTheme);
	});

	// Reactive theme sync
	$effect(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.setAttribute('data-theme', $theme);
			localStorage.setItem('theme', $theme);
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ohmycode | Daily Worker Log</title>
</svelte:head>

<div class="min-h-screen bg-base-100 font-sans text-base-content transition-colors duration-300">
	<header class="navbar sticky top-0 z-50 bg-base-100/80 backdrop-blur-md shadow-sm border-b border-base-300 px-4 sm:px-8 py-4">
		<div class="navbar-start">
			<a href="/" class="flex flex-col items-start leading-none group">
				<span class="text-2xl font-black lowercase tracking-tighter transition-transform group-hover:scale-105 origin-left">
					ohmy<span class="text-primary">code</span>
				</span>
				<span class="text-[10px] uppercase font-black opacity-40 tracking-widest mt-1 hidden sm:block">
					Dev Productivity Tool
				</span>
			</a>
		</div>

		<div class="navbar-center hidden lg:flex">
			<div class="flex flex-col items-center text-center">
				<h1 class="text-xl font-black uppercase tracking-tighter leading-none">
					Daily <span class="text-primary italic">Worker Log</span>
				</h1>
				<p class="text-[10px] opacity-50 font-bold mt-1">Simplify your work reporting in seconds</p>
			</div>
		</div>

		<div class="navbar-end gap-2">
			<!-- Theme Controller (DaisyUI Select Style) -->
			<div class="dropdown dropdown-end">
				<div tabindex="0" role="button" class="btn btn-ghost btn-sm sm:btn-md gap-2 normal-case rounded-full border-base-300">
					<svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block h-5 w-5 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path></svg>
					<span class="hidden md:inline font-bold">Theme</span>
					<div class="badge badge-primary badge-sm font-black hidden sm:flex">{$theme}</div>
				</div>
				<ul class="dropdown-content z-[1] menu p-2 shadow-2xl bg-base-200 rounded-2xl w-56 max-h-[70vh] overflow-y-auto mt-4 border border-base-300">
					<div class="px-4 py-2 text-[10px] font-black uppercase opacity-40 tracking-widest">Select Theme</div>
					{#each themes as t}
						<li>
							<button 
								class="rounded-xl flex justify-between items-center mb-1 { $theme === t ? 'active bg-primary text-primary-content' : '' }"
								onclick={() => theme.set(t)}
							>
								<span class="capitalize font-bold">{t}</span>
								{#if $theme === t}
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</header>

	<main class="py-8 sm:py-12">
		{@render children()}
	</main>

	<footer class="footer footer-center p-10 bg-base-200 text-base-content rounded border-t border-base-300">
		<aside>
			<p class="font-black text-xl lowercase tracking-tighter">
				ohmy<span class="text-primary">code</span>
			</p>
			<p class="font-medium opacity-60 italic mt-1">"Why track manually when you can automate?"</p>
			<p class="text-xs opacity-40 mt-4 font-bold">Built with SvelteKit 5, Tailwind 4 & DaisyUI 5</p>
		</aside>
	</footer>
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
</style>
