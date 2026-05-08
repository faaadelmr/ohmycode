<script lang="ts">
	import { onMount } from 'svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
</script>

{#if mounted}
	<TaskForm />
{/if}
