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

		// Sync theme on mount
		const savedTheme = localStorage.getItem('theme') || 'cupcake';
		theme.set(savedTheme);
		document.documentElement.setAttribute('data-theme', savedTheme);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ohmycode | Interactive Playground</title>
</svelte:head>

<div class="min-h-screen bg-base-100 font-sans text-base-content transition-colors duration-300">
	<header class="navbar sticky top-0 z-50 bg-base-200/80 backdrop-blur-md shadow-sm border-b border-base-300 px-4 sm:px-8">
		<div class="flex-1">
			<a href="/" class="btn btn-ghost text-2xl font-black lowercase tracking-tighter">
				ohmy<span class="text-primary">code</span>
			</a>
		</div>
		<div class="flex-none gap-2">
			<div class="dropdown dropdown-end">
				<div tabindex="0" role="button" class="btn btn-ghost gap-2 normal-case">
					<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block h-5 w-5 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path></svg>
					<span class="hidden sm:inline">Theme</span>
					<svg width="12px" height="12px" class="h-2 w-2 fill-current opacity-60 inline-block" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048"><path d="M1799 349l242 241-1017 1017L7 590l242-241 775 775 775-775z"></path></svg>
				</div>
				<ul class="dropdown-content z-[1] menu p-2 shadow bg-base-200 rounded-box w-52 max-h-96 overflow-y-auto mt-4">
					{#each themes as t}
						<li>
							<button 
								class:active={$theme === t}
								onclick={() => theme.set(t)}
							>
								{t}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</header>

	<main>
		{@render children()}
	</main>

	<footer class="footer footer-center p-10 bg-base-200 text-base-content rounded border-t border-base-300">
		<aside>
			<p class="font-bold text-lg">
				ohmy<span class="text-primary">code</span>
			</p>
			<p>Modern, Playful, Colorful Interactive Website.</p>
			<p>Built with SvelteKit & Tailwind CSS.</p>
		</aside>
	</footer>
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
</style>
