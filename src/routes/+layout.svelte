<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { theme } from '$lib/theme';
	import { onMount } from 'svelte';
	import { normalizeViewport } from '@faaadelmr/css-viewport';

	let { children } = $props();

	onMount(() => {
		normalizeViewport();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ohmycode | Daily Worker Log</title>
</svelte:head>

<div
	class="min-h-screen-vh w-screen flex flex-col bg-base-100 font-sans text-base-content overflow-hidden select-none"
	data-theme={$theme}
>
	{@render children()}
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
		overflow: hidden;
		width: 100vw;
		height: 100vh;
	}
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
		width: 100vw;
		height: 100vh;
	}
</style>
