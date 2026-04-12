import { describe, it, expect, beforeEach } from "vitest";
import { buildGraph, CATAN_HEX_COORDS, hexId } from "../../lib/catan/board.js";
import type {
  BoardState,
  HexId,
  VertexId,
  EdgeId,
  GameState,
  Player,
} from "../../lib/catan/types.js";
import { emptyResources } from "../../lib/catan/types.js";
import {
  canPlaceSettlement,
  canPlaceCity,
  canPlaceRoad,
  canBuildRoad,
  canBuildSettlement,
  canBuildCity,
  canBuildCityWall,
  canRecruitKnight,
  canPromoteKnight,
  canActivateKnight,
  canMoveKnight,
  canDisplaceKnight,
  canImproveCity,
} from "../../lib/catan/rules.js";

// ─── Test setup helpers ───────────────────────────────────────────────────────

const graph = buildGraph();

function makeBoard(): BoardState {
  const hexes: Record<HexId, any> = {};
  for (const coord of CATAN_HEX_COORDS) {
    const id = hexId(coord);
    hexes[id] = { id, coord, terrain: "hills", number: 5, hasRobber: false };
  }
  return {
    hexes,
    vertices: Object.fromEntries(
      Object.keys(graph.vertices).map((v) => [v, null]),
    ),
    edges: Object.fromEntries(Object.keys(graph.edges).map((e) => [e, null])),
    knights: Object.fromEntries(
      Object.keys(graph.vertices).map((v) => [v, null]),
    ),
    harbors: [],
    merchantHex: null,
    merchantOwner: null,
  };
}

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    color: "#ff0000",
    isBot: false,
    resources: {
      ...emptyResources(),
      brick: 5,
      lumber: 5,
      ore: 5,
      grain: 5,
      wool: 5,
      cloth: 5,
      coin: 5,
      paper: 5,
    },
    progressCards: [],
    vpTokens: 0,
    improvements: { science: 0, trade: 0, politics: 0 },
    supply: {
      roads: 15,
      settlements: 4,
      cities: 4,
      cityWalls: 3,
      knights: { 1: 2, 2: 2, 3: 2 },
    },
    knightsActivatedTotal: 0,
    ...overrides,
  };
}

function getFirstVertex(): VertexId {
  return Object.keys(graph.vertices)[0] as VertexId;
}

function getConnectedVertexAndEdge(startVertex: VertexId): {
  vertex: VertexId;
  edge: EdgeId;
} {
  const edges = graph.edgesOfVertex[startVertex] ?? [];
  const edge = edges[0]!;
  const [vA, vB] = graph.verticesOfEdge[edge]!;
  const vertex = vA === startVertex ? vB! : vA!;
  return { vertex, edge };
}

// ─── canPlaceSettlement ───────────────────────────────────────────────────────

describe("canPlaceSettlement (setup phase)", () => {
  it("succeeds on empty vertex with no adjacent buildings", () => {
    const board = makeBoard();
    const vid = getFirstVertex();
    expect(canPlaceSettlement(board, graph, "p1", vid, true)).toBe(true);
  });

  it("fails if vertex is already occupied", () => {
    const board = makeBoard();
    const vid = getFirstVertex();
    board.vertices[vid] = { type: "settlement", playerId: "p2" };
    expect(canPlaceSettlement(board, graph, "p1", vid, true)).toBe(false);
  });

  it("fails if an adjacent vertex is occupied (distance rule)", () => {
    const board = makeBoard();
    const vid = getFirstVertex();
    const adj = graph.adjacentVertices[vid]![0]!;
    board.vertices[adj] = { type: "settlement", playerId: "p2" };
    expect(canPlaceSettlement(board, graph, "p1", vid, true)).toBe(false);
  });

  it("fails during action phase if not connected to own road", () => {
    const board = makeBoard();
    const vid = getFirstVertex();
    expect(canPlaceSettlement(board, graph, "p1", vid, false)).toBe(false);
  });

  it("succeeds during action phase when connected to own road", () => {
    const board = makeBoard();
    // Build a road chain: find 3 connected edges that form a path A→B→C→D
    // where A has no adjacent occupied vertices and D is not adjacent to A or B
    const allEdges = Object.keys(graph.edges) as EdgeId[];
    let found = false;
    for (const e1 of allEdges) {
      const [a, b] = graph.verticesOfEdge[e1]!;
      if (!a || !b) continue;
      for (const e2 of graph.edgesOfVertex[b] ?? []) {
        if (e2 === e1) continue;
        const [, c] = graph.verticesOfEdge[e2]!;
        if (!c || c === a) continue;
        // c is 2 hops from a; check c is not adjacent to a (distance rule)
        if ((graph.adjacentVertices[a] ?? []).includes(c)) continue;
        // Place settlement at a, roads e1+e2, attempt to place settlement at c
        board.vertices[a] = { type: "settlement", playerId: "p1" };
        board.edges[e1] = { playerId: "p1" };
        board.edges[e2] = { playerId: "p1" };
        expect(canPlaceSettlement(board, graph, "p1", c, false)).toBe(true);
        found = true;
        break;
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });
});

// ─── canPlaceRoad ─────────────────────────────────────────────────────────────

describe("canPlaceRoad (setup phase)", () => {
  it("succeeds on empty edge adjacent to own settlement", () => {
    const board = makeBoard();
    const vid = getFirstVertex();
    board.vertices[vid] = { type: "settlement", playerId: "p1" };
    const edges = graph.edgesOfVertex[vid]!;
    expect(canPlaceRoad(board, graph, "p1", edges[0]!, vid)).toBe(true);
  });

  it("fails on occupied edge", () => {
    const board = makeBoard();
    const vid = getFirstVertex();
    board.vertices[vid] = { type: "settlement", playerId: "p1" };
    const edges = graph.edgesOfVertex[vid]!;
    board.edges[edges[0]!] = { playerId: "p2" };
    expect(canPlaceRoad(board, graph, "p1", edges[0]!, vid)).toBe(false);
  });
});

// ─── canBuildRoad ──────────────────────────────────────────────────────────────

describe("canBuildRoad (action phase)", () => {
  it("succeeds when connected to own road and has resources", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    const vid = getFirstVertex();
    board.vertices[vid] = { type: "settlement", playerId: "p1" };
    const edges = graph.edgesOfVertex[vid]!;
    board.edges[edges[0]!] = { playerId: "p1" };
    // Try to build the second edge
    expect(canBuildRoad(board, graph, player, edges[1]!)).toBe(true);
  });

  it("fails with no resources", () => {
    const board = makeBoard();
    const player = makePlayer("p1", { resources: emptyResources() });
    const vid = getFirstVertex();
    board.vertices[vid] = { type: "settlement", playerId: "p1" };
    const edges = graph.edgesOfVertex[vid]!;
    expect(canBuildRoad(board, graph, player, edges[0]!)).toBe(false);
  });

  it("fails when not connected to own network", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    const edges = Object.keys(graph.edges) as EdgeId[];
    expect(canBuildRoad(board, graph, player, edges[0]!)).toBe(false);
  });
});

// ─── canBuildSettlement ───────────────────────────────────────────────────────

describe("canBuildSettlement (action phase)", () => {
  it("fails if no settlement supply", () => {
    const board = makeBoard();
    const player = makePlayer("p1", {
      supply: {
        roads: 15,
        settlements: 0,
        cities: 4,
        cityWalls: 3,
        knights: { 1: 2, 2: 2, 3: 2 },
      },
    });
    const vid = getFirstVertex();
    const edges = graph.edgesOfVertex[vid]!;
    board.edges[edges[0]!] = { playerId: "p1" };
    expect(canBuildSettlement(board, graph, player, vid)).toBe(false);
  });

  it("fails with insufficient resources", () => {
    const board = makeBoard();
    const player = makePlayer("p1", { resources: emptyResources() });
    const vid = getFirstVertex();
    const edges = graph.edgesOfVertex[vid]!;
    board.edges[edges[0]!] = { playerId: "p1" };
    expect(canBuildSettlement(board, graph, player, vid)).toBe(false);
  });
});

// ─── canBuildCity ─────────────────────────────────────────────────────────────

describe("canBuildCity", () => {
  it("succeeds when player has settlement at vertex and resources", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    const vid = getFirstVertex();
    board.vertices[vid] = { type: "settlement", playerId: "p1" };
    expect(canBuildCity(board, player, vid)).toBe(true);
  });

  it("fails when vertex has no settlement", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    const vid = getFirstVertex();
    expect(canBuildCity(board, player, vid)).toBe(false);
  });

  it("fails when vertex has opponent settlement", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    const vid = getFirstVertex();
    board.vertices[vid] = { type: "settlement", playerId: "p2" };
    expect(canBuildCity(board, player, vid)).toBe(false);
  });

  it("fails with insufficient resources", () => {
    const board = makeBoard();
    const player = makePlayer("p1", { resources: emptyResources() });
    const vid = getFirstVertex();
    board.vertices[vid] = { type: "settlement", playerId: "p1" };
    expect(canBuildCity(board, player, vid)).toBe(false);
  });
});

// ─── canBuildCityWall ─────────────────────────────────────────────────────────

describe("canBuildCityWall", () => {
  it("succeeds on own city without wall", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    const vid = getFirstVertex();
    board.vertices[vid] = {
      type: "city",
      playerId: "p1",
      hasWall: false,
      metropolis: null,
    };
    expect(canBuildCityWall(board, player, vid)).toBe(true);
  });

  it("fails on city that already has a wall", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    const vid = getFirstVertex();
    board.vertices[vid] = {
      type: "city",
      playerId: "p1",
      hasWall: true,
      metropolis: null,
    };
    expect(canBuildCityWall(board, player, vid)).toBe(false);
  });

  it("fails when no city walls in supply", () => {
    const board = makeBoard();
    const player = makePlayer("p1", {
      supply: {
        roads: 15,
        settlements: 4,
        cities: 4,
        cityWalls: 0,
        knights: { 1: 2, 2: 2, 3: 2 },
      },
    });
    const vid = getFirstVertex();
    board.vertices[vid] = {
      type: "city",
      playerId: "p1",
      hasWall: false,
      metropolis: null,
    };
    expect(canBuildCityWall(board, player, vid)).toBe(false);
  });

  it("fails with insufficient resources", () => {
    const board = makeBoard();
    const player = makePlayer("p1", { resources: emptyResources() });
    const vid = getFirstVertex();
    board.vertices[vid] = {
      type: "city",
      playerId: "p1",
      hasWall: false,
      metropolis: null,
    };
    expect(canBuildCityWall(board, player, vid)).toBe(false);
  });
});

// ─── canRecruitKnight ─────────────────────────────────────────────────────────

describe("canRecruitKnight", () => {
  it("succeeds on empty vertex connected to own road with resources", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    const vid = getFirstVertex();
    board.vertices[vid] = { type: "settlement", playerId: "p1" };
    const edges = graph.edgesOfVertex[vid]!;
    board.edges[edges[0]!] = { playerId: "p1" };
    const [vA, vB] = graph.verticesOfEdge[edges[0]!]!;
    const targetVid = vA === vid ? vB! : vA!;
    expect(canRecruitKnight(board, graph, player, targetVid)).toBe(true);
  });

  it("fails when vertex is already occupied", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    const vid = getFirstVertex();
    board.vertices[vid] = {
      type: "city",
      playerId: "p1",
      hasWall: false,
      metropolis: null,
    };
    expect(canRecruitKnight(board, graph, player, vid)).toBe(false);
  });

  it("fails when not connected to own road network", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    const vid = getFirstVertex();
    expect(canRecruitKnight(board, graph, player, vid)).toBe(false);
  });

  it("fails with no basic knights in supply", () => {
    const board = makeBoard();
    const player = makePlayer("p1", {
      supply: {
        roads: 15,
        settlements: 4,
        cities: 4,
        cityWalls: 3,
        knights: { 1: 0, 2: 2, 3: 2 },
      },
    });
    const vid = getFirstVertex();
    board.vertices[vid] = { type: "settlement", playerId: "p1" };
    const edges = graph.edgesOfVertex[vid]!;
    board.edges[edges[0]!] = { playerId: "p1" };
    const [vA, vB] = graph.verticesOfEdge[edges[0]!]!;
    const targetVid = vA === vid ? vB! : vA!;
    expect(canRecruitKnight(board, graph, player, targetVid)).toBe(false);
  });
});

// ─── canDisplaceKnight ────────────────────────────────────────────────────────

describe("canDisplaceKnight", () => {
  it("succeeds when player knight is stronger than target", () => {
    const board = makeBoard();
    const vertices = Object.keys(graph.vertices) as VertexId[];
    const fromVid = vertices[0]!;
    const edges = graph.edgesOfVertex[fromVid]!;
    const edge = edges[0]!;
    const [vA, vB] = graph.verticesOfEdge[edge]!;
    const targetVid = vA === fromVid ? vB! : vA!;

    board.knights[fromVid] = { playerId: "p1", strength: 2, active: true };
    board.knights[targetVid] = { playerId: "p2", strength: 1, active: false };
    board.edges[edge] = { playerId: "p1" };

    expect(canDisplaceKnight(board, graph, "p1", fromVid, targetVid)).toBe(
      true,
    );
  });

  it("fails when player knight is equal strength", () => {
    const board = makeBoard();
    const vertices = Object.keys(graph.vertices) as VertexId[];
    const fromVid = vertices[0]!;
    const edges = graph.edgesOfVertex[fromVid]!;
    const edge = edges[0]!;
    const [vA, vB] = graph.verticesOfEdge[edge]!;
    const targetVid = vA === fromVid ? vB! : vA!;

    board.knights[fromVid] = { playerId: "p1", strength: 2, active: true };
    board.knights[targetVid] = { playerId: "p2", strength: 2, active: false };
    board.edges[edge] = { playerId: "p1" };

    expect(canDisplaceKnight(board, graph, "p1", fromVid, targetVid)).toBe(
      false,
    );
  });

  it("fails when player knight is weaker", () => {
    const board = makeBoard();
    const vertices = Object.keys(graph.vertices) as VertexId[];
    const fromVid = vertices[0]!;
    const edges = graph.edgesOfVertex[fromVid]!;
    const edge = edges[0]!;
    const [vA, vB] = graph.verticesOfEdge[edge]!;
    const targetVid = vA === fromVid ? vB! : vA!;

    board.knights[fromVid] = { playerId: "p1", strength: 1, active: true };
    board.knights[targetVid] = { playerId: "p2", strength: 3, active: false };
    board.edges[edge] = { playerId: "p1" };

    expect(canDisplaceKnight(board, graph, "p1", fromVid, targetVid)).toBe(
      false,
    );
  });

  it("fails when source knight is not active", () => {
    const board = makeBoard();
    const vertices = Object.keys(graph.vertices) as VertexId[];
    const fromVid = vertices[0]!;
    const edges = graph.edgesOfVertex[fromVid]!;
    const edge = edges[0]!;
    const [vA, vB] = graph.verticesOfEdge[edge]!;
    const targetVid = vA === fromVid ? vB! : vA!;

    board.knights[fromVid] = { playerId: "p1", strength: 3, active: false };
    board.knights[targetVid] = { playerId: "p2", strength: 1, active: false };
    board.edges[edge] = { playerId: "p1" };

    expect(canDisplaceKnight(board, graph, "p1", fromVid, targetVid)).toBe(
      false,
    );
  });
});

// ─── canImproveCity ───────────────────────────────────────────────────────────

describe("canImproveCity", () => {
  it("fails when player has no cities on board", () => {
    const board = makeBoard();
    const player = makePlayer("p1");
    expect(canImproveCity(board, player, "science")).toBe(false);
  });

  it("fails when already at level 5", () => {
    const board = makeBoard();
    const player = makePlayer("p1", {
      improvements: { science: 5, trade: 0, politics: 0 },
    });
    const vid = getFirstVertex();
    board.vertices[vid] = {
      type: "city",
      playerId: "p1",
      hasWall: false,
      metropolis: null,
    };
    expect(canImproveCity(board, player, "science")).toBe(false);
  });

  it("fails with insufficient commodities", () => {
    const board = makeBoard();
    const player = makePlayer("p1", {
      improvements: { science: 2, trade: 0, politics: 0 },
      resources: { ...emptyResources(), paper: 0 }, // need 3 paper for level 3
    });
    const vid = getFirstVertex();
    board.vertices[vid] = {
      type: "city",
      playerId: "p1",
      hasWall: false,
      metropolis: null,
    };
    expect(canImproveCity(board, player, "science")).toBe(false);
  });

  it("succeeds when player has a city and enough commodities", () => {
    const board = makeBoard();
    const player = makePlayer("p1", {
      improvements: { science: 0, trade: 0, politics: 0 },
      resources: { ...emptyResources(), paper: 1 },
    });
    const vid = getFirstVertex();
    board.vertices[vid] = {
      type: "city",
      playerId: "p1",
      hasWall: false,
      metropolis: null,
    };
    expect(canImproveCity(board, player, "science")).toBe(true);
  });
});
