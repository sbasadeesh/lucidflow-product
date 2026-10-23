import { describe, expect, it } from "vitest";
import { toArgb } from "./export/excelTheme.js";
import { applyTheme, cssVars, theme } from "./theme.js";

const REQUIRED_COLOURS = [
  "primary",
  "secondary",
  "text",
  "surface",
  "surface2",
  "surface3",
  "card",
  "track",
  "border",
  "borderStrong",
  "muted",
  "mutedSoft",
  "success",
  "link",
];

// Every source file except the theme file and the tests (read as plain text)
const sourceFiles = import.meta.glob(
  ["./**/*.{css,js,jsx}", "!./**/*.test.{js,jsx}", "!./test/**", "!./theme.js"],
  { query: "?raw", import: "default", eager: true },
);

describe("Theme file", () => {
  it("Given the theme file, then it exposes every colour token as a hex value", () => {
    REQUIRED_COLOURS.forEach((name) => {
      expect(theme.colors[name], `colour "${name}"`).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it("Given the brand colours, then primary is black, text is white and secondary is red", () => {
    expect(theme.colors.primary).toBe("#000000");
    expect(theme.colors.text).toBe("#ffffff");
    expect(theme.colors.secondary).toBe("#e7000b");
  });

  it("Given the font settings, then the font is Arial and sizes 8, 9 and 10 pt exist", () => {
    expect(theme.font.family).toMatch(/^Arial/);
    expect([theme.fontSizes.s, theme.fontSizes.m, theme.fontSizes.l]).toEqual([
      "8pt",
      "9pt",
      "10pt",
    ]);
  });

  it("Given the theme, then every colour and font size becomes a CSS variable", () => {
    const vars = cssVars();
    expect(vars["--secondary"]).toBe("#e7000b");
    expect(vars["--border-strong"]).toBe(theme.colors.borderStrong);
    expect(vars["--fs-m"]).toBe("9pt");
    expect(vars["--font-family"]).toBe(theme.font.family);
  });
});

describe("Changing the theme", () => {
  it("Given a colour token is changed, then its CSS variable changes", () => {
    const root = document.createElement("div");
    const changed = { ...theme, colors: { ...theme.colors, secondary: "#123456" } };

    applyTheme(root, changed);

    expect(root.style.getPropertyValue("--secondary")).toBe("#123456");
  });

  it("Given a hex colour, then the Excel export gets the matching ARGB colour", () => {
    expect(toArgb("#e7000b")).toBe("FFE7000B");
  });

  // Why every page updates with no page edits: nothing is hard-coded outside the theme file
  it("Given the source files, then no colour is hard-coded outside the theme file", () => {
    const offenders = Object.entries(sourceFiles)
      .filter(([, code]) => /#[0-9a-f]{3,6}\b/i.test(code))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it("Given the style sheet, then no font family or point size is hard-coded", () => {
    const css = sourceFiles["./styles.css"];
    expect(css).not.toMatch(/\d+pt\b/);
    expect(css).not.toMatch(/Arial/);
  });

  it("Given the style sheet, then every var(--token) it uses is defined by the theme file", () => {
    const used = [...sourceFiles["./styles.css"].matchAll(/var\((--[a-z0-9-]+)\)/g)].map(
      (m) => m[1],
    );
    const defined = Object.keys(cssVars());
    const local = ["--p"]; // set inline by the scan progress ring

    const missing = [...new Set(used)].filter(
      (name) => !defined.includes(name) && !local.includes(name),
    );
    expect(missing).toEqual([]);
  });
});