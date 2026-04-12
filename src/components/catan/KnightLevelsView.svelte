<script lang="ts">
  import { KNIGHT_LEVEL_HINTS } from "../../lib/catan/constants.js";
</script>

<div class="hint-list">
  {#each [1, 2, 3] as level}
    {@const item = KNIGHT_LEVEL_HINTS[level as 1 | 2 | 3]}
    <div class="knight-row">
      <div class="name">{item.name}</div>
      <div class="desc">{item.text}</div>
    </div>
  {/each}
</div>

<style>
  .hint-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .knight-row {
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 8px;
    padding: 0.5rem;
  }

  .knight-row .name {
    font-size: 0.84rem;
    font-weight: 700;
    color: #f5c842;
  }

  .knight-row .desc {
    margin-top: 0.18rem;
    font-size: 0.76rem;
    line-height: 1.33;
    color: #d6d8cd;
  }
</style>
