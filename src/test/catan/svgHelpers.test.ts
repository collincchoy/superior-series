import { describe, it, expect } from "vitest";
import {
  hexPoints,
  getVertexPixel,
  getEdgePoints,
  metropolisOverlayLayout,
  HEX_SIZE,
  CATAN_HEX_COORDS,
  hexId,
} from "../../lib/catan/svgHelpers.js";
import type { VertexId, EdgeId } from "../../lib/catan/types.js";
import { buildGraph } from "../../lib/catan/board.js";

const graph = buildGraph();

describe("hexPoints", () => {
  it("returns a string with 6 coordinate pairs", () => {
    const pts = hexPoints(0, 0, HEX_SIZE);
    const pairs = pts.trim().split(" ");
    expect(pairs).toHaveLength(6);
    for (const pair of pairs) {
      const [x, y] = pair.split(",").map(Number);
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it("all 6 vertices are equidistant from center", () => {
    const pts = hexPoints(0, 0, HEX_SIZE);
    const pairs = pts.trim().split(" ");
    for (const pair of pairs) {
      const [x, y] = pair.split(",").map(Number);
      const dist = Math.sqrt(x! ** 2 + y! ** 2);
      expect(dist).toBeCloseTo(HEX_SIZE, 5);
    }
  });

  it("works with non-zero center", () => {
    const pts0 = hexPoints(0, 0, HEX_SIZE);
    const pts1 = hexPoints(100, 50, HEX_SIZE);
    // Translate origin points by (100, 50) and they should match
    const pairs0 = pts0
      .trim()
      .split(" ")
      .map((p) => p.split(",").map(Number));
    const pairs1 = pts1
      .trim()
      .split(" ")
      .map((p) => p.split(",").map(Number));
    for (let i = 0; i < 6; i++) {
      expect(pairs1[i]![0]).toBeCloseTo(pairs0[i]![0]! + 100, 5);
      expect(pairs1[i]![1]).toBeCloseTo(pairs0[i]![1]! + 50, 5);
    }
  });
});

describe("getVertexPixel", () => {
  it("returns a pixel coordinate for every vertex on the board", () => {
    for (const coord of CATAN_HEX_COORDS) {
      const hid = hexId(coord);
      for (let v = 0; v < 6; v++) {
        const vid = `${hid}:${v}` as VertexId;
        // Only test vertices that are canonical (in the graph)
        if (!graph.vertices[vid]) continue;
        const pt = getVertexPixel(vid);
        expect(pt).not.toBeNull();
        expect(Number.isFinite(pt!.x)).toBe(true);
        expect(Number.isFinite(pt!.y)).toBe(true);
      }
    }
  });

  it("returns null for a malformed vertex id", () => {
    expect(getVertexPixel("not:valid" as VertexId)).toBeNull();
    expect(getVertexPixel(":" as VertexId)).toBeNull();
  });

  it("returns null for a hex id not on the board", () => {
    expect(getVertexPixel("99,99:0" as VertexId)).toBeNull();
  });

  it("different vertices on the same hex return different pixels", () => {
    const coord = CATAN_HEX_COORDS[0]!;
    const hid = hexId(coord);
    const pts = [0, 1, 2, 3, 4, 5]
      .map((v) => getVertexPixel(`${hid}:${v}` as VertexId))
      .filter(Boolean) as Array<{ x: number; y: number }>;
    // All returned points should be distinct
    const unique = new Set(pts.map((p) => `${p.x},${p.y}`));
    expect(unique.size).toBe(pts.length);
  });
});

describe("getEdgePoints", () => {
  it("returns two pixel coordinates for every edge in the graph", () => {
    let tested = 0;
    for (const eid of Object.keys(graph.edges) as EdgeId[]) {
      const pts = getEdgePoints(eid);
      if (!pts) continue; // skip edges whose vertices aren't on the board
      expect(pts).toHaveLength(2);
      expect(Number.isFinite(pts[0].x)).toBe(true);
      expect(Number.isFinite(pts[0].y)).toBe(true);
      expect(Number.isFinite(pts[1].x)).toBe(true);
      expect(Number.isFinite(pts[1].y)).toBe(true);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });

  it("the two endpoints of an edge are different pixels", () => {
    const eid = Object.keys(graph.edges)[0] as EdgeId;
    const pts = getEdgePoints(eid);
    if (!pts) return; // skip if edge not renderable
    expect(pts[0].x !== pts[1].x || pts[0].y !== pts[1].y).toBe(true);
  });

  it("returns null for an unknown edge id", () => {
    expect(getEdgePoints("bogus:edge" as EdgeId)).toBeNull();
  });
});

describe("metropolisOverlayLayout", () => {
  const p = { x: 100, y: 200 };

  it("inner gap between pillar inner faces matches city left wing width (13px)", () => {
    const L = metropolisOverlayLayout(p);
    const innerLeft = L.leftShaft.x + L.leftShaft.width;
    const innerRight = L.rightShaft.x;
    expect(innerRight - innerLeft).toBeCloseTo(13, 5);
  });

  it("crossbar center sits two-thirds up from the shaft foot toward the shaft top", () => {
    const L = metropolisOverlayLayout(p);
    const shaftSpan = L.shaftFootY - L.shaftTopY;
    const distFootUpToCrossbar = L.shaftFootY - L.crossbarCenterY;
    expect(distFootUpToCrossbar / shaftSpan).toBeCloseTo(2 / 3, 5);
  });

  it("crossbar spans outer pillar faces", () => {
    const L = metropolisOverlayLayout(p);
    expect(L.crossbar.x).toBe(L.leftShaft.x);
    expect(L.crossbar.x + L.crossbar.width).toBe(L.rightShaft.x + L.rightShaft.width);
  });
});
