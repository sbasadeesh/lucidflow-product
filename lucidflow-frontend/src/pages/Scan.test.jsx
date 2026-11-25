import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Scan from "./Scan.jsx";
import { SCAN } from "../config.js";

const URLS = ["https://a.com/p1", "https://a.com/p2", "https://a.com/p3"];
const TICK = SCAN.scanning.pagesTickMs;

const save = (scan) => sessionStorage.setItem("lucidflow-scan", JSON.stringify(scan));
const show = () =>
  render(
    <MemoryRouter>
      <Scan />
    </MemoryRouter>,
  );
const states = (container) =>
  [...container.querySelectorAll(".sstate")].map((s) => s.textContent);

describe("Scan: state map for a list of pages", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    save({ mode: "pages", host: "a.com", urls: URLS });
  });
  afterEach(() => vi.useRealTimers());

  it("Given a scan of 3 pages, then the state map shows 3 boxes in the saved order", () => {
    const { container } = show();
    const urls = [...container.querySelectorAll(".surl")].map((u) => u.textContent);
    expect(urls).toEqual(URLS);
    const nums = [...container.querySelectorAll(".snum")].map((n) => n.textContent);
    expect(nums).toEqual(["1", "2", "3"]);
  });

  it("Given the scan has just started, then box 1 is Scanning and the others Waiting", () => {
    const { container } = show();
    expect(states(container)).toEqual(["Scanning", "Waiting", "Waiting"]);
  });

  it("Given the scan moves on, then box 1 shows Scanned with its potential count", () => {
    const { container } = show();
    act(() => vi.advanceTimersByTime(TICK));
    const now = states(container);
    expect(now[0]).toMatch(/^Scanned: \d+ potential$/);
    expect(now[1]).toBe("Scanning");
    expect(now[2]).toBe("Waiting");
  });

  it("Given 3 boxes, then there are 2 arrows between them", () => {
    const { container } = show();
    expect(container.querySelectorAll(".sarrow")).toHaveLength(2);
  });

  it("Given a Whole domain scan, then no state map shows", () => {
    save({ mode: "domain", host: "a.com", urls: [] });
    show();
    expect(screen.queryByLabelText("State map")).toBeNull();
  });

  it("Given all pages are scanned, then every box shows Scanned", () => {
    const { container } = show();
    act(() => vi.advanceTimersByTime(TICK * 3));
    const now = states(container);
    expect(now).toHaveLength(3);
    expect(now.every((s) => s.startsWith("Scanned"))).toBe(true);
  });
});
describe("Scan: discovery preview for Whole domain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    save({ mode: "domain", host: "a.com", urls: [] });
  });
  afterEach(() => vi.useRealTimers());

  it("Given a domain, then the preview label shows", () => {
    show();
    expect(screen.getByText("Preview: live discovery arrives in P1")).toBeTruthy();
  });

  it("Given a domain, then the counts show", () => {
    show();
    expect(screen.getByText("Pages found")).toBeTruthy();
    expect(screen.getByText("Pages checked")).toBeTruthy();
    expect(screen.getByText("Templates identified")).toBeTruthy();
  });

  it("Given a domain, then a page tree shows the host and its branches", () => {
    const { container } = show();
    const tree = container.querySelector(".disc-tree");
    expect(tree).toBeTruthy();
    expect(screen.getByText("a.com")).toBeTruthy();
    expect(screen.getByText("/health-insurance")).toBeTruthy();
    expect(screen.getByText("/motor-insurance")).toBeTruthy();
  });

  it("Given a domain, then the URL table has a row for each sample URL", () => {
    const { container } = show();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(8);
  });

  it("Given a domain, then the URL table shows the full URL with the host", () => {
    show();
    expect(screen.getByText("https://a.com/claims")).toBeTruthy();
  });

  it("Given a list of pages, then no preview label shows", () => {
    save({ mode: "pages", host: "a.com", urls: URLS });
    show();
    expect(screen.queryByText("Preview: live discovery arrives in P1")).toBeNull();
  });
});
describe("Scan: one scanning screen for every mode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  const card = (container) => container.querySelector(".scan-card").textContent;

  it("Given a list of pages, then progress, page count, current URL and findings show", () => {
    save({ mode: "pages", host: "a.com", urls: URLS });
    const { container } = show();
    expect(screen.getByRole("heading", { name: "Scanning", level: 2 })).toBeTruthy();
    expect(container.querySelector(".ring")).toBeTruthy();
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(card(container)).toContain(URLS[0]);
    expect(card(container)).toContain("Potential dark patterns found so far: 0");
  });

  it("Given the scan moves on, then the page count and the current URL move on", () => {
    save({ mode: "pages", host: "a.com", urls: URLS });
    const { container } = show();
        act(() => vi.advanceTimersByTime(TICK * 2));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(card(container)).toContain(URLS[1]);
    expect(Number(container.querySelector(".ring").style.getPropertyValue("--p"))).toBeGreaterThan(0);
  });

  it("Given all pages are scanned, then the findings so far are more than 0", () => {
    save({ mode: "pages", host: "a.com", urls: URLS });
    const { container } = show();
    act(() => vi.advanceTimersByTime(TICK * 3));
    expect(card(container)).toMatch(/found so far: [1-9]/);
  });

  it("Given Whole domain after discovery, then the same screen shows page count, URL and findings", () => {
    save({ mode: "domain", host: "a.com", urls: [] });
    const { container } = show();
    fireEvent.click(screen.getByRole("button", { name: "Continue to report" }));
    expect(screen.getByRole("heading", { name: "Scanning", level: 2 })).toBeTruthy();
    expect(screen.getByText(`Page 1 of ${SCAN.domainPages}`)).toBeTruthy();
    expect(card(container)).toContain("https://a.com");
    expect(card(container)).toContain("Potential dark patterns found so far:");
  });

  it("Given one page, then no state map shows", () => {
    save({ mode: "pages", host: "a.com", urls: [URLS[0]] });
    show();
    expect(screen.queryByLabelText("State map")).toBeNull();
  });

  it("Given two pages, then the state map shows", () => {
    save({ mode: "pages", host: "a.com", urls: [URLS[0], URLS[1]] });
    show();
    expect(screen.getByLabelText("State map")).toBeTruthy();
  });
});