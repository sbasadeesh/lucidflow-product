import { useState } from "react";
import { Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { recentScans } from "../data.js";

const all = [
  ...recentScans,
  {
    domain: "www.zenlife.example",
    date: "02 Oct 2026",
    status: "Completed",
    result: "5 potential dark patterns",
  },
  {
    domain: "www.primeloans.example",
    date: "28 Sep 2026",
    status: "Completed",
    result: "9 potential dark patterns",
  },
  {
    domain: "www.safedrive.example",
    date: "21 Sep 2026",
    status: "Needs review",
    result: "3 potential dark patterns",
  },
];

export default function History() {
  const [q, setQ] = useState("");
  const rows = all.filter((s) => s.domain.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Topbar title="History" />
      <div className="content narrow">
        <input placeholder="Search by domain" value={q} onChange={(e) => setQ(e.target.value)} />
        <table className="list">
          <tbody>
            {rows.map((s) => (
              <tr key={s.domain}>
                <td>
                  <b>{s.domain}</b>
                </td>
                <td>{s.date}</td>
                <td>
                  <b>{s.status}</b>
                </td>
                <td>{s.result}</td>
                <td>
                  <Link className="link" to="/reports">
                    View report
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="muted">No scans found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
