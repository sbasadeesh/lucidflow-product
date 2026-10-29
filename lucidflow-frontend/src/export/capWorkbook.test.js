import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import mock from "../mock/mock_payload.json";
import { CAP_AI_PLACEHOLDER } from "../config.js";
import { buildCapWorkbook, CAP_COLUMNS } from "./capWorkbook.js";

const HEADER_ROW = 12; // same as in capWorkbook.js

const reportOf = (id) => mock.scenarios.find((s) => s.id === id).report;
const sheetOf = (report) =>
  buildCapWorkbook(ExcelJS, report).getWorksheet("Corrective action plan");
const colOf = (header) => 2 + CAP_COLUMNS.findIndex((c) => c.header === header);
const cellOf = (sheet, rowNo, header) => sheet.getRow(rowNo).getCell(colOf(header));

describe("CAP template", () => {
  // AC1
  it("Given confirmed findings, when the CAP template is generated, then the table has the columns finding, owner, action and due date, with one row per finding", () => {
    const report = reportOf("S2-three-findings");
    const sheet = sheetOf(report);

    ["Finding", "Owner", "Corrective action", "Due date"].forEach((h) => {
      expect(sheet.getRow(HEADER_ROW).getCell(colOf(h)).value).toBe(h);
    });

    report.cap.forEach((cap, i) => {
      const row = HEADER_ROW + 1 + i;
      expect(cellOf(sheet, row, "Finding").value).toBe(cap.findingRef);
      expect(cellOf(sheet, row, "Owner").value).toBe(cap.owner);
      expect(cellOf(sheet, row, "Corrective action").value).toBe(CAP_AI_PLACEHOLDER.action);    });

    // no extra row after the last finding
    expect(sheet.getRow(HEADER_ROW + 1 + report.cap.length).hasValues).toBe(false);
  });

  // AC2
  it("Given blank fields, when the CAP template is generated, then those cells are not locked and the sheet is not protected", () => {
    const sheet = sheetOf(reportOf("S2-three-findings"));

    expect(sheet.sheetProtection).toBeFalsy();
    ["Due date", "Revalidated", "Reviewer comments"].forEach((h) => {
      const cell = cellOf(sheet, HEADER_ROW + 1, h);
      expect(cell.value ?? "").toBe(""); // blank
      expect(cell.protection?.locked).not.toBe(true); // editable
    });
  });

  // Edge case
  it("Given no findings, when the CAP template is generated, then the table still has all the column headings and no rows", () => {
    const sheet = sheetOf(reportOf("S4-zero-findings"));

    CAP_COLUMNS.forEach((col) => {
      expect(sheet.getRow(HEADER_ROW).getCell(colOf(col.header)).value).toBe(col.header);
    });
    expect(sheet.getRow(HEADER_ROW + 1).hasValues).toBe(false);
  });
});

  // AI columns
  it("Given any findings, when the CAP template is generated, then Root cause and Corrective action hold placeholder text until the AI is connected", () => {
    const sheet = sheetOf(reportOf("S2-three-findings"));

    [HEADER_ROW + 1, HEADER_ROW + 2, HEADER_ROW + 3].forEach((row) => {
      expect(cellOf(sheet, row, "Root cause").value).toBe(CAP_AI_PLACEHOLDER.rootCause);
      expect(cellOf(sheet, row, "Corrective action").value).toBe(CAP_AI_PLACEHOLDER.action);
    });
  });