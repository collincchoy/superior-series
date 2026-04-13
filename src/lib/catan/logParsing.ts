import type { Resources, EventDieFace, ProgressCardName } from "./types.js";
import type { CardDeltaKind } from "./uiEffects.js";

type DieColor = "yellow" | "red";
type WidgetId = "card" | "delta" | "die-yellow" | "die-red" | "event-die";

export type ParsedLogSegment =
  | { type: "text"; value: string }
  | { type: "card"; name: ProgressCardName }
  | { type: "delta"; kind: CardDeltaKind; amount: number }
  | { type: "die"; color: DieColor; value: number }
  | { type: "event-die"; face: EventDieFace };

const TOKEN_RE = /(\[\{[a-z-]+\}\|[^\]]*\]|\[card:[A-Za-z]+\]|\[delta:[a-z]+:[+-]?\d+\])/g;
const RESOURCE_ORDER: Array<keyof Resources> = [
  "brick",
  "lumber",
  "ore",
  "grain",
  "wool",
  "cloth",
  "coin",
  "paper",
];

function encodeProp(value: string | number): string {
  return encodeURIComponent(String(value));
}

function parseWidgetProps(raw: string): Record<string, string> {
  if (!raw) return {};

  return Object.fromEntries(
    raw
      .split("&")
      .filter(Boolean)
      .map((entry) => {
        const [key, ...rest] = entry.split("=");
        return [key ?? "", decodeURIComponent(rest.join("="))];
      })
      .filter(([key]) => key.length > 0),
  );
}

function parseWidgetSegment(token: string): ParsedLogSegment {
  const match = token.match(/^\[\{([a-z-]+)\}\|([^\]]*)\]$/);
  if (!match) return { type: "text", value: token };

  const widget = match[1] as WidgetId;
  const props = parseWidgetProps(match[2] ?? "");

  if (widget === "card") {
    const name = props.name as ProgressCardName | undefined;
    return name ? { type: "card", name } : { type: "text", value: token };
  }

  if (widget === "delta") {
    const kind = props.kind as CardDeltaKind | undefined;
    const amount = Number(props.amount);
    return kind && Number.isFinite(amount)
      ? { type: "delta", kind, amount }
      : { type: "text", value: token };
  }

  if (widget === "die-yellow" || widget === "die-red") {
    const value = Number(props.value);
    return Number.isInteger(value) && value >= 1 && value <= 6
      ? {
          type: "die",
          color: widget === "die-yellow" ? "yellow" : "red",
          value,
        }
      : { type: "text", value: token };
  }

  if (widget === "event-die") {
    const face = props.face as EventDieFace | undefined;
    if (
      face === "ship" ||
      face === "science" ||
      face === "trade" ||
      face === "politics"
    ) {
      return { type: "event-die", face };
    }
  }

  return { type: "text", value: token };
}

function parseLegacySegment(token: string): ParsedLogSegment {
  const cardMatch = token.match(/^\[card:([A-Za-z]+)\]$/);
  if (cardMatch) {
    return { type: "card", name: cardMatch[1] as ProgressCardName };
  }

  const deltaMatch = token.match(/^\[delta:([a-z]+):([+-]?\d+)\]$/);
  if (deltaMatch) {
    return {
      type: "delta",
      kind: deltaMatch[1] as CardDeltaKind,
      amount: Number(deltaMatch[2]),
    };
  }

  return { type: "text", value: token };
}

function parseSegmentToken(token: string): ParsedLogSegment {
  return token.startsWith("[{")
    ? parseWidgetSegment(token)
    : parseLegacySegment(token);
}

export function parseLogLineSegments(line: string): ParsedLogSegment[] {
  const segments: ParsedLogSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null = null;

  while ((match = TOKEN_RE.exec(line))) {
    const start = match.index;
    if (start > cursor) {
      segments.push({ type: "text", value: line.slice(cursor, start) });
    }
    segments.push(parseSegmentToken(match[0]));
    cursor = start + match[0].length;
  }

  if (cursor < line.length) {
    segments.push({ type: "text", value: line.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: line }];
}

export function logWidgetToken(
  widget: WidgetId,
  props: Record<string, string | number>,
): string {
  const encodedProps = Object.entries(props)
    .map(([key, value]) => `${key}=${encodeProp(value)}`)
    .join("&");
  return `[{${widget}}|${encodedProps}]`;
}

export function logCardToken(name: ProgressCardName): string {
  return logWidgetToken("card", { name });
}

export function logDieToken(color: DieColor, value: number): string {
  return logWidgetToken(color === "yellow" ? "die-yellow" : "die-red", {
    value,
  });
}

export function logEventDieToken(face: EventDieFace): string {
  return logWidgetToken("event-die", { face });
}

export function logDeltaToken(kind: CardDeltaKind, amount: number): string {
  return logWidgetToken("delta", { kind, amount });
}

export function logResourceDeltaTokens(
  delta: Partial<Resources>,
  multiplier: 1 | -1 = 1,
): string[] {
  return RESOURCE_ORDER.flatMap((kind) => {
    const amount = (delta[kind] ?? 0) * multiplier;
    if (amount === 0) return [];
    return [logDeltaToken(kind, amount)];
  });
}
