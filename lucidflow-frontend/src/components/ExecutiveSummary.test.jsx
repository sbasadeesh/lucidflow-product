import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import mock from "../mock/mock_payload.json";
import { getPages, Sheet } from "./ReportPages.jsx";
import { buildReport, PRIORITY_THEMES } from "../data.js";
import { SEVERITY_ORDER, SUMMARY_AI_PLACEHOLDER } from "../config.js";

const scenarios = Object.values(mock.scenarios ?? mock);
const reportOf = (s) => s.report ?? s;
const s2 = () => reportOf(scenarios.find((s) => s.id === "S2-three-findings"));
const realReport = () =>
  buildReport({
    mode: "pages",
    urls: ["https://www.royalsundaram.in/claims", "https://www.tataaig.com/"],
  });
const allReports = () => [...scenarios.map(reportOf), realReport()];

const countSeverity = (findings, ...names) =>
  findings.filter((f) => names.includes(String(f.severity).toUpperCase())).length;

// text of the summary page (page 2)
function summaryText(report) {
  const { container } = render(<Sheet n={2}>{getPages(report)[1]}</Sheet>);
  return container.textContent;
}

describe("Executive summary", () => {
  it("Given any payload, then the KPI counts equal the counts in its findings", () => {
    allReports().forEach((r) => {
      const [, potential, highCritical, closed] = r.stats.map((s) => s.value);
      expect(potential).toBe(r.findings.length);
      expect(highCritical).toBe(countSeverity(r.findings, "HIGH", "CRITICAL"));
      expect(closed).toBe(0);
    });
  });

  it("Given any payload, then the pattern distribution and severity split equal the counts in its findings", () => {
    allReports().forEach((r) => {
      const total = r.distribution.reduce((sum, d) => sum + d.count, 0);
      expect(total).toBe(r.findings.length);
      r.distribution.forEach((d) => {
        const n = r.findings.filter((f) => f.pattern.toLowerCase() === d.name.toLowerCase()).length;
        expect(d.count).toBe(n);
      });
      SEVERITY_ORDER.forEach((s) => {
        expect(r.severitySplit[s]).toBe(countSeverity(r.findings, s.toUpperCase()));
      });
    });
  });

  it("Given a payload, then the summary shows the severity split", () => {
    expect(summaryText(s2())).toContain("Medium 2 · Observed 1 · High 0 · Critical 0");
  });

  it("Given empty AI text, then the posture and the three theme descriptions show placeholder text", () => {
    const text = summaryText({ ...s2(), posture: "", themes: ["", "", ""] });
    expect(text).toContain(SUMMARY_AI_PLACEHOLDER.posture);
    expect(text.split(SUMMARY_AI_PLACEHOLDER.theme).length - 1).toBe(3);
    PRIORITY_THEMES.forEach((t) => expect(text).toContain(t.title));
  });

  it("Given AI text in the payload, then the summary shows that text, not the placeholder", () => {
    const text = summaryText({
      ...s2(),
      posture: "AI posture text.",
      themes: ["AI theme one.", "AI theme two.", "AI theme three."],
    });
    expect(text).toContain("AI posture text.");
    expect(text).toContain("AI theme two.");
    expect(text).not.toContain(SUMMARY_AI_PLACEHOLDER.posture);
  });
});