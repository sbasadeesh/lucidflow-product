import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../App.jsx";

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
