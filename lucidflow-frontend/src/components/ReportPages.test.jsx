import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import mock from "../mock/mock_payload.json";
import { getPages, Sheet } from "./ReportPages.jsx";
import { buildReport } from "../data.js";

const reportOf = (id) => mock.scenarios.find((s) => s.id === id).report;

// Renders every report page, each inside its A4 sheet (like the preview does)
function renderReport(report) {
  const pages = getPages(report);
  return render(
    <>
      {pages.map((page, i) => (
        <Sheet n={i + 1} key={i}>
          {page}
        </Sheet>
      ))}
    </>,
  );
}

const sheetsOf = (container) => Array.from(container.querySelectorAll(".sheet"));

// first red label on a page, used to tell which kind of page it is
const kindOf = (sheet) => {
  const label = sheet.querySelector(".eyebrow, .big-label").textContent;
  if (label.startsWith("AI POWERED")) return "cover";
  if (label.startsWith("02 /")) return "summary";
  if (label.startsWith("CORRECTIVE")) return "cap";
  if (label.startsWith("ABOUT")) return "about";
  return "finding";
};

describe("Report layout against the mock payload", () => {
  // AC1
  it("Given the mock payload with one finding, when the report preview opens, then the report renders with no errors", () => {
    const report = reportOf("S1-one-finding");
    const { container } = renderReport(report);
    const sheets = sheetsOf(container);

    // cover, summary, 1 finding, 1 CAP page, about
    expect(sheets).toHaveLength(5);
    expect(within(sheets[0]).getByRole("heading", { level: 1 })).toHaveTextContent(report.title);
    expect(within(sheets[2]).getByRole("heading", { level: 2 })).toHaveTextContent(
      report.findings[0].title,
    );
  });

  // AC1
  it("Given the mock payload with three findings, when the report preview opens, then every page renders in the right order: cover, summary, findings, CAP register, about", () => {
    const report = reportOf("S2-three-findings");
    const n = report.findings.length;
    const { container } = renderReport(report);
    const sheets = sheetsOf(container);
    const kinds = sheets.map(kindOf);

    expect(kinds.slice(0, 2)).toEqual(["cover", "summary"]);
    expect(kinds.slice(2, 2 + n)).toEqual(Array(n).fill("finding"));
    expect(kinds.at(-1)).toBe("about");

    const capKinds = kinds.slice(2 + n, -1);
    expect(capKinds.length).toBeGreaterThanOrEqual(1);
    expect(capKinds.every((k) => k === "cap")).toBe(true);

    // finding pages follow the order in the payload
    const ids = sheets.slice(2, 2 + n).map((s) => s.querySelector(".big-label").textContent);
    expect(ids).toEqual(report.findings.map((f) => f.id));
  });

  // AC2
  it("Given a mock payload with empty text fields, when the report preview opens, then every page still shows its headings and layout with no broken or missing sections", () => {
    const report = reportOf("S5-empty-text-fields");
    const n = report.findings.length;
    const { container } = renderReport(report);
    const sheets = sheetsOf(container);

    // every page keeps its logo and footer with the page number
    sheets.forEach((sheet, i) => {
      expect(within(sheet).getByAltText(/LucidFlow/)).toBeInTheDocument();
      expect(within(sheet).getByText(`Page ${i + 1}`)).toBeInTheDocument();
    });

    // cover keeps its labels
    expect(within(sheets[0]).getByText("PREPARED FOR")).toBeInTheDocument();
    expect(within(sheets[0]).getByText("REPORT ID")).toBeInTheDocument();

    // finding page keeps all its sections
    ["EVIDENCE-LED FINDING", "WHY THIS MATTERS", "REMEDIATION FIX"].forEach((label) => {
      expect(within(sheets[2]).getByText(label)).toBeInTheDocument();
    });

    // CAP register keeps its 7 table headings
    expect(within(sheets[2 + n]).getAllByRole("columnheader")).toHaveLength(7);
  });

  // Edge case
  it("Given a mock payload with very long text, when a finding page renders, then the text stays inside the page and does not touch the footer", () => {
    const report = reportOf("S6-long-text");
    const f = report.findings[0];
    const { container } = renderReport(report);
    const sheet = sheetsOf(container)[2];
    const body = sheet.querySelector(".s-body");
    const foot = sheet.querySelector(".s-foot");

    // all the text is on the page (nothing cut), inside the page body
    expect(body).toHaveTextContent(f.evidence);
    expect(body).toHaveTextContent(f.why);
    f.fix.forEach((step) => expect(body).toHaveTextContent(step));

    // the footer is its own block, outside the page body
    expect(body.contains(foot)).toBe(false);
  });
});


describe("Assessment PDF (E7-02)", () => {
  // AC1
  it("Given a payload with findings, when the report is generated, then the PDF has cover, summary, scope and findings pages in that order", () => {
    const report = reportOf("S2-three-findings");
    const n = report.findings.length;
    const { container } = renderReport(report);
    const sheets = sheetsOf(container);
    const kinds = sheets.map(kindOf);

    expect(kinds.slice(0, 2)).toEqual(["cover", "summary"]);
    // scope sits on the cover
    expect(within(sheets[0]).getByText("Assessment scope")).toBeInTheDocument();
    expect(within(sheets[0]).getByText(report.scope)).toBeInTheDocument();
    expect(kinds.slice(2, 2 + n)).toEqual(Array(n).fill("finding"));
  });

  // AC2
  it("Given findings, when the report is generated, then each finding page shows its evidence and its screenshot", () => {
    const report = reportOf("S2-three-findings");
    const n = report.findings.length;
    const { container } = renderReport(report);
    const sheets = sheetsOf(container).slice(2, 2 + n);

    expect(sheets).toHaveLength(n);
    sheets.forEach((sheet, i) => {
      const f = report.findings[i];
      expect(within(sheet).getByText("EVIDENCE-LED FINDING")).toBeInTheDocument();
      expect(sheet).toHaveTextContent(f.evidence);
      expect(within(sheet).getByAltText(`Screenshot of ${f.url}`)).toHaveAttribute(
        "src",
        f.screenshot,
      );
    });
  });

  // Developer note
  it('Given a one page scan with N findings, when the report is generated, then the scope line reads "1 page, N states"', () => {
    const scan = { mode: "pages", urls: ["https://www.royalsundaram.in/claims"] };
    expect(buildReport(scan).scope).toBe("royalsundaram.in (1 page, 1 state)");

    // mock with 3 findings shows 3 states
    expect(reportOf("S2-three-findings").scope).toMatch(/\(1 page, 3 states\)$/);
  });

  // Edge case
  it('Given a payload with no findings, when the report is generated, then the scope line reads "1 page, 0 states"', () => {
    const report = reportOf("S4-zero-findings");
    const { container } = renderReport(report);
    const cover = sheetsOf(container)[0];

    expect(report.findings).toHaveLength(0);
    expect(within(cover).getByText(/\(1 page, 0 states\)$/)).toBeInTheDocument();
  });
});