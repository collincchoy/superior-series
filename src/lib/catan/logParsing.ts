import type { CardDeltaKind } from "./uiEffects.js";

export type ParsedLogSegment =
  | { type: "text"; value: string }
  | { type: "delta"; kind: CardDeltaKind; amount: number };

function parseTradeList(
  text: string,
  sign: 1 | -1,
): Array<{ type: "delta"; kind: CardDeltaKind; amount: number }> {
  return text
    .split(/,\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const match = part.match(/^(\d+)\s+([a-z]+)$/i);
      if (!match) return [];
      return [
        {
          type: "delta" as const,
          kind: match[2]!.toLowerCase() as CardDeltaKind,
          amount: Number(match[1]) * sign,
        },
      ];
    });
}

export function parseTradeLogSegments(line: string): ParsedLogSegment[] | null {
  const normalized = line.trim();
  const prefix = "traded with the bank.";
  const idx = normalized.indexOf(prefix);
  if (idx === -1) return null;

  const baseText = normalized.slice(0, idx + prefix.length);
  let remainder = normalized.slice(idx + prefix.length).trim();

  if (!remainder) {
    return [{ type: "text", value: baseText }];
  }

  if (remainder.endsWith(".")) {
    remainder = remainder.slice(0, -1).trim();
  }

  const segments: ParsedLogSegment[] = [{ type: "text", value: baseText }];
  const gaveMatch = remainder.match(/^Gave\s+(.+?)(?:;\s*got\s+(.+))?$/i);
  const gotOnlyMatch = remainder.match(/^Got\s+(.+)$/i);

  if (gaveMatch) {
    const gaveText = gaveMatch[1]?.trim() ?? "";
    const gotText = gaveMatch[2]?.trim() ?? "";
    if (gaveText) segments.push(...parseTradeList(gaveText, -1));
    if (gotText) segments.push(...parseTradeList(gotText, 1));
    return segments;
  }

  if (gotOnlyMatch) {
    const gotText = gotOnlyMatch[1]?.trim() ?? "";
    if (gotText) segments.push(...parseTradeList(gotText, 1));
    return segments;
  }

  return [{ type: "text", value: normalized }];
}
