import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { buildReport, SAMPLE_PATHS } from "../data.js";
import { getScan } from "../scanStore.js";
import { SCAN } from "../config.js";

const DOMAIN_PAGES = SCAN.domainPages;

export default function Scan() {
  const navigate = useNavigate();
  const scan = getScan();
  if (!scan) return <Navigate to="/" replace />;
  return <ScanRun scan={scan} navigate={navigate} />;
}

function ScanRun({ scan, navigate }) {
  const isDomain = scan.mode === "domain";
  const report = buildReport(scan);
  const total = isDomain ? DOMAIN_PAGES : scan.urls.length;

  // Whole domain: Discovering -> Scanning. Page URLs: straight to Scanning.
  const [status, setStatus] = useState(isDomain ? "Discovering" : "Scanning");
  const [found, setFound] = useState(0);
  const [checked, setChecked] = useState(0);
  const [templates, setTemplates] = useState(0);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (status !== "Discovering") return;
    const t = setInterval(() => {
      setFound((f) => Math.min(f + SCAN.discovery.foundStep, DOMAIN_PAGES));
      setChecked((c) => Math.min(c + SCAN.discovery.checkedStep, DOMAIN_PAGES));
      setTemplates((x) => Math.min(x + 1, SCAN.maxTemplates));
    }, SCAN.discovery.tickMs);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    if (status === "Discovering" && found >= DOMAIN_PAGES && checked >= DOMAIN_PAGES) {
      const t = setTimeout(() => setStatus("Scanning"), SCAN.discovery.toScanDelayMs);
      return () => clearTimeout(t);
    }
  }, [status, found, checked]);

  useEffect(() => {
    if (status !== "Scanning" || paused) return;
    const step = isDomain ? SCAN.scanning.domainStep : SCAN.scanning.pagesStep;
    const delay = isDomain ? SCAN.scanning.domainTickMs : SCAN.scanning.pagesTickMs;
    const t = setInterval(() => setCurrent((c) => Math.min(c + step, total)), delay);
    return () => clearInterval(t);
  }, [status, paused, isDomain, total]);

  useEffect(() => {
    if (current >= total && total > 0) {
      const t = setTimeout(() => navigate(SCAN.reportRoute), SCAN.scanning.doneDelayMs);
      return () => clearTimeout(t);
    }
  }, [current, total, navigate]);

  const currentUrl = isDomain
    ? `https://${scan.host}${SAMPLE_PATHS[current % SAMPLE_PATHS.length] === "/" ? "" : SAMPLE_PATHS[current % SAMPLE_PATHS.length]}`
    : scan.urls[Math.max(current, 1) - 1];
  const patterns = Math.round((current / total) * report.findings.length);

  if (status === "Discovering") {
    const latest = SAMPLE_PATHS.slice(0, Math.min(5, Math.ceil(found / 30)));
    return (
      <>
        <Topbar title={`Discovering pages on ${scan.host}`} />
        <div className="content">
          <h2 className="big">Discovering pages on {scan.host}</h2>
          <div className="bar">
            <div style={{ width: `${Math.round((found / DOMAIN_PAGES) * 100)}%` }} />
          </div>
          <div className="stats">
            <div>
              <span>Pages found</span>
              <b>{found}</b>
            </div>
            <div>
              <span>Pages checked</span>
              <b>{checked}</b>
            </div>
            <div>
              <span>Templates identified</span>
              <b>{templates}</b>
            </div>
            <div>
              <span>Status</span>
              <b className="red">{status}</b>
            </div>
          </div>
          <hr />
          <h3 className="section">Latest pages found</h3>
          <ul className="rows">
            {latest.map((p) => (
              <li key={p}>
                https://{scan.host}
                {p === "/" ? "" : p}
              </li>
            ))}
          </ul>
          <div className="actions left">
            <button className="btn ghost" onClick={() => setStatus("Scanning")}>
              Stop and review
            </button>
            <button className="btn primary" onClick={() => setStatus("Scanning")}>
              Continue to report
            </button>
          </div>
          <p className="muted">
            Pages behind login are listed as not assessed unless you provide a test account.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Scanning" />
      <div className="content center">
        <h2 className="big">Scanning</h2>
        <div className="ring" style={{ "--p": (current / total) * 100 }}>
          <div className="ring-in">⌗</div>
        </div>
        <div className="big-sm">
          Page {Math.max(current, 1)} of {total}
        </div>
        <div className="card scan-card">
          <div className="thumb" />
          <div>
            <div>{currentUrl}</div>
            <b>Potential dark patterns found so far: {patterns}</b>
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => setPaused(!paused)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button className="link" onClick={() => navigate("/")}>
            Run in background
          </button>
        </div>
        <p className="muted">You can close this window. We will notify you when it finishes.</p>
      </div>
    </>
  );
}
