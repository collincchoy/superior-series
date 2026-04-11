<script lang="ts">
  import { onMount } from "svelte";

  let { roomCode, open = $bindable() }: { roomCode: string; open: boolean } =
    $props();

  let canvas: HTMLCanvasElement;

  $effect(() => {
    if (!open || !canvas) return;
    const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    import("qrcode").then((QRCode) => {
      QRCode.toCanvas(canvas, joinUrl, {
        width: 220,
        color: { dark: "#1a3a1a", light: "#f0e8d0" },
      });
    });
  });
</script>

{#if open}
  <div
    class="modal"
    role="dialog"
    onclick={(e) => {
      if (e.target === e.currentTarget) open = false;
    }}
  >
    <div class="modal-box" style="text-align:center">
      <h3>Scan to Join</h3>
      <canvas
        bind:this={canvas}
        style="margin:1rem auto;display:block;border-radius:4px"
      ></canvas>
      <p style="font-size:0.8rem;color:#c8b47a;margin:0.8rem 0">
        Room code: <strong>{roomCode}</strong>
      </p>
      <button class="btn-secondary" onclick={() => (open = false)}>Close</button
      >
    </div>
  </div>
{/if}

<style>
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
  }

  .modal-box {
    background: #1e2e1e;
    border: 2px solid #2c5f2e;
    border-radius: 10px;
    padding: 1.2rem;
    max-width: 360px;
    width: 90%;
    color: #f0e8d0;
  }

  h3 {
    margin: 0 0 1rem;
    color: #f5c842;
    font-size: 1rem;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
  }
</style>
