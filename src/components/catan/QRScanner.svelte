<script lang="ts">
  let { onScan }: { onScan: (text: string) => void } = $props();

  let videoEl = $state<HTMLVideoElement | undefined>(undefined);
  let errorMsg = $state<string | null>(null);
  let stopFn: (() => void) | null = null;

  $effect(() => {
    if (!videoEl) return;
    let cancelled = false;

    async function start() {
      try {
        const [{ BrowserMultiFormatReader, BarcodeFormat }, { DecodeHintType }] =
          await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
          ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoEl!,
          (result, _err, controls) => {
            if (result && !cancelled) {
              controls.stop();
              stopFn = null;
              onScan(result.getText());
            }
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        stopFn = () => controls.stop();
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err as { name?: string; message?: string };
        if (e.name === "NotAllowedError")
          errorMsg = "Camera permission denied.";
        else if (e.name === "NotFoundError")
          errorMsg = "No camera found on this device.";
        else if (e.name === "NotReadableError")
          errorMsg = "Camera is in use by another app.";
        else errorMsg = `Camera error: ${e.message ?? "unknown"}`;
      }
    }

    start();
    return () => {
      cancelled = true;
      stopFn?.();
      stopFn = null;
    };
  });
</script>

<div class="qr-scanner">
  {#if errorMsg}
    <p class="scanner-error">{errorMsg}</p>
  {:else}
    <div class="video-wrap">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={videoEl} playsinline muted></video>
      <div class="scan-overlay" aria-hidden="true">
        <div class="scan-target">
          <span class="corner tl"></span><span class="corner tr"></span>
          <span class="corner bl"></span><span class="corner br"></span>
          <div class="scan-line"></div>
        </div>
      </div>
    </div>
    <p class="scanner-hint">Point camera at the host's QR code</p>
  {/if}
</div>

<style>
  .qr-scanner {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .video-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    background: #000;
    overflow: hidden;
    border: 2px solid #5a6a2a;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .scan-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .scan-target {
    position: relative;
    width: 65%;
    aspect-ratio: 1;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  }

  .corner {
    position: absolute;
    width: 18px;
    height: 18px;
  }

  .corner.tl {
    top: -2px;
    left: -2px;
    border-top: 3px solid #f5c842;
    border-left: 3px solid #f5c842;
  }
  .corner.tr {
    top: -2px;
    right: -2px;
    border-top: 3px solid #f5c842;
    border-right: 3px solid #f5c842;
  }
  .corner.bl {
    bottom: -2px;
    left: -2px;
    border-bottom: 3px solid #f5c842;
    border-left: 3px solid #f5c842;
  }
  .corner.br {
    bottom: -2px;
    right: -2px;
    border-bottom: 3px solid #f5c842;
    border-right: 3px solid #f5c842;
  }

  .scan-line {
    position: absolute;
    left: 4%;
    right: 4%;
    height: 2px;
    background: linear-gradient(
      to right,
      transparent,
      #f5c842 30%,
      #f5c842 70%,
      transparent
    );
    animation: scan 2s ease-in-out infinite;
  }

  @keyframes scan {
    0% {
      top: 10%;
      opacity: 1;
    }
    48% {
      top: 88%;
      opacity: 1;
    }
    50% {
      top: 88%;
      opacity: 0;
    }
    52% {
      top: 10%;
      opacity: 0;
    }
    54% {
      top: 10%;
      opacity: 1;
    }
    100% {
      top: 10%;
      opacity: 1;
    }
  }

  .scanner-hint {
    font-size: 0.8rem;
    color: #9cb29c;
    margin: 0;
    text-align: center;
  }

  .scanner-error {
    color: #e74c3c;
    font-size: 0.85rem;
    text-align: center;
    margin: 0.5rem 0;
    padding: 0.5rem;
    background: rgba(231, 76, 60, 0.1);
    border: 1px solid rgba(231, 76, 60, 0.3);
    width: 100%;
  }
</style>
