<script lang="ts">
  import Modal from "./Modal.svelte";

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

<Modal bind:open title="Scan to Join" closeOnBackdrop>
  <canvas
    bind:this={canvas}
    style="margin:1rem auto;display:block;border-radius:4px"
  ></canvas>
  <p style="font-size:0.8rem;color:#c8b47a;margin:0.8rem 0;text-align:center">
    Room code: <strong>{roomCode}</strong>
  </p>
</Modal>

<style>
</style>
