import { describe, expect, it } from "vitest";
import {
  parseLogLineSegments,
  type ParsedLogSegment,
} from "../../lib/catan/logParsing.js";

describe("logParsing", () => {
  it("parses tokenized roll lines into text and widget segments", () => {
    const segments = parseLogLineSegments(
      "Player 1 rolled [{die-yellow}|value=4] [{die-red}|value=3] = 7 [{event-die}|face=trade]",
    );

    expect(segments).toEqual([
      { type: "text", value: "Player 1 rolled " },
      { type: "die", color: "yellow", value: 4 },
      { type: "text", value: " " },
      { type: "die", color: "red", value: 3 },
      { type: "text", value: " = 7 " },
      { type: "event-die", face: "trade" },
    ] satisfies ParsedLogSegment[]);
  });

  it("parses tokenized delta and card widgets", () => {
    const segments = parseLogLineSegments(
      "Player 1 built a city. [{delta}|kind=ore&amount=-3] [{delta}|kind=grain&amount=-2] Then played [{card}|name=Mining].",
    );

    expect(segments).toEqual([
      { type: "text", value: "Player 1 built a city. " },
      { type: "delta", kind: "ore", amount: -3 },
      { type: "text", value: " " },
      { type: "delta", kind: "grain", amount: -2 },
      { type: "text", value: " Then played " },
      { type: "card", name: "Mining" },
      { type: "text", value: "." },
    ] satisfies ParsedLogSegment[]);
  });

  it("keeps unknown widget tokens as plain text", () => {
    expect(parseLogLineSegments("Before [{mystery}|foo=bar] after")).toEqual([
      { type: "text", value: "Before " },
      { type: "text", value: "[{mystery}|foo=bar]" },
      { type: "text", value: " after" },
    ] satisfies ParsedLogSegment[]);
  });

  it("keeps legacy card and delta markers working during migration", () => {
    expect(
      parseLogLineSegments("Player 1 played [card:Mining]. [delta:ore:+2]"),
    ).toEqual([
      { type: "text", value: "Player 1 played " },
      { type: "card", name: "Mining" },
      { type: "text", value: ". " },
      { type: "delta", kind: "ore", amount: 2 },
    ] satisfies ParsedLogSegment[]);
  });
});
