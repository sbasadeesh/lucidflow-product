import Topbar from "../components/Topbar.jsx";
import { PLANNED_LABEL } from "../config.js";

// Static layout only (no logic). Replace the sample data when the real screen is built.

const STATS = [
  ["Builds checked", "128"],
  ["Passed", "119"],
  ["Blocked", "9"],
  ["Awaiting approval", "2"],
];
const STEPS = ["Commit", "Build", "LucidFlow scan", "Compliance gate", "Deploy"];
const RUNS = [
  ["1042", "main", "Blocked", "1", "8m 42s"],
  ["1041", "feature/checkout", "Passed", "0", "6m 17s"],
  ["1040", "main", "Passed", "0", "7m 03s"],
  ["1039", "release/v1.8", "Blocked", "2", "9m 21s"],
  ["1037", "feature/upsell", "Waiting", "1", "4m 12s"],
];

export default function Prevention() {
  return (
    <>
      <Topbar title="Prevention" />
      <div className="content">
        <p className="planned">{PLANNED_LABEL}</p>
        <p className="pl-sub">Dark-pattern checks in your CI/CD pipeline</p>

        <div className="pl-grid4">
          {STATS.map(([k, v]) => (
            <section key={k} className="card">
              <div className="pl-muted">{k}</div>
              <div className="pl-big">{v}</div>
            </section>
          ))}
        </div>

        <section className="card pl-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={i === 2 ? "pl-step bad" : "pl-step"}>
              <span className="pl-dot" />
              {s}
            </div>
          ))}
        </section>

        <div className="pl-cols pl-cols-wide">
          <section className="card">
            <h3 className="pl-h">Recent pipeline runs</h3>
            <table className="pl-table">
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Branch</th>
                  <th>Result</th>
                  <th>Findings</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {RUNS.map((r) => (
                  <tr key={r[0]}>
                    {r.map((c, i) => (
                      <td key={i} className={c === "Blocked" ? "pl-red" : ""}>
                        {i === 0 ? `Run ${c}` : c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h3 className="pl-h">Blocked build 1042</h3>
            <p className="pl-muted">Reason</p>
            <p>1 Critical: pre-selected add-on on /quote</p>
            <div className="pl-box">Finding details preview</div>
            <button type="button" disabled className="pl-btn">
              Request exception
            </button>
            <button type="button" disabled className="pl-btn primary">
              Approve override
            </button>
          </section>
        </div>
      </div>
    </>
  );
}