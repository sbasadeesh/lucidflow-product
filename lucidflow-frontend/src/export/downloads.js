import { buildCapWorkbook } from "./capWorkbook.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// PDF: opens the browser print dialog; only the report pages are printed
// (see @media print in styles.css). Choose "Save as PDF" and tick "Background graphics".
export function downloadPdf() {
  window.print();
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadLogo() {
  try {
    const response = await fetch("/logo.png");
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

// Excel: corrective action plan register (same rows as the PDF CAP section).
// ExcelJS is loaded only when the user clicks download, to keep the first load small.
export async function downloadCap(report) {
  const [module, logo] = await Promise.all([import("exceljs"), loadLogo()]);
  const ExcelJS = module.default ?? module;

  const workbook = buildCapWorkbook(ExcelJS, report, logo);
  const buffer = await workbook.xlsx.writeBuffer();
  saveBlob(new Blob([buffer], { type: XLSX_MIME }), `${report.id}-CAP.xlsx`);
}
