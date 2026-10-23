import { describe, expect, it } from "vitest";
import { parseEntries } from "./urlUtils.js";

describe("parseEntries - Page URLs mode", () => {
  it("accepts a single page URL", () => {
    const [item] = parseEntries("https://www.royalsundaram.in/copyright", "pages");
    expect(item.ok).toBe(true);
    expect(item.url).toBe("https://www.royalsundaram.in/copyright");
  });

  it("accepts several URLs separated by commas", () => {
    const text =
      "https://www.royalsundaram.in/copyright , https://www.royalsundaram.in/disclaimer,https://www.royalsundaram.in/claims";
    const items = parseEntries(text, "pages");

    expect(items).toHaveLength(3);
    expect(items.every((i) => i.ok)).toBe(true);
  });

  it("rejects a bare domain", () => {
    const [item] = parseEntries("https://www.royalsundaram.in", "pages");
    expect(item.ok).toBe(false);
    expect(item.error).toMatch(/domain/i);
  });

  it("rejects text that is not a URL", () => {
    const [item] = parseEntries("abc", "pages");
    expect(item.ok).toBe(false);
  });

  it("returns nothing for empty input", () => {
    expect(parseEntries("", "pages")).toEqual([]);
  });

  it("removes duplicate URLs", () => {
    const items = parseEntries("https://a.com/x, https://a.com/x", "pages");
    expect(items).toHaveLength(1);
  });
});

describe("parseEntries - Whole domain mode", () => {
  it("accepts a domain", () => {
    const [item] = parseEntries("https://www.royalsundaram.in", "domain");
    expect(item.ok).toBe(true);
  });

  it("rejects a page URL", () => {
    const [item] = parseEntries("https://www.royalsundaram.in/copyright", "domain");
    expect(item.ok).toBe(false);
  });

  it("allows only one domain", () => {
    const items = parseEntries("https://a.com, https://b.com", "domain");
    expect(items[0].ok).toBe(true);
    expect(items[1].ok).toBe(false);
  });
});