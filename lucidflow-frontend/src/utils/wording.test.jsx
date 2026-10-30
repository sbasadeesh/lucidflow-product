import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ExcelJS from "exceljs";
import mock from "../mock/mock_payload.json";
import { getPages, Sheet } from "../components/ReportPages.jsx";
import { buildCapWorkbook } from "../export/capWorkbook.js";
import { buildReport } from "../data.js";
import { checkWording } from "./wording.js";

// TODO: mock scenarios eppadi edukkirom nu capWorkbook.test.js la paarunga, adhe maadhiri
const scenarios = Object.values(mock.scenarios ?? mock);
const reportOf = (s) => s.report ?? s;

// PDF text = ella pages oda text
function pdfTextOf(report) {
  const pages = getPages(report);
  const { container } = render(
    <>
      {pages.map((p, i) => (
        <Sheet key={i} report={report} page={p} index={i} total={pages.length} />
      ))}
    </>
  );
  return container.textContent;
}

// Excel text = sheet la ella cells oda text
function excelTextOf(report) {
  const sheet = buildCapWorkbook(ExcelJS, report).getWorksheet("Corrective action plan");
  const parts = [];
  sheet.eachRow((row) => row.eachCell((cell) => parts.push(String(cell.text ?? ""))));
  return parts.join(" ");
}

describe("Cautious wording", () => {
  it('Given a report, then it contains "potential"', () => {
    const text = pdfTextOf(reportOf(scenarios[1]));
    expect(checkWording(text).missing).toEqual([]);
  });

  it('Given a report, then it does not contain "violation" or "non-compliant"', () => {
    const text = pdfTextOf(reportOf(scenarios[1]));
    expect(checkWording(text).forbidden).toEqual([]);
  });

  it("Given a text with a forbidden word, then the check reports that word", () => {
    expect(checkWording("This is a violation").forbidden).toEqual(["violation"]);
    expect(checkWording("The page is Non Compliant").forbidden).toEqual(["non-compliant"]);
    expect(checkWording("No findings here").missing).toEqual(["potential"]);
  });

  it("Given every mock scenario and a real scan, then the PDF report text passes the wording check", () => {
    const real = buildReport({ mode: "pages", urls: ["https://www.royalsundaram.in/claims"] });
    [...scenarios.map(reportOf), real].forEach((r) => {
      expect(checkWording(pdfTextOf(r))).toEqual({ missing: [], forbidden: [] });
    });
  });

  it("Given every mock scenario, then the CAP Excel text passes the wording check", () => {
    scenarios.map(reportOf).forEach((r) => {
      expect(checkWording(excelTextOf(r))).toEqual({ missing: [], forbidden: [] });
    });
  });
});