import { ABOUT, CATEGORIES, PRIORITY_THEMES } from "../data.js";
import { REPORT } from "../config.js";

const FOOTER_URL = "https://ww1.sbainfo.in/lucidflow";

// One A4 page: logo top right, footer with page number
export function Sheet({ n, children }) {
  return (
    <div className="sheet">
      <div className="s-head">
        <img src="/logo.png" alt="LucidFlow" />
      </div>
      <div className="s-body">{children}</div>
      <div className="s-foot">
        <span>LucidFlow™ | SBA Info Solutions Pvt Ltd | {FOOTER_URL}</span>
        <span>Page {n}</span>
      </div>
    </div>
  );
}

function Cover({ r }) {
  return (
    <div className="cover">
      <p className="eyebrow">AI POWERED CONTINUOUS DARK PATTERN MONITORING</p>
      <h1 className="cover-title">{r.title}</h1>
      <p className="tagline">{r.tagline}</p>

      <div className="prep">
        <span className="label-red">PREPARED FOR</span>
        {r.clients.map((c) => (
          <b className="client" key={c}>
            {c}
          </b>
        ))}
      </div>

      <p className="scope-label">Assessment scope</p>
      <b className="scope">{r.scope}</b>

      <div className="grid3">
        <div>
          <span className="label-red">REPORT ID</span>
          {r.id}
        </div>
        <div>
          <span className="label-red">VERSION</span>
          {r.version}
        </div>
        <div>
          <span className="label-red">ISSUE DATE</span>
          {r.date}
        </div>
      </div>

      <p className="cover-tag">Every Click Flawless. Every Journey Compliant.</p>
    </div>
  );
}

function Summary({ r }) {
  const colors = ["var(--text)", "var(--secondary)", "var(--secondary)", "var(--success)"];
  const max = Math.max(...r.distribution.map((d) => d.count), 1);

  return (
    <div>
      <p className="eyebrow">02 / EXECUTIVE SUMMARY</p>
      <h2 className="title">Decision-ready overview</h2>

      <div className="stats-row">
        {r.stats.map((s, i) => (
          <div key={s.label}>
            <b style={{ color: colors[i] }}>{s.value}</b>
            <span>{s.label.toUpperCase()}</span>
          </div>
        ))}
      </div>

      <h3 className="sub">Pattern distribution</h3>
      {r.distribution.map((d) => (
        <div className="dist" key={d.name}>
          <span>{d.name}</span>
          <div className="dbar">
            <i style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <b>{d.count}</b>
        </div>
      ))}

      <h3 className="sub">Executive assessment</h3>
      <div className="prep">
        <span className="label-red">OVERALL POSTURE</span>
        <p>{r.posture}</p>
      </div>

      <h3 className="sub">Priority themes</h3>
      <div className="grid3 themes">
        {PRIORITY_THEMES.map((t) => (
          <div key={t.title}>
            <span className="label-red">{t.title}</span>
            <p>{t.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Finding({ f }) {
  return (
    <div>
      <span className="label-red big-label">{f.id}</span>
      <h2 className="title">{f.title}</h2>
      <p className="scanned">Page Scanned - {f.url}</p>

      <div className="grid4">
        <div>
          <span className="label-red">SEVERITY</span>
          {f.severity}
        </div>
        <div>
          <span className="label-red">PATTERN</span>
          {f.pattern}
        </div>
        <div>
          <span className="label-red">EFFORTS TO REMEDIATE</span>
          {f.effort}
        </div>
        <div>
          <span className="label-red">OWNER</span>
          {f.owner}
        </div>
      </div>

      <div className="grid-shot">
        <div className="shot">Screenshot</div>
        <div className="card-red">
          <span className="label-red">EVIDENCE-LED FINDING</span>
          <p>{f.evidence}</p>
        </div>
      </div>

      <div className="grid-two">
        <div>
          <span className="label-red">WHY THIS MATTERS</span>
          <p>{f.why}</p>
        </div>
        <div>
          <span className="label-red">REMEDIATION FIX</span>
          <ul>
            {f.fix.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function About() {
  return (
    <div className="about">
      <p className="eyebrow">ABOUT DARK PATTERNS</p>
      <h2 className="title">What are dark patterns?</h2>
      {ABOUT.map((t) => (
        <p className="para" key={t.slice(0, 20)}>
          {t}
        </p>
      ))}

      <h3 className="sub">Dark-pattern categories</h3>
      <table className="cat-table">
        <thead>
          <tr>
            <th>No.</th>
            <th>Pattern</th>
            <th>Definition</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map(([name, def], i) => (
            <tr key={name}>
              <td>{i + 1}</td>
              <td>
                <b>{name}</b>
              </td>
              <td>{def}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CapRegister({ rows, first }) {
  return (
    <div>
      <p className="eyebrow">CORRECTIVE ACTION PLAN REGISTER{first ? "" : " (CONTINUED)"}</p>
      <h2 className="title">Corrective Action Plan register</h2>
      <p className="para">
        Turn potential findings into owned, testable and revalidation-ready work items.
      </p>

      <table className="cat-table cap-table">
        <thead>
          <tr>
            <th>CAP ID</th>
            <th>Finding</th>
            <th>Root cause</th>
            <th>Action</th>
            <th>Owner</th>
            <th>Due</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>
                <b>{c.findingRef}</b> ({c.pattern})
              </td>
              <td>{c.rootCause}</td>
              <td>
                <ul>
                  {c.action.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </td>
              <td>{c.owner}</td>
              <td>{c.due}</td>
              <td>{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function capPages(r) {
  const groups = [];
  for (let i = 0; i < r.cap.length; i += REPORT.capRowsPerPage)
    groups.push(r.cap.slice(i, i + REPORT.capRowsPerPage));
  return groups.map((g, i) => <CapRegister key={`cap-${i}`} rows={g} first={i === 0} />);
}

// Page order: cover, summary, one page per finding, CAP register, about + categories
export function getPages(r) {
  return [
    <Cover r={r} key="cover" />,
    <Summary r={r} key="summary" />,
    ...r.findings.map((f) => <Finding f={f} key={f.id} />),
    ...capPages(r),
    <About key="about" />,
  ];
}
