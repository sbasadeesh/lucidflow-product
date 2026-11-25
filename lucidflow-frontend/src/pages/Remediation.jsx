import Topbar from "../components/Topbar.jsx";
import { PLANNED_LABEL } from "../config.js";

// Static layout only (no logic). Replace the sample data when the real screen is built.

const STAGES = ["Assigned", "In fix", "AI prototype", "Compliance review", "Approved"];
const CHAT = [
  ["Jane Developer", "I have removed the pre-ticked checkbox. The add-on is now opt-in only."],
  ["Mark Patel", "Looks good to me. This aligns with our commercial policy."],
  ["Sarah Lee", "Please confirm the change is live in all environments."],
];

export default function Remediation() {
  return (
    <>
      <Topbar title="Remediation" />
      <div className="content">
        <p className="planned">{PLANNED_LABEL}</p>
        <p className="pl-sub">Finding F-003: Pre-selected add-on, Critical</p>

        <section className="card pl-steps">
          {STAGES.map((s, i) => (
            <div key={s} className={i === 3 ? "pl-step bad" : "pl-step"}>
              <span className="pl-dot" />
              {s}
            </div>
          ))}
        </section>

        <div className="pl-cols">
          <section className="card">
            <h3 className="pl-h">Finding details</h3>
            <div className="pl-box">Add-ons preview</div>
            <p className="pl-muted">Evidence</p>
            <p>The add-on is pre-selected by default, which may lead to unintended charges.</p>
            <p className="pl-muted">Recommended fix</p>
            <p>Remove the pre-selection. Users must explicitly opt in.</p>
          </section>

          <section className="card">
            <h3 className="pl-h">Conversation</h3>
            {CHAT.map(([who, text]) => (
              <div key={who} className="pl-msg">
                <strong>{who}</strong>
                <div>{text}</div>
              </div>
            ))}
            <div className="pl-box">Add a comment...</div>
            <button type="button" disabled className="pl-btn primary">
              Post comment
            </button>
          </section>

          <section className="card">
            <h3 className="pl-h">AI-generated updated prototype</h3>
            <div className="pl-two">
              <div className="pl-box">Before (current)</div>
              <div className="pl-box">After (updated)</div>
            </div>
            <button type="button" disabled className="pl-btn">
              Regenerate
            </button>
            <button type="button" disabled className="pl-btn primary">
              Attach to finding
            </button>
          </section>
        </div>

        <section className="card pl-bar">
          <span>Compliance approval: awaiting approval from Compliance lead</span>
          <span>
            <button type="button" disabled className="pl-btn">
              Request changes
            </button>
            <button type="button" disabled className="pl-btn primary">
              Approve fix
            </button>
          </span>
        </section>
      </div>
    </>
  );
}