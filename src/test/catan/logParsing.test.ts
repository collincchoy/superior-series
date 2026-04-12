import { describe, expect, it } from "vitest";
import {
  parseTradeLogSegments,
  type ParsedLogSegment,
} from "../../lib/catan/logParsing.js";

describe("logParsing", () => {
  it("parses bank trade line into text and delta segments", () => {
    const segments = parseTradeLogSegments(
      "Player 1 traded with the bank. Gave 4 brick; got 1 lumber.",
    );

    expect(segments).toEqual([
      { type: "text", value: "Player 1 traded with the bank." },
      { type: "delta", kind: "brick", amount: -4 },
      { type: "delta", kind: "lumber", amount: 1 },
    ] satisfies ParsedLogSegment[]);
  });

  it("parses trade line with trailing whitespace", () => {
    const segments = parseTradeLogSegments(
      "Player 1 traded with the bank. Gave 4 brick; got 1 lumber.   ",
    );

    expect(segments?.[0]).toEqual({
      type: "text",
      value: "Player 1 traded with the bank.",
    });
    expect(segments?.slice(1)).toEqual([
      { type: "delta", kind: "brick", amount: -4 },
      { type: "delta", kind: "lumber", amount: 1 },
    ] satisfies ParsedLogSegment[]);
  });

  it("returns null for unrelated log lines", () => {
    expect(parseTradeLogSegments("Player 1 built a road.")).toBeNull();
  });
});
