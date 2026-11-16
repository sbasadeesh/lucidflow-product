import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import ReportPreview from "./ReportPreview.jsx";

const show = () =>
  render(
    <MemoryRouter>
      <ReportPreview />
    </MemoryRouter>,
  );

describe("Report preview side panel (E7-15)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      "lucidflow-scan",
      JSON.stringify({ mode: "pages", host: "a.com", urls: ["https://a.com/p1"] }),
    );
  });

  it("Given a completed scan, when the report preview opens, then the Report options panel is gone", () => {
    show();
    ["Report options", "Include screenshots", "Include appendix", "Language"].forEach((t) => {
      expect(screen.queryByText(t)).toBeNull();
    });
  });

  it("Given a completed scan, when the report preview opens, then Report includes lists the 3 new items", () => {
    show();
    expect(screen.getByText("Report includes:")).toBeTruthy();
    [
      "Intelligence Recommendations",
      "Corrective Action Plan Register",
      "Evidence for every finding",
    ].forEach((t) => expect(screen.getByLabelText(t)).toBeTruthy());
  });

  it("Given a completed scan, when the report preview opens, then Scope statement and Limitations are removed", () => {
    show();
    expect(screen.queryByText("Scope statement")).toBeNull();
    expect(screen.queryByText("Limitations")).toBeNull();
  });
});