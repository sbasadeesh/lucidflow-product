import { COLORS, FONT_NAME } from "./excelTheme.js";

const HEADER_ROW = 12; // logo + title block sit above this row
const FIRST_COLUMN = 2; // column A is a narrow margin
const LOGO_SIZE = { width: 264, height: 55 };

// One entry per column: header text, width and how to read the cell value from a CAP row.
// Add or remove a column here and the whole sheet follows.
export const CAP_COLUMNS = [
  { header: "CAP ID", width: 10, value: (c) => c.id },
  { header: "Finding", width: 9, value: (c) => c.findingRef },
  { header: "Pattern", width: 17, value: (c) => c.pattern },
  { header: "Severity", width: 11, value: (c) => c.severity },
  {
    header: "Page scanned",
    width: 42,
    value: (c) => ({ text: c.url, hyperlink: c.url }),
    link: true,
  },
  { header: "Root cause", width: 38, value: (c) => c.rootCause },
  {
    header: "Corrective action",
    width: 44,
    value: (c) => c.action.map((a) => `• ${a}`).join("\n"),
  },
  { header: "Owner", width: 26, value: (c) => c.owner },
  { header: "Due date", width: 11, value: () => "" },
  { header: "Status", width: 9, value: (c) => c.status, status: true },
  { header: "Revalidation result", width: 17, value: () => "Not started" },
  { header: "Revalidated", width: 13, value: () => "" },
  { header: "Reviewer comments", width: 34, value: () => "" },
];

// ---------- small style helpers ----------

const solidFill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

const thin = { style: "thin", color: { argb: COLORS.border } };
const ALL_BORDERS = { top: thin, left: thin, bottom: thin, right: thin };

const font = (overrides = {}) => ({
  name: FONT_NAME,
  size: 9,
  color: { argb: COLORS.white },
  ...overrides,
});

// Rough row height so wrapped text (corrective action bullets) is not cut off
function estimateRowHeight(cap) {
  const lines = cap.action.reduce((sum, a) => sum + Math.ceil(a.length / 40), 0);
  return Math.max(30, lines * 12 + 6);
}

// ---------- sheet sections ----------

function setColumnWidths(sheet) {
  sheet.getColumn(1).width = 2;
  CAP_COLUMNS.forEach((col, i) => {
    sheet.getColumn(FIRST_COLUMN + i).width = col.width;
  });
}

function addLogo(workbook, sheet, logoBuffer) {
  if (!logoBuffer) return;
  const imageId = workbook.addImage({ buffer: logoBuffer, extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: LOGO_SIZE });
}

function addTitleBlock(sheet, report) {
  const lines = [
    {
      row: 7,
      text: "Turn potential findings into owned, testable and revalidation-ready work items.",
    },
    { row: 8, text: `Report ID: ${report.id}` },
    { row: 9, text: `Prepared for: ${report.client}` },
  ];
  lines.forEach(({ row, text }) => {
    const cell = sheet.getCell(row, FIRST_COLUMN);
    cell.value = text;
    cell.font = font({ color: { argb: COLORS.muted } });
  });
}

function addHeaderRow(sheet) {
  const row = sheet.getRow(HEADER_ROW);
  row.height = 20;

  CAP_COLUMNS.forEach((col, i) => {
    const cell = row.getCell(FIRST_COLUMN + i);
    cell.value = col.header;
    cell.font = font({ bold: true });
    cell.fill = solidFill(COLORS.black);
    cell.border = ALL_BORDERS;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: FIRST_COLUMN },
    to: { row: HEADER_ROW, column: FIRST_COLUMN + CAP_COLUMNS.length - 1 },
  };
}

function styleDataCell(cell, col) {
  cell.fill = solidFill(COLORS.rowFill);
  cell.border = ALL_BORDERS;
  cell.alignment = { vertical: "middle", wrapText: true };
  cell.font = font();

  if (col.status) cell.font = font({ bold: true, color: { argb: COLORS.red } });
  if (col.link) cell.font = font({ underline: true, color: { argb: COLORS.link } });
}

function addDataRows(sheet, caps) {
  caps.forEach((cap, i) => {
    const row = sheet.getRow(HEADER_ROW + 1 + i);
    row.height = estimateRowHeight(cap);

    CAP_COLUMNS.forEach((col, c) => {
      const cell = row.getCell(FIRST_COLUMN + c);
      cell.value = col.value(cap);
      styleDataCell(cell, col);
    });
  });
}

// ExcelJS is passed in, so the same code runs in the browser and in tests
export function buildCapWorkbook(ExcelJS, report, logoBuffer) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LucidFlow";

  const sheet = workbook.addWorksheet("Corrective action plan", {
    views: [{ state: "frozen", ySplit: HEADER_ROW, showGridLines: false }],
  });

  setColumnWidths(sheet);
  addLogo(workbook, sheet, logoBuffer);
  addTitleBlock(sheet, report);
  addHeaderRow(sheet);
  addDataRows(sheet, report.cap);

  return workbook;
}
