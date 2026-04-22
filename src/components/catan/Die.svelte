<script lang="ts">
  const PIP_POSITIONS: Record<number, Array<{ x: number; y: number }>> = {
    1: [{ x: 50, y: 50 }],
    2: [
      { x: 28, y: 28 },
      { x: 72, y: 72 },
    ],
    3: [
      { x: 28, y: 28 },
      { x: 50, y: 50 },
      { x: 72, y: 72 },
    ],
    4: [
      { x: 28, y: 28 },
      { x: 72, y: 28 },
      { x: 28, y: 72 },
      { x: 72, y: 72 },
    ],
    5: [
      { x: 28, y: 28 },
      { x: 72, y: 28 },
      { x: 50, y: 50 },
      { x: 28, y: 72 },
      { x: 72, y: 72 },
    ],
    6: [
      { x: 28, y: 24 },
      { x: 72, y: 24 },
      { x: 28, y: 50 },
      { x: 72, y: 50 },
      { x: 28, y: 76 },
      { x: 72, y: 76 },
    ],
  };

  let {
    color,
    value,
    size = "2rem",
  }: { color: "yellow" | "red"; value: number; size?: string } = $props();

  let pips = $derived(PIP_POSITIONS[value] ?? []);
</script>

<span
  class={`die die-${color}`}
  style={`width:${size};height:${size}`}
  role="img"
  aria-label={`${color === "yellow" ? "Yellow" : "Red"} die showing ${value}`}
>
  {#each pips as pip}
    <span class="pip" style={`left:${pip.x}%;top:${pip.y}%`}></span>
  {/each}
</span>

<style>
  .die {
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    position: relative;
    display: inline-block;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
    flex-shrink: 0;
  }

  .die-yellow {
    background: #f6d55c;
  }

  .die-red {
    background: #d9534f;
  }

  .pip {
    position: absolute;
    width: 18%;
    height: 18%;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: #111;
  }

  .die-red .pip {
    background: #fff;
  }
</style>
