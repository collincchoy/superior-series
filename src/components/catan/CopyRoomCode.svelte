<script lang="ts">
  import { onDestroy } from "svelte";
  import { createCopiedFlash } from "../../lib/copiedFlash.js";
  import { copyToClipboard } from "../../lib/copyToClipboard.js";

  interface Props {
    roomCode: string;
  }
  let { roomCode }: Props = $props();

  let linkCopied = $state(false);
  const linkCopiedFlash = createCopiedFlash((v) => (linkCopied = v), onDestroy);

  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    void copyToClipboard(url).then(() => linkCopiedFlash.flash());
  }
</script>

<button class="btn-secondary" onclick={copyLink}>
  {linkCopied ? "Copied" : "Copy link"}
</button>

<style>
  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
    transition: transform 120ms ease, background 120ms ease;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
    transform: translateY(-1px);
  }

  .btn-secondary:active {
    transform: translateY(0) scale(0.97);
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-secondary { transition: none; }
    .btn-secondary:hover { transform: none; }
  }
</style>
