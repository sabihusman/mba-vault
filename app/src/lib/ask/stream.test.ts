import { describe, it, expect } from "vitest";
import { splitNdjson, parseEvent, isNotCovered } from "./stream";

describe("splitNdjson", () => {
  it("emits complete lines and keeps the trailing partial as rest", () => {
    const { lines, rest } = splitNdjson('{"a":1}\n{"b":2}\n{"c":');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('{"c":');
  });

  it("returns no lines when nothing is newline-terminated yet", () => {
    const { lines, rest } = splitNdjson('{"partial":tr');
    expect(lines).toEqual([]);
    expect(rest).toBe('{"partial":tr');
  });

  it("skips blank lines", () => {
    const { lines } = splitNdjson('{"a":1}\n\n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });
});

describe("parseEvent", () => {
  it("parses citations, text, and error events", () => {
    expect(parseEvent('{"type":"text","text":"hi"}')).toEqual({ type: "text", text: "hi" });
    expect(parseEvent('{"type":"error","message":"boom"}')).toEqual({ type: "error", message: "boom" });
    const c = parseEvent('{"type":"citations","citations":[{"n":1,"course":"C","file":"C/a.pdf","loc":{"kind":"page","index":3},"score":0.9}]}');
    expect(c?.type).toBe("citations");
  });

  it("returns null for malformed or unknown lines", () => {
    expect(parseEvent("not json")).toBeNull();
    expect(parseEvent('{"type":"nope"}')).toBeNull();
    expect(parseEvent('{"type":"text"}')).toBeNull(); // missing text
  });
});

describe("isNotCovered", () => {
  it("flags decline phrasings", () => {
    expect(isNotCovered("I don't have that in the coursework.")).toBe(true);
    expect(isNotCovered("That isn't covered in your materials.")).toBe(true);
    expect(isNotCovered("This topic is not covered.")).toBe(true);
  });

  it("does not flag a substantive answer that merely mentions coursework", () => {
    const long = "Customer acquisition cost is total sales and marketing spend divided by new customers acquired. ".repeat(6);
    expect(isNotCovered(long)).toBe(false);
    expect(isNotCovered("CAC is defined as spend divided by customers [1].")).toBe(false);
  });

  it("is false for empty text", () => {
    expect(isNotCovered("   ")).toBe(false);
  });
});
