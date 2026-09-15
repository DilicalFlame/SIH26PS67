<!--
  Sample screen for issue #85 — demonstrates the design tokens and base
  styles (.panel, .btn, .input, .slider) defined in layout.css.
  Not part of the real app UI; a reference page only.
-->
<div class="page">
	<div class="panel">
		<h2>Panel example</h2>
		<p>This panel uses the void-based background, the ocean-tinted border, and body text at a verified 14.4:1 contrast ratio.</p>

		<button class="btn">Primary button</button>

		<input class="input" type="text" placeholder="Type here" />

		<input class="slider" type="range" min="0" max="100" />
	</div>
</div>

<style>
	.page {
		background-color: var(--color-void);
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: calc(var(--spacing) * 8);
	}
</style>
