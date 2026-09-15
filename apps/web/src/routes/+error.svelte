<script>
  import { page } from '$app/stores';
</script>

<div style="padding: 2rem; text-align: center; font-family: sans-serif;">
  <h1>Something went wrong</h1>
  <p style="color: red;">{$page.error?.message || 'An unexpected error occurred.'}</p>
  <button 
    onclick={() => window.location.reload()} 
    style="margin-top: 1rem; padding: 0.5rem 1rem; cursor: pointer;"
  >
    Reload Application
  </button>
</div>