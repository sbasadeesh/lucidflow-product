import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Settings from "./Settings.jsx";
import SettingsSection from "./SettingsSection.jsx";
import { SETTINGS_SECTIONS, PLANNED_LABEL } from "../config.js";

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/settings" element={<Settings />}>
            <Route path=":section" element={<SettingsSection />} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const link = (name) => screen.getByRole("link", { name });
const isActive = (name) => link(name).className.includes("active");

describe("Settings dummy pages", () => {
  it("Given Settings, when it opens, then the 6 options show, none is active and the right side is blank", () => {
    const { container } = renderAt("/settings");
    SETTINGS_SECTIONS.forEach((s) => expect(isActive(s.label)).toBe(false));
    expect(container.querySelector(".settings-panel").textContent).toBe("");
  });

  it("Given an option, when it is clicked, then it is active and its title shows on the right", () => {
    renderAt("/settings");
    fireEvent.click(link("Organisation"));
    expect(isActive("Organisation")).toBe(true);
    expect(isActive("Profile")).toBe(false);
    expect(screen.getByRole("heading", { name: "Organisation", level: 2 })).toBeTruthy();
  });

  it.each(SETTINGS_SECTIONS)(
    'Given the option $label, then its page shows the title and "Planned for a later phase"',
    ({ label, to }) => {
      renderAt(to);
      expect(screen.getByRole("heading", { name: label, level: 2 })).toBeTruthy();
      expect(screen.getByText(PLANNED_LABEL)).toBeTruthy();
    },
  );

  it("Given a dummy page, then no real action is possible: every button is disabled and there are no inputs", () => {
    SETTINGS_SECTIONS.forEach(({ to }) => {
      const { container, unmount } = renderAt(to);
      const panel = container.querySelector(".settings-panel");
      expect(panel.querySelectorAll("button:not([disabled]), input, select, textarea, form").length).toBe(0);
      unmount();
    });
  });

  it("Given a Settings page, then the Settings item in the menu is shown as active", () => {
    renderAt("/settings/licence");
    expect(isActive("Settings")).toBe(true);
  });
});