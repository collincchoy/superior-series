/**
 * svgHelpers.ts — Pure SVG math extracted from render.ts.
 * No DOM, no side effects — just coordinate calculations and constants.
 */

import type { TerrainType, VertexId, EdgeId } from "./types.js";
import {
  buildGraph,
  hexToPixel,
  vertexPixel,
  CATAN_HEX_COORDS,
  hexId,
} from "./board.js";

export const HEX_SIZE = 90;

const graph = buildGraph();

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  hills: "#c8622a",
  forest: "#2d7a2d",
  mountains: "#7a7a7a",
  fields: "#d4b800",
  pasture: "#6dbf6d",
  desert: "#c8b47a",
};

export const TERRAIN_GRADIENTS: Record<TerrainType, [string, string]> = {
  hills:     ["#cc5520", "#8a3210"],
  forest:    ["#2a7228", "#1a5218"],
  mountains: ["#9a9a9a", "#686868"],
  fields:    ["#e8cc28", "#c0a012"],
  pasture:   ["#60c040", "#3a8a28"],
  desert:    ["#d4b87a", "#a88848"],
};

export const TERRAIN_ICONS: Record<TerrainType, string> = {
  hills: "🧱",
  forest: "🌲",
  mountains: "⛰️",
  fields: "🌾",
  pasture: "🐑",
  desert: "🏜️",
};

export const NUMBER_DOTS: Record<number, number> = {
  2: 1,
  12: 1,
  3: 2,
  11: 2,
  4: 3,
  10: 3,
  5: 4,
  9: 4,
  6: 5,
  8: 5,
};

export const HARBOR_ICONS: Record<string, string> = {
  generic: "3:1",
  brick: "🧱2:1",
  lumber: "🌲2:1",
  ore: "⛰️2:1",
  grain: "🌾2:1",
  wool: "🐑2:1",
};

/** Returns SVG polygon points string for a pointy-top hex centered at (cx, cy). */
export function hexPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (90 + 60 * i);
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(" ");
}

/** Returns pixel coords for a hex given its axial coord and the board HEX_SIZE. */
export function hexCenter(coord: { q: number; r: number }): {
  x: number;
  y: number;
} {
  return hexToPixel(coord, HEX_SIZE);
}

/** Returns pixel coords for a vertex by its VertexId, or null if not found. */
export function getVertexPixel(vid: VertexId): { x: number; y: number } | null {
  const [hid, vStr] = vid.split(":");
  if (!hid || vStr === undefined) return null;
  const v = parseInt(vStr);
  const coord = CATAN_HEX_COORDS.find((c) => hexId(c) === hid);
  if (!coord) return null;
  return vertexPixel(coord, v, HEX_SIZE);
}

/** Returns the two pixel endpoints for an edge by its EdgeId, or null if not found. */
export function getEdgePoints(
  eid: EdgeId,
): [{ x: number; y: number }, { x: number; y: number }] | null {
  const [vA, vB] = graph.verticesOfEdge[eid] ?? [];
  if (!vA || !vB) return null;
  const pA = getVertexPixel(vA);
  const pB = getVertexPixel(vB);
  if (!pA || !pB) return null;
  return [pA, pB];
}

export { CATAN_HEX_COORDS, hexId };

/** Board + HUD: settlement draws smaller than city (upgrade visual hierarchy). */
export const SETTLEMENT_BOARD_SCALE = 0.88;

export type MetropolisOverlayLayout = {
  leftShaft: { x: number; y: number; width: number; height: number };
  rightShaft: { x: number; y: number; width: number; height: number };
  crossbar: { x: number; y: number; width: number; height: number };
  /** Polygon points for left pillar gable */
  leftRoofPoints: string;
  /** Polygon points for right pillar gable */
  rightRoofPoints: string;
  shadeRect: { x: number; y: number; width: number; height: number };
  crossbarCenterY: number;
  shaftFootY: number;
  shaftTopY: number;
};

/**
 * SVG layout for the metropolis H-piece over the city's left wing.
 * Pillars straddle x ∈ [p.x−15, p.x−2] (13px gap); feet near base y = p.y+8 so the piece
 * straddles the lower-left house; crossbar at 2/3 height from foot toward top.
 */
export function metropolisOverlayLayout(p: {
  x: number;
  y: number;
}): MetropolisOverlayLayout {
  const ox = p.x;
  const oy = p.y;
  /** Pillar feet sit just above the city base (shared horizontal at p.y+8). */
  const shaftFootY = oy + 7;
  /** Top of rectangular pillar shaft (below gable peak). */
  const shaftTopY = oy - 27;
  const peakY = oy - 30;
  const shaftSpan = shaftFootY - shaftTopY;
  const crossbarCenterY = shaftFootY - (2 / 3) * shaftSpan;

  const leftW = 5;
  const rightW = 5;
  const leftX = ox - 20;
  const rightX = ox - 2;
  const shaftH = shaftFootY - shaftTopY;

  const crossbarH = 6;
  const crossbarY = crossbarCenterY - crossbarH / 2;
  const crossbarW = rightX + rightW - leftX;

  const leftRoofPoints = `${leftX},${shaftTopY} ${leftX + leftW},${shaftTopY} ${ox - 17.5},${peakY}`;
  const rightRoofPoints = `${rightX},${shaftTopY} ${rightX + rightW},${shaftTopY} ${ox + 0.5},${peakY}`;

  return {
    leftShaft: { x: leftX, y: shaftTopY, width: leftW, height: shaftH },
    rightShaft: { x: rightX, y: shaftTopY, width: rightW, height: shaftH },
    crossbar: { x: leftX, y: crossbarY, width: crossbarW, height: crossbarH },
    leftRoofPoints,
    rightRoofPoints,
    shadeRect: {
      x: leftX,
      y: peakY,
      width: crossbarW,
      height: shaftFootY - peakY,
    },
    crossbarCenterY,
    shaftFootY,
    shaftTopY,
  };
}
