import { useState } from "react";
import Topbar from "../components/Topbar.jsx";
import NoScan from "../components/NoScan.jsx";
import { buildReport } from "../data.js";
import { getScan } from "../scanStore.js";
import { downloadCap, downloadPdf } from "../export/downloads.js";

export default function ReportReady() {
  const [recipients, setRecipients] = useState([
    "Compliance head",
    "Product head",
    "Engineering lead",
  ]);
  const [subject, setSubject] = useState(
    "LucidFlow dark pattern report and corrective action plan",
  );
  const [message, setMessage] = useState(
    "Please review the attached report and corrective action plan.",
  );
  const [attach, setAttach] = useState({ pdf: true, xlsx: true });
  const [sent, setSent] = useState(false);

  const scan = getScan();
  const report = scan ? buildReport(scan) : null;
  if (!report) return <NoScan />;

  return (
    <>
      <Topbar title="Reports" />
      <div className="content narrow">
        <div className="ready">
          <span className="tick">✓</span>
          <h2>Your report is ready</h2>
        </div>

        <div className="grid2">
          <div className="card file">
            <div>
              <b>Dark pattern report (PDF)</b>
              <div className="muted">2.4 MB</div>
            </div>
            <button className="btn ghost sm" onClick={downloadPdf}>
              Download
            </button>
          </div>
          <div className="card file">
            <div>
              <b>Corrective action plan (Excel)</b>
              <div className="muted">180 KB</div>
            </div>
            <button className="btn ghost sm" onClick={() => downloadCap(report)}>
              Download
            </button>
          </div>
        </div>

        <hr />
        <h3 className="section">Send to stakeholders</h3>

        <label className="label">Recipients</label>
        <div className="chips box-in">
          {recipients.map((r) => (
            <span className="chip" key={r}>
              {r}
              <button onClick={() => setRecipients(recipients.filter((x) => x !== r))}>×</button>
            </span>
          ))}
        </div>

        <label className="label">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />

        <label className="label">Message (optional)</label>
        <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />

        <label className="label">Attachments</label>
        <label className="check">
          <input
            type="checkbox"
            checked={attach.pdf}
            onChange={(e) => setAttach({ ...attach, pdf: e.target.checked })}
          />{" "}
          Dark pattern report (PDF)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={attach.xlsx}
            onChange={(e) => setAttach({ ...attach, xlsx: e.target.checked })}
          />{" "}
          Corrective action plan (Excel)
        </label>

        <div className="actions left">
          <button className="btn primary" onClick={() => setSent(true)}>
            Send report
          </button>
          <span className="muted">{sent ? "Report sent ✓" : "Links expire in 30 days."}</span>
        </div>
      </div>
    </>
  );
}
