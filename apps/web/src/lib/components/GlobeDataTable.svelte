<script lang="ts">
    interface Props {
        visible?: boolean;
    }
    const { visible = false }: Props = $props();
</script>

{#if visible}
<div class="data-table-container" role="region" aria-label="Globe data table alternative">
    <h2 class="table-title">Ocean Data — Accessible Table View</h2>
    <p class="table-description">
        This table provides accessible access to the data shown on the 3D globe.
        The WebGL globe canvas cannot be navigated by screen reader or keyboard alone.
    </p>
    <table class="data-table" aria-describedby="table-desc">
        <caption id="table-desc">
            Active ocean data layers currently displayed on the globe
        </caption>
        <thead>
            <tr>
                <th scope="col">Layer</th>
                <th scope="col">Region</th>
                <th scope="col">Value</th>
                <th scope="col">Unit</th>
                <th scope="col">Source</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>Coastlines</td>
                <td>Global</td>
                <td>Reference geometry</td>
                <td>—</td>
                <td>GSHHG via PMTiles</td>
            </tr>
        </tbody>
    </table>
    <p class="table-note">
        More data layers will appear here as they are added to the platform.
    </p>
</div>
{/if}

<style>
    .data-table-container {
        position: fixed;
        top: 1rem;
        left: 1rem;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        background: rgba(13, 13, 15, 0.95);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 12px;
        padding: 1.5rem;
        color: #ffffff;
        font-family: 'Noto Sans', system-ui, sans-serif;
        z-index: 50;
    }

    .table-title {
        font-size: 1rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
    }

    .table-description {
        font-size: 0.8rem;
        color: rgba(255,255,255,0.7);
        margin-bottom: 1rem;
        line-height: 1.5;
    }

    .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.82rem;
    }

    .data-table th,
    .data-table td {
        padding: 0.5rem 0.75rem;
        text-align: left;
        border-bottom: 1px solid rgba(255,255,255,0.08);
    }

    .data-table th {
        font-weight: 500;
        color: rgba(255,255,255,0.5);
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.05em;
    }

    .data-table td {
        color: rgba(255,255,255,0.85);
    }

    .table-note {
        font-size: 0.75rem;
        color: rgba(255,255,255,0.4);
        margin-top: 1rem;
    }
</style>