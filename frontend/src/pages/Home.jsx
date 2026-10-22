import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { HOME } from "../config.js";
import { recentScans } from "../data.js";
import { saveScan } from "../scanStore.js";
import { parseEntries } from "../urlUtils.js";

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("pages");
  const [texts, setTexts] = useState({ pages: "", domain: "" });

  const current = HOME.modes[mode];
  const text = texts[mode];
  const items = parseEntries(text, mode);
  const errors = items.filter((i) => !i.ok);
  const canRun = items.length > 0 && errors.length === 0;

  const setText = (value) => setTexts({ ...texts, [mode]: value });
  const removeItem = (raw) =>
    setText(
      items
        .filter((i) => i.raw !== raw)
        .map((i) => i.raw)
        .join(", "),
    );

  const run = () => {
    saveScan({
      mode,
      host: items[0].host,
      urls: mode === "pages" ? items.map((i) => i.url) : [],
    });
    navigate(HOME.scanRoute);
  };

  return (
    <>
      <Topbar title={HOME.title} />
      <div className="content narrow">
        <div className="card">
          <div className="tabs">
            {Object.entries(HOME.modes).map(([key, m]) => (
              <button key={key} className={mode === key ? "on" : ""} onClick={() => setMode(key)}>
                {m.label}
              </button>
            ))}
          </div>

          <label className="label">{current.inputLabel}</label>
          {current.multiline ? (
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={current.placeholder}
            />
          ) : (
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={current.placeholder}
            />
          )}
          <p className="muted">{current.help}</p>

          {mode === "pages" && (
            <div className="links">
              <button className="link">Upload from Excel</button>
              <button className="link">Fill from previous findings</button>
            </div>
          )}

          {items.length > 0 && (
            <div className="chips">
              {items.map((i) => (
                <span className={"chip" + (i.ok ? "" : " bad")} key={i.raw}>
                  {i.ok ? i.url : i.raw}
                  <button onClick={() => removeItem(i.raw)}>×</button>
                </span>
              ))}
            </div>
          )}

          {errors.map((e) => (
            <p className="error" key={e.raw}>
              {e.raw}: {e.error}
            </p>
          ))}
          {mode === "pages" && canRun && (
            <p className="muted">
              {items.length} page{items.length > 1 ? "s" : ""} added
            </p>
          )}

          <button className="btn primary" disabled={!canRun} onClick={run}>   
            {HOME.runLabel}
          </button>
        </div>

        <h3 className="section">{HOME.recentTitle}</h3>
        <table className="list">
          <tbody>
            {recentScans.map((s) => (
              <tr key={s.domain}>
                <td>
                  <b>{s.domain}</b>
                </td>
                <td>{s.date}</td>
                <td>
                  <b>{s.status}</b>
                </td>
                <td>{s.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
