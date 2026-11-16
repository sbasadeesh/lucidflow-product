import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { getPages, Sheet } from "../components/ReportPages.jsx";
import NoScan from "../components/NoScan.jsx";
import { buildReport } from "../data.js";
import { getScan } from "../scanStore.js";
import { downloadCap, downloadPdf } from "../export/downloads.js";
import mock from "../mock/mock_payload.json";

export default function ReportPreview() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);

    // Dev only: ?mock=<scenario id> shows the report from src/mock/mock_payload.json
  const [params] = useSearchParams();
  const mockId = import.meta.env.DEV ? params.get("mock") : null;
  const mockReport = mockId
    ? (mock.scenarios.find((s) => s.id === mockId) ?? mock.scenarios[0]).report
    : null;

  const scan = getScan();
  const report = mockReport ?? (scan ? buildReport(scan) : null);
  if (!report) return <NoScan />;
  const pages = getPages(report);

  return (
    <>
      <Topbar title="Report preview" />
      <div className="content split">
        <section>
          <div className="row no-print">
            <h3>Document preview</h3>
            <div className="pager">
              <button disabled={i === 0} onClick={() => setI(i - 1)}>
                ‹
              </button>
              <span>
                {i + 1}/{pages.length}
              </span>
              <button disabled={i === pages.length - 1} onClick={() => setI(i + 1)}>
                ›
              </button>
            </div>
          </div>
          <div className="preview no-print">
            <Sheet n={i + 1}>{pages[i]}</Sheet>
          </div>
          {/* all pages, shown only when printing / saving as PDF */}
          <div className="print-only">
            {pages.map((body, k) => (
              <Sheet key={k} n={k + 1}>
                {body}
              </Sheet>
            ))}
          </div>
        </section>

        <aside className="card options no-print">
          <b>Report includes:</b>
          {[
            "Intelligence Recommendations",
            "Corrective Action Plan Register",
            "Evidence for every finding",
          ].map((t) => (
            <label className="check" key={t}>
              <input type="checkbox" defaultChecked /> {t}
            </label>
          ))}
        </aside>
      </div>

      <footer className="bottombar no-print">
        <button className="btn ghost" onClick={() => navigate("/")}>
          Back
        </button>
        <button className="btn primary" onClick={downloadPdf}>
          Download PDF
        </button>
        <button className="btn ghost" onClick={() => downloadCap(report)}>
          Download CAP (Excel)
        </button>
        <button className="btn ghost" onClick={() => navigate("/reports/ready")}>
          Next
        </button>
      </footer>
    </>
  );
}