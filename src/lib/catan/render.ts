import type {
  GameState,
  HexId,
  VertexId,
  EdgeId,
  PlayerId,
  TerrainType,
  Building,
  Knight,
} from './types.js';
import { buildGraph, hexToPixel, vertexPixel, CATAN_HEX_COORDS, hexId } from './board.js';

const graph = buildGraph();

// ─── Constants ────────────────────────────────────────────────────────────────

export const HEX_SIZE = 70;
const SQRT3 = Math.sqrt(3);

const TERRAIN_COLORS: Record<TerrainType, string> = {
  hills:     '#c8622a',
  forest:    '#2d7a2d',
  mountains: '#7a7a7a',
  fields:    '#d4b800',
  pasture:   '#6dbf6d',
  desert:    '#c8b47a',
};

const TERRAIN_ICONS: Record<TerrainType, string> = {
  hills:     '🧱',
  forest:    '🌲',
  mountains: '⛰️',
  fields:    '🌾',
  pasture:   '🐑',
  desert:    '🏜️',
};

const NUMBER_DOTS: Record<number, number> = {
  2: 1, 12: 1, 3: 2, 11: 2, 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BoardCallbacks {
  onVertexClick(vid: VertexId): void;
  onEdgeClick(eid: EdgeId): void;
  onHexClick(hid: HexId): void;
}

export interface BoardRenderer {
  render(state: GameState, localPlayerId: PlayerId, validVertices?: Set<VertexId>, validEdges?: Set<EdgeId>, validHexes?: Set<HexId>): void;
  setCallbacks(cb: BoardCallbacks): void;
  destroy(): void;
}

// ─── SVG Helpers ──────────────────────────────────────────────────────────────

function svgNS(tag: string): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', tag) as SVGElement;
}

function hexPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (90 + 60 * i);
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(' ');
}

function getLayer(svg: SVGSVGElement, id: string): SVGGElement {
  return svg.querySelector(`#${id}`) as SVGGElement;
}

// ─── initBoardSVG ─────────────────────────────────────────────────────────────

export function initBoardSVG(container: SVGSVGElement): BoardRenderer {
  // Create layer structure
  const layers = ['hexes', 'numbers', 'harbors', 'roads', 'buildings', 'knights', 'tokens', 'hitboxes'];
  for (const id of layers) {
    const g = svgNS('g') as SVGGElement;
    g.setAttribute('id', id);
    container.appendChild(g);
  }

  // Add defs with building symbols
  const defs = svgNS('defs') as SVGDefsElement;
  defs.innerHTML = buildingDefs();
  container.insertBefore(defs, container.firstChild);

  let callbacks: BoardCallbacks = {
    onVertexClick: () => {},
    onEdgeClick: () => {},
    onHexClick: () => {},
  };

  function render(
    state: GameState,
    localPlayerId: PlayerId,
    validVertices: Set<VertexId> = new Set(),
    validEdges: Set<EdgeId> = new Set(),
    validHexes: Set<HexId> = new Set(),
  ) {
    renderHexes(container, state, validHexes, callbacks);
    renderNumbers(container, state);
    renderHarbors(container, state);
    renderRoads(container, state, validEdges, callbacks);
    renderBuildings(container, state, validVertices, localPlayerId, callbacks);
    renderKnights(container, state);
    renderTokens(container, state);
  }

  return {
    render,
    setCallbacks: (cb) => { callbacks = cb; },
    destroy: () => { container.innerHTML = ''; },
  };
}

// ─── Hex Layer ────────────────────────────────────────────────────────────────

function renderHexes(
  svg: SVGSVGElement,
  state: GameState,
  validHexes: Set<HexId>,
  cb: BoardCallbacks,
): void {
  const layer = getLayer(svg, 'hexes');
  layer.innerHTML = '';

  for (const coord of CATAN_HEX_COORDS) {
    const hid = hexId(coord);
    const hex = state.board.hexes[hid];
    if (!hex) continue;

    const { x, y } = hexToPixel(coord, HEX_SIZE);
    const pts = hexPoints(x, y, HEX_SIZE - 2);

    const poly = svgNS('polygon') as SVGPolygonElement;
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', TERRAIN_COLORS[hex.terrain]);
    poly.setAttribute('stroke', '#3a2a1a');
    poly.setAttribute('stroke-width', '2');

    if (validHexes.has(hid)) {
      poly.setAttribute('class', 'valid-hex');
      poly.setAttribute('stroke', '#ffcc00');
      poly.setAttribute('stroke-width', '4');
      poly.style.cursor = 'pointer';
      poly.addEventListener('click', () => cb.onHexClick(hid));
    }

    layer.appendChild(poly);

    // Terrain emoji label
    const txt = svgNS('text') as SVGTextElement;
    txt.setAttribute('x', String(x));
    txt.setAttribute('y', String(y - HEX_SIZE * 0.35));
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('font-size', '20');
    txt.textContent = TERRAIN_ICONS[hex.terrain];
    layer.appendChild(txt);
  }
}

// ─── Number Tokens ────────────────────────────────────────────────────────────

function renderNumbers(svg: SVGSVGElement, state: GameState): void {
  const layer = getLayer(svg, 'numbers');
  layer.innerHTML = '';

  for (const coord of CATAN_HEX_COORDS) {
    const hid = hexId(coord);
    const hex = state.board.hexes[hid];
    if (!hex || hex.number === null) continue;

    const { x, y } = hexToPixel(coord, HEX_SIZE);
    const isRed = hex.number === 6 || hex.number === 8;

    // Robber overlay
    if (hex.hasRobber) {
      const robber = svgNS('text') as SVGTextElement;
      robber.setAttribute('x', String(x));
      robber.setAttribute('y', String(y + 5));
      robber.setAttribute('text-anchor', 'middle');
      robber.setAttribute('font-size', '28');
      robber.textContent = '👺';
      layer.appendChild(robber);
      continue;
    }

    const circle = svgNS('circle') as SVGCircleElement;
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', '18');
    circle.setAttribute('fill', '#f5e6c8');
    circle.setAttribute('stroke', '#8b6914');
    circle.setAttribute('stroke-width', '1.5');
    layer.appendChild(circle);

    const num = svgNS('text') as SVGTextElement;
    num.setAttribute('x', String(x));
    num.setAttribute('y', String(y + 1));
    num.setAttribute('text-anchor', 'middle');
    num.setAttribute('dominant-baseline', 'middle');
    num.setAttribute('font-size', '15');
    num.setAttribute('font-weight', 'bold');
    num.setAttribute('fill', isRed ? '#cc2200' : '#2c1a0a');
    num.textContent = String(hex.number);
    layer.appendChild(num);

    // Probability dots
    const dots = NUMBER_DOTS[hex.number] ?? 0;
    for (let d = 0; d < dots; d++) {
      const dot = svgNS('circle') as SVGCircleElement;
      const dotX = x + (d - (dots - 1) / 2) * 5;
      dot.setAttribute('cx', String(dotX));
      dot.setAttribute('cy', String(y + 14));
      dot.setAttribute('r', '2');
      dot.setAttribute('fill', isRed ? '#cc2200' : '#2c1a0a');
      layer.appendChild(dot);
    }
  }
}

// ─── Harbors ──────────────────────────────────────────────────────────────────

function renderHarbors(svg: SVGSVGElement, state: GameState): void {
  const layer = getLayer(svg, 'harbors');
  layer.innerHTML = '';

  const harborIcons: Record<string, string> = {
    generic: '3:1', brick: '🧱2:1', lumber: '🌲2:1', ore: '⛰️2:1', grain: '🌾2:1', wool: '🐑2:1',
  };

  for (const harbor of state.board.harbors) {
    const [v1, v2] = harbor.vertices;
    if (!v1 || !v2) continue;

    const p1 = getVertexPixel(v1);
    const p2 = getVertexPixel(v2);
    if (!p1 || !p2) continue;

    // Place harbor token just outside the edge midpoint (pushed toward the sea)
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    // Normalize perpendicular and push outward by ~30px
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Determine outward direction: perp rotated toward sea (away from board center)
    // Try both perp directions and pick the one further from origin
    const perpX1 = -dy / len * 30;
    const perpY1 =  dx / len * 30;
    const perpX2 =  dy / len * 30;
    const perpY2 = -dx / len * 30;
    const dist1 = (midX + perpX1) ** 2 + (midY + perpY1) ** 2;
    const dist2 = (midX + perpX2) ** 2 + (midY + perpY2) ** 2;
    const [perpX, perpY] = dist1 > dist2 ? [perpX1, perpY1] : [perpX2, perpY2];
    const outerX = midX + perpX;
    const outerY = midY + perpY;

    // Connector lines from each vertex to the harbor token
    for (const p of [p1, p2]) {
      const line = svgNS('line') as SVGLineElement;
      line.setAttribute('x1', String(p.x));  line.setAttribute('y1', String(p.y));
      line.setAttribute('x2', String(outerX)); line.setAttribute('y2', String(outerY));
      line.setAttribute('stroke', '#5dade2');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '4 3');
      line.setAttribute('opacity', '0.7');
      layer.appendChild(line);
    }

    // Harbor token circle
    const bg = svgNS('circle') as SVGCircleElement;
    bg.setAttribute('cx', String(outerX));
    bg.setAttribute('cy', String(outerY));
    bg.setAttribute('r', '13');
    bg.setAttribute('fill', '#1a5276');
    bg.setAttribute('stroke', '#5dade2');
    bg.setAttribute('stroke-width', '1.5');
    layer.appendChild(bg);

    const txt = svgNS('text') as SVGTextElement;
    txt.setAttribute('x', String(outerX));
    txt.setAttribute('y', String(outerY + 1));
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('font-size', '8');
    txt.setAttribute('fill', 'white');
    txt.textContent = harborIcons[harbor.type] ?? '?';
    layer.appendChild(txt);
  }
}

// ─── Roads ────────────────────────────────────────────────────────────────────

function renderRoads(
  svg: SVGSVGElement,
  state: GameState,
  validEdges: Set<EdgeId>,
  cb: BoardCallbacks,
): void {
  const layer = getLayer(svg, 'roads');
  layer.innerHTML = '';

  // Draw hit boxes for valid edges first
  for (const eid of validEdges) {
    const pts = getEdgePoints(eid);
    if (!pts) continue;
    const line = svgNS('line') as SVGLineElement;
    line.setAttribute('x1', String(pts[0].x)); line.setAttribute('y1', String(pts[0].y));
    line.setAttribute('x2', String(pts[1].x)); line.setAttribute('y2', String(pts[1].y));
    line.setAttribute('stroke', '#ffcc00');
    line.setAttribute('stroke-width', '12');
    line.setAttribute('opacity', '0.4');
    line.setAttribute('stroke-linecap', 'round');
    line.style.cursor = 'pointer';
    line.addEventListener('click', () => cb.onEdgeClick(eid as EdgeId));
    layer.appendChild(line);
  }

  // Draw actual roads
  for (const [eid, road] of Object.entries(state.board.edges)) {
    if (!road) continue;
    const pts = getEdgePoints(eid);
    if (!pts) continue;
    const player = state.players[road.playerId];
    const line = svgNS('line') as SVGLineElement;
    line.setAttribute('x1', String(pts[0].x)); line.setAttribute('y1', String(pts[0].y));
    line.setAttribute('x2', String(pts[1].x)); line.setAttribute('y2', String(pts[1].y));
    line.setAttribute('stroke', player?.color ?? '#999');
    line.setAttribute('stroke-width', '8');
    line.setAttribute('stroke-linecap', 'round');
    layer.appendChild(line);
  }
}

function getEdgePoints(eid: string): [{ x: number; y: number }, { x: number; y: number }] | null {
  const [vA, vB] = graph.verticesOfEdge[eid as EdgeId] ?? [];
  if (!vA || !vB) return null;
  const pA = getVertexPixel(vA);
  const pB = getVertexPixel(vB);
  if (!pA || !pB) return null;
  return [pA, pB];
}

// ─── Buildings ────────────────────────────────────────────────────────────────

function renderBuildings(
  svg: SVGSVGElement,
  state: GameState,
  validVertices: Set<VertexId>,
  localPlayerId: PlayerId,
  cb: BoardCallbacks,
): void {
  const layer = getLayer(svg, 'buildings');
  layer.innerHTML = '';

  // Valid vertex hit rings
  for (const vid of validVertices) {
    const p = getVertexPixel(vid);
    if (!p) continue;
    const ring = svgNS('circle') as SVGCircleElement;
    ring.setAttribute('cx', String(p.x)); ring.setAttribute('cy', String(p.y));
    ring.setAttribute('r', '14');
    ring.setAttribute('fill', '#ffcc00');
    ring.setAttribute('opacity', '0.5');
    ring.style.cursor = 'pointer';
    ring.addEventListener('click', () => cb.onVertexClick(vid));
    layer.appendChild(ring);
  }

  // Draw buildings
  for (const [vid, building] of Object.entries(state.board.vertices)) {
    if (!building) continue;
    const p = getVertexPixel(vid as VertexId);
    if (!p) continue;
    const player = state.players[building.playerId];
    const color = player?.color ?? '#999';

    if (building.type === 'settlement') {
      drawSettlement(layer, p.x, p.y, color);
    } else if (building.type === 'city') {
      drawCity(layer, p.x, p.y, color, building.hasWall, building.metropolis !== null);
    }
  }
}

function drawSettlement(layer: SVGGElement, cx: number, cy: number, color: string): void {
  // House shape: square base + triangle roof
  const g = svgNS('g') as SVGGElement;
  const base = svgNS('rect') as SVGRectElement;
  base.setAttribute('x', String(cx - 8)); base.setAttribute('y', String(cy - 4));
  base.setAttribute('width', '16'); base.setAttribute('height', '12');
  base.setAttribute('fill', color); base.setAttribute('stroke', '#fff'); base.setAttribute('stroke-width', '1.5');
  g.appendChild(base);

  const roof = svgNS('polygon') as SVGPolygonElement;
  roof.setAttribute('points', `${cx},${cy - 16} ${cx + 10},${cy - 4} ${cx - 10},${cy - 4}`);
  roof.setAttribute('fill', color); roof.setAttribute('stroke', '#fff'); roof.setAttribute('stroke-width', '1.5');
  g.appendChild(roof);
  layer.appendChild(g);
}

function drawCity(layer: SVGGElement, cx: number, cy: number, color: string, hasWall: boolean, hasMetropolis: boolean): void {
  const g = svgNS('g') as SVGGElement;

  // City: two towers
  const base = svgNS('rect') as SVGRectElement;
  base.setAttribute('x', String(cx - 12)); base.setAttribute('y', String(cy - 8));
  base.setAttribute('width', '24'); base.setAttribute('height', '16');
  base.setAttribute('fill', color); base.setAttribute('stroke', '#fff'); base.setAttribute('stroke-width', '2');
  g.appendChild(base);

  const tower = svgNS('rect') as SVGRectElement;
  tower.setAttribute('x', String(cx - 6)); tower.setAttribute('y', String(cy - 18));
  tower.setAttribute('width', '12'); tower.setAttribute('height', '10');
  tower.setAttribute('fill', color); tower.setAttribute('stroke', '#fff'); tower.setAttribute('stroke-width', '2');
  g.appendChild(tower);

  if (hasWall) {
    const wall = svgNS('rect') as SVGRectElement;
    wall.setAttribute('x', String(cx - 16)); wall.setAttribute('y', String(cy + 8));
    wall.setAttribute('width', '32'); wall.setAttribute('height', '5');
    wall.setAttribute('fill', '#8b6914'); wall.setAttribute('stroke', '#fff'); wall.setAttribute('stroke-width', '1');
    g.appendChild(wall);
  }

  if (hasMetropolis) {
    const crown = svgNS('text') as SVGTextElement;
    crown.setAttribute('x', String(cx)); crown.setAttribute('y', String(cy - 20));
    crown.setAttribute('text-anchor', 'middle'); crown.setAttribute('font-size', '12');
    crown.textContent = '👑';
    g.appendChild(crown);
  }

  layer.appendChild(g);
}

// ─── Knights ──────────────────────────────────────────────────────────────────

function renderKnights(svg: SVGSVGElement, state: GameState): void {
  const layer = getLayer(svg, 'knights');
  layer.innerHTML = '';

  const knightEmoji = ['⚔️', '🗡️', '🛡️'];

  for (const [vid, knight] of Object.entries(state.board.knights)) {
    if (!knight) continue;
    const p = getVertexPixel(vid as VertexId);
    if (!p) continue;
    const player = state.players[knight.playerId];

    const g = svgNS('g') as SVGGElement;
    if (!knight.active) {
      g.setAttribute('transform', `rotate(90,${p.x},${p.y})`);
    }

    const bg = svgNS('circle') as SVGCircleElement;
    bg.setAttribute('cx', String(p.x)); bg.setAttribute('cy', String(p.y));
    bg.setAttribute('r', '12');
    bg.setAttribute('fill', player?.color ?? '#999');
    bg.setAttribute('stroke', '#fff'); bg.setAttribute('stroke-width', '2');
    g.appendChild(bg);

    const txt = svgNS('text') as SVGTextElement;
    txt.setAttribute('x', String(p.x)); txt.setAttribute('y', String(p.y + 2));
    txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('font-size', '12');
    txt.textContent = knightEmoji[knight.strength - 1] ?? '⚔️';
    g.appendChild(txt);

    layer.appendChild(g);
  }
}

// ─── Tokens ───────────────────────────────────────────────────────────────────

function renderTokens(svg: SVGSVGElement, state: GameState): void {
  const layer = getLayer(svg, 'tokens');
  layer.innerHTML = '';

  // Merchant token
  if (state.board.merchantHex) {
    const coord = CATAN_HEX_COORDS.find(c => hexId(c) === state.board.merchantHex);
    if (coord) {
      const { x, y } = hexToPixel(coord, HEX_SIZE);
      const txt = svgNS('text') as SVGTextElement;
      txt.setAttribute('x', String(x + 20)); txt.setAttribute('y', String(y - 20));
      txt.setAttribute('font-size', '18');
      txt.textContent = '🏪';
      layer.appendChild(txt);
    }
  }
}

// ─── Vertex Pixel Helper ──────────────────────────────────────────────────────

function getVertexPixel(vid: VertexId): { x: number; y: number } | null {
  const [hid, vStr] = vid.split(':');
  if (!hid || vStr === undefined) return null;
  const v = parseInt(vStr);
  const coord = CATAN_HEX_COORDS.find(c => hexId(c) === hid);
  if (!coord) return null;
  return vertexPixel(coord, v, HEX_SIZE);
}

// ─── Building Defs ────────────────────────────────────────────────────────────

function buildingDefs(): string {
  return `
    <filter id="drop-shadow">
      <feDropShadow dx="1" dy="1" stdDeviation="2" flood-opacity="0.4"/>
    </filter>
  `;
}
