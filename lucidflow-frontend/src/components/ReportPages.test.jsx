import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PRIORITY_THEMES } from "../data.js";
import mock from "../mock/mock_payload.json";
import { fitSheetContent, getPages, Sheet } from "./ReportPages.jsx";

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

  it("Given empty theme strings, when the summary renders, then fallback assessment prose is not inserted", () => {
    const report = reportOf("S5-empty-text-fields");
    const { container } = renderReport(report);
    const summary = sheetsOf(container)[1];
    PRIORITY_THEMES.forEach((theme) => {
      expect(summary).not.toHaveTextContent(theme.text);
    });
    expect(summary.querySelectorAll(".themes p")).toHaveLength(3);
    summary.querySelectorAll(".themes p").forEach((p) => {
      expect(p.textContent).toBe("");
    });
  });

  it.each(mock.scenarios.map((s) => [s.id, s]))(
    "Given %s, when pages are built, then the count, order, and CAP rows match the fixture",
    (_id, scenario) => {
      const report = scenario.report;
      const { container } = renderReport(report);
      const sheets = sheetsOf(container);
      expect(sheets).toHaveLength(scenario.expected.total_pdf_pages);
      sheets.forEach((sheet, i) => {
        expect(within(sheet).getByText(`Page ${i + 1}`)).toBeInTheDocument();
      });
      const capIds = sheets
        .filter((sheet) => kindOf(sheet) === "cap")
        .flatMap((sheet) =>
          [...sheet.querySelectorAll("tbody tr")].map((row) => row.querySelector("td").textContent),
        );
      expect(capIds).toEqual(report.cap.map((row) => row.id));
    },
  );

  it("Given a finding with a screenshot, when the finding page renders, then the image is shown", () => {
    const report = reportOf("S1-one-finding");
    const { container } = renderReport(report);
    const finding = sheetsOf(container)[2];
    expect(finding.querySelector("img.shot-img")).toHaveAttribute("src", report.findings[0].screenshot);
    expect(finding.querySelector(".shot")).toBeNull();
  });

  it("Given a finding without a screenshot, when the finding page renders, then the placeholder is shown", () => {
    const report = structuredClone(reportOf("S1-one-finding"));
    delete report.findings[0].screenshot;
    const { container } = renderReport(report);
    const finding = sheetsOf(container)[2];
    expect(finding.querySelector("img.shot-img")).toBeNull();
    expect(finding.querySelector(".shot")).toHaveTextContent("Screenshot placeholder");
  });

  it("Given a sheet with no layout height, when fit runs, then it waits instead of locking zoom at 1", () => {
    const box = { clientHeight: 0, scrollHeight: 0 };
    const content = { style: {}, dataset: {} };
    expect(fitSheetContent(box, content)).toBe(false);
    expect(content.dataset.fitted).toBeUndefined();
  });

  it("Given content taller than the sheet, when fit runs, then zoom stays at or above 0.6 and marks a miss", () => {
    const content = { style: {}, dataset: {} };
    const box = {
      clientHeight: 100,
      get scrollHeight() {
        const zoom = Number(content.style.zoom || 1);
        return Math.ceil(400 * zoom);
      },
    };
    expect(fitSheetContent(box, content)).toBe(true);
    expect(Number(content.style.zoom)).toBeGreaterThanOrEqual(0.6);
    expect(content.dataset.fitted).toBe("1");
    expect(content.dataset.overflow).toBe("below-min-zoom");
  });

  it("Given zero findings, when the report renders, then only cover, summary, and about pages exist", () => {
    const report = reportOf("S4-zero-findings");
    const { container } = renderReport(report);
    const kinds = sheetsOf(container).map(kindOf);
    expect(kinds).toEqual(["cover", "summary", "about"]);
  });
});