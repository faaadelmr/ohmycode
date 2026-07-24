<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { theme } from '$lib/theme';



	let { children } = $props();

</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ohmycode | Daily Worker Log</title>
</svelte:head>

<div
	class="min-h-screen-vh flex w-screen flex-col overflow-hidden bg-base-100 font-sans text-base-content select-none"
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
