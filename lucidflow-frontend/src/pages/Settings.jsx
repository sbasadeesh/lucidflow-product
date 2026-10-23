import { useState } from "react";
import Topbar from "../components/Topbar.jsx";

export default function Settings() {
  const [s, setS] = useState({
    org: "SBA Info Solutions",
    email: "",
    language: "English",
    notifyDone: true,
    notifyWeekly: false,
    testUser: "",
    testPass: "",
  });
  const [saved, setSaved] = useState(false);
  const set = (k, v) => {
    setS({ ...s, [k]: v });
    setSaved(false);
  };

  return (
    <>
      <Topbar title="Settings" />
      <div className="content narrow">
        <div className="card">
          <h3>Account</h3>
          <label className="label">Organisation</label>
          <input value={s.org} onChange={(e) => set("org", e.target.value)} />
          <label className="label">Notification email</label>
          <input type="email" value={s.email} onChange={(e) => set("email", e.target.value)} />
          <label className="label">Default report language</label>
          <select value={s.language} onChange={(e) => set("language", e.target.value)}>
            <option>English</option>
            <option>Tamil</option>
            <option>Hindi</option>
          </select>
        </div>

        <div className="card gap">
          <h3>Notifications</h3>
          <label className="switch-row">
            Notify me when a scan finishes
            <input
              type="checkbox"
              checked={s.notifyDone}
              onChange={(e) => set("notifyDone", e.target.checked)}
            />
          </label>
          <label className="switch-row">
            Weekly summary email
            <input
              type="checkbox"
              checked={s.notifyWeekly}
              onChange={(e) => set("notifyWeekly", e.target.checked)}
            />
          </label>
        </div>

        <div className="card gap">
          <h3>Test account</h3>
          <p className="muted">Used to assess pages behind login.</p>
          <label className="label">Username</label>
          <input value={s.testUser} onChange={(e) => set("testUser", e.target.value)} />
          <label className="label">Password</label>
          <input
            type="password"
            value={s.testPass}
            onChange={(e) => set("testPass", e.target.value)}
          />
        </div>

        <div className="actions left">
          <button className="btn primary" onClick={() => setSaved(true)}>
            Save changes
          </button>
          {saved && <span className="muted">Saved ✓</span>}
        </div>
      </div>
    </>
  );
}
