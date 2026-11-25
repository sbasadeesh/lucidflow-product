import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { HOME } from "../config.js";
import { recentScans } from "../data.js";
import { saveScan } from "../scanStore.js";
import { findRepeats, parseEntries } from "../urlUtils.js";



// A cell can hold plain text or a hyperlink object
const asText = (v) => (v && typeof v === "object" ? v.hyperlink || v.text || "" : (v ?? ""));

// Reads page URLs from column A of the first sheet.
// Cells that do not look like a URL (for example the header) are skipped.
async function readUrlsFromExcel(buffer) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];

  const urls = [];
  sheet.getColumn(1).eachCell((cell) => {
    const t = String(asText(cell.value)).trim();
    if (t.includes(".") && !/\s/.test(t)) urls.push(t);
  });
  return [...new Set(urls)];
}

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("pages");
  const [texts, setTexts] = useState({ pages: "", domain: "" });
  const fileRef = useRef(null);
  const [notice, setNotice] = useState("");

  const current = HOME.modes[mode];
  const text = texts[mode];
    const items = parseEntries(text, mode);
  const errors = items.filter((i) => !i.ok);
  const valid = items.filter((i) => i.ok);
  const repeats = [...new Set(findRepeats(text, mode))];
  const tooMany = mode === "pages" && items.length > HOME.maxUrls;
  const canRun = valid.length > 0 && !tooMany;

  const setText = (value) => setTexts({ ...texts, [mode]: value });
  const removeItem = (raw) =>
    setText(
      items
        .filter((i) => i.raw !== raw)
        .map((i) => i.raw)
        .join(", "),
    );

      // Add URLs to the Page URLs box, keeping what is already there (no repeats)
  const addUrls = (list) =>
    setTexts((t) => {
      const have = t.pages
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return { ...t, pages: [...new Set([...have, ...list])].join(", ") };
    });

  const fillFromPrevious = () => addUrls(recentScans[0].pages);

  const onFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setNotice("Please choose an Excel file (.xlsx).");
      return;
    }
    try {
      const urls = await readUrlsFromExcel(await file.arrayBuffer());
      if (urls.length === 0) {
        setNotice("No URLs found in this file.");
        return;
      }
      addUrls(urls);
      setNotice("");
    } catch {
      setNotice("This file could not be read.");
    }
  };

   const run = () => {
    saveScan({
      mode,
      host: valid[0].host,
      urls: mode === "pages" ? valid.map((i) => i.url) : [],
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
              <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onFile} />
              <button className="link" onClick={() => fileRef.current.click()}>
                Upload from Excel
              </button>
              <button className="link" onClick={fillFromPrevious}>
                Fill from previous findings
              </button>
            </div>
          )}
          {notice && <p className="error">{notice}</p>}

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
          {repeats.map((r) => (
            <p className="error" key={r}>
              {r}: Repeated, left out
            </p>
          ))}
          {tooMany && (
            <p className="error">
              Too many URLs: {items.length} entered, the limit is {HOME.maxUrls}. Remove some and try
              again.
            </p>
          )}
          {mode === "pages" && canRun && (
            <p className="muted">
              {valid.length} page{valid.length > 1 ? "s" : ""} added
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
