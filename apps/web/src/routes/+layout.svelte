<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<!-- The app has its own right-click context menus (compass, layer rows) —
     the browser's default one would otherwise still show everywhere else
     (bare globe, basemap picker, ...), which reads as unfinished. -->
<svelte:window oncontextmenu={(e) => e.preventDefault()} />
{@render children()}
