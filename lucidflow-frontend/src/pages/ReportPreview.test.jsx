import { fireEvent, render, screen, within } from "@testing-library/react";
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
    it("Given the preview, then Download PDF and Download CAP buttons show", () => {
    show();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download CAP (Excel)" })).toBeTruthy();
  });

  it("Given the preview, then Send by email is disabled and says Planned for a later phase", () => {
    show();
    const btn = screen.getByRole("button", { name: "Send by email" });
    expect(btn.disabled).toBe(true);
    expect(screen.getByText("Planned for a later phase")).toBeTruthy();
  });
});
describe("Report preview: unconfirmed findings warning (E7-16)", () => {
  const save = (urls) =>
    sessionStorage.setItem("lucidflow-scan", JSON.stringify({ mode: "pages", host: "a.com", urls }));
  const FOUR = ["p1", "p2", "p3", "p4"].map((p) => `https://a.com/${p}`);
  const total = (container) =>
    Number(container.querySelector(".pager span").textContent.split("/")[1]);

  beforeEach(() => sessionStorage.clear());

  it("Given unconfirmed findings, then a warning says only confirmed findings are included", () => {
    save(FOUR);
    show();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Only confirmed findings are included/)).toBeTruthy();
    expect(within(dialog).getByText("a.com - Urgency-oriented Offer Messaging")).toBeTruthy();
  });

  it("Given the warning, when I click OK, then it closes and the unconfirmed finding is removed", () => {
    save(FOUR);
    const { container } = show();
    const before = total(container);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(total(container)).toBe(before - 1);
  });

  it("Given only confirmed findings, then no warning shows", () => {
    save(["https://a.com/p1"]);
    show();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});