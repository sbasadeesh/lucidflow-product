import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../App.jsx";
import { PLANNED_LABEL } from "../config.js";

const PAGES = [
  "/",
  "/new-scan",
  "/reports",
  "/reports/ready",
  "/history",
  "/schedule",
  "/settings",
];
const SIDEBAR = ["Home", "New scan", "Reports", "History", "Schedule", "Settings"];

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App shell", () => {
  it.each(PAGES)("Given page %s, then the logo, sidebar and top bar show", (path) => {
    renderAt(path);

    expect(screen.getByAltText(/LucidFlow/)).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("Given any page, then the sidebar lists Home, New scan, Reports, History, Schedule, Settings", () => {
    renderAt("/history");

    const links = within(screen.getByRole("navigation")).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(SIDEBAR);
  });

  it("Given the logo, then it is the approved image file, not a redrawn one", () => {
    renderAt("/");
    expect(screen.getByAltText(/LucidFlow/)).toHaveAttribute("src", "/logo.png");
  });

  it("Given I am on Reports, then the Reports link is highlighted", () => {
    renderAt("/reports");

    expect(screen.getByRole("link", { name: "Reports" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveClass("active");
  });

  // Edge case
  it("Given an unknown address, then Home opens inside the same shell", () => {
    renderAt("/does-not-exist");

    expect(screen.getByRole("heading", { name: "Start a scan" })).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});
describe("Main menu: Remediation and Prevention", () => {
  const PAGES = [
    { label: "Remediation", to: "/remediation" },
    { label: "Prevention", to: "/prevention" },
  ];
  const renderAt = (path) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
  const link = (name) => screen.getByRole("link", { name });

  it("Given the menu, then Remediation and Prevention show after Reports", () => {
    const { container } = renderAt("/settings");
    const labels = [...container.querySelectorAll(".nav-item")].map((el) => el.textContent);
    const i = labels.indexOf("Reports");
    expect(labels[i + 1]).toBe("Remediation");
    expect(labels[i + 2]).toBe("Prevention");
  });

  it.each(PAGES)(
    'Given I click $label, then a static page opens with its title and "Planned for a later phase"',
    ({ label }) => {
      renderAt("/settings");
      fireEvent.click(link(label));
      expect(screen.getByRole("heading", { name: label })).toBeTruthy();
      expect(screen.getByText(PLANNED_LABEL)).toBeTruthy();
    },
  );

  it("Given a dummy page, then no real action is possible: every button is disabled and there are no inputs", () => {
    PAGES.forEach(({ to }) => {
      const { container, unmount } = renderAt(to);
      const enabled = container.querySelectorAll(
        ".content button:not([disabled]), .content input, .content select, .content textarea, .content form",
      );
      expect(enabled.length).toBe(0);
      unmount();
    });
  });

  it("Given a dummy page, then its menu item is shown as active", () => {
    PAGES.forEach(({ label, to }) => {
      const { unmount } = renderAt(to);
      expect(link(label).className).toContain("active");
      unmount();
    });
  });
});