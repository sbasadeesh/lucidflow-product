import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { getPages, Sheet } from "../components/ReportPages.jsx";
import NoScan from "../components/NoScan.jsx";
import { buildReport } from "../data.js";
import { getScan } from "../scanStore.js";
import { downloadCap, downloadPdf } from "../export/downloads.js";
import { PLANNED_LABEL, UNCONFIRMED } from "../config.js";

export default function ReportPreview() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [opts, setOpts] = useState({ screenshots: true, appendix: true, language: "English" });
  const [accepted, setAccepted] = useState(false);
  const scan = getScan();
  const report = scan ? buildReport(scan, { dropUnconfirmed: accepted }) : null;
  if (!report) return <NoScan />;
  const pages = getPages(report);
  const warn = !accepted && report.unconfirmed?.length > 0;

  return (
    <>
      <Topbar title="Report preview" />
      {warn && (
        <div className="warn-back no-print">
          <div className="warn-box card" role="dialog" aria-modal="true" aria-labelledby="warn-title">
            <h3 id="warn-title">{UNCONFIRMED.title}</h3>
            <p>{UNCONFIRMED.text}</p>
            <ul>
              {report.unconfirmed.map((f) => (
                <li key={f.id}>{f.title}</li>
              ))}
            </ul>
            <button className="btn primary" onClick={() => setAccepted(true)}>
              {UNCONFIRMED.ok}
            </button>
          </div>
        </div>
      )}
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
          <h3>Report options</h3>
          <label className="switch-row">
            Include screenshots
            <input
              type="checkbox"
              checked={opts.screenshots}
              onChange={(e) => setOpts({ ...opts, screenshots: e.target.checked })}
            />
          </label>
          <label className="switch-row">
            Include appendix
            <input
              type="checkbox"
              checked={opts.appendix}
              onChange={(e) => setOpts({ ...opts, appendix: e.target.checked })}
            />
          </label>
          <label className="label">Language</label>
          <select
            value={opts.language}
            onChange={(e) => setOpts({ ...opts, language: e.target.value })}
          >
            <option>English</option>
            <option>Tamil</option>
            <option>Hindi</option>
          </select>
          <hr />
          <b>Report includes:</b>
          {["Scope statement", "Limitations", "Evidence for every finding"].map((t) => (
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
        <button className="btn ghost" disabled aria-describedby="email-planned">
          Send by email
        </button>
        <span className="planned" id="email-planned">
          {PLANNED_LABEL}
        </span>
        <button className="btn ghost" onClick={() => navigate("/reports/ready")}>
          Next
        </button>
      </footer>
    </>
  );
}
