import { describe, it, expect } from "vitest";
import type { HexId, VertexId } from "../../lib/catan/types.js";
import type { PendingAction } from "../../lib/catan/validTargets.js";
import { compactActionLeftTab } from "../../lib/catan/pendingActionUi.js";

const v = "vx" as VertexId;
const h = "hx" as HexId;

const CASES: { pa: PendingAction; expected: "build" | "knights" | null }[] = [
  { pa: { type: "build_road" }, expected: "build" },
  { pa: { type: "build_settlement" }, expected: "build" },
  { pa: { type: "build_city" }, expected: "build" },
  { pa: { type: "build_city_wall" }, expected: "build" },
  { pa: { type: "knight_deploy" }, expected: "build" },
  { pa: { type: "activate_knight" }, expected: "knights" },
  { pa: { type: "advance_knight_from" }, expected: "knights" },
  { pa: { type: "advance_knight_to", from: v }, expected: "knights" },
  { pa: { type: "chase_robber_from" }, expected: "knights" },
  { pa: { type: "chase_robber_hex", knight: v }, expected: "knights" },
  { pa: { type: "progress_select_vertex", card: "Engineering" }, expected: null },
  { pa: { type: "progress_select_vertex", card: "Medicine" }, expected: null },
  { pa: { type: "progress_select_knight", card: "Intrigue" }, expected: null },
  { pa: { type: "progress_select_knight", card: "Treason" }, expected: null },
  { pa: { type: "progress_select_hex", card: "Merchant" }, expected: null },
  { pa: { type: "progress_select_hex", card: "Taxation" }, expected: null },
  { pa: { type: "progress_select_edge", card: "Diplomacy" }, expected: null },
  { pa: { type: "progress_select_hex_pair", card: "Invention", picked: [] }, expected: null },
  { pa: { type: "progress_select_hex_pair", card: "Invention", picked: [h] }, expected: null },
];

describe("compactActionLeftTab", () => {
  it("returns null for null (no pending action)", () => {
    expect(compactActionLeftTab(null)).toBeNull();
  });

  it.each(CASES)("maps $pa.type → $expected", ({ pa, expected }) => {
    expect(compactActionLeftTab(pa)).toBe(expected);
  });
});
