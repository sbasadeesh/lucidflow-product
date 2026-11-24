import { useState } from "react";
import Topbar from "../components/Topbar.jsx";

export default function Schedule() {
  const [items, setItems] = useState([
    { id: 1, domain: "www.abcinsurance.example", freq: "Weekly", time: "09:00" },
    { id: 2, domain: "www.novafinance.example", freq: "Monthly", time: "10:30" },
  ]);
  const [form, setForm] = useState({ domain: "", freq: "Weekly", time: "09:00" });

  const add = () => {
    if (!form.domain.trim()) return;
    setItems([...items, { id: Date.now(), ...form }]);
    setForm({ ...form, domain: "" });
  };

  return (
    <>
      <Topbar title="Schedule" />
      <div className="content narrow">
        <div className="card">
          <h3>Schedule a scan</h3>
          <label className="label">Domain</label>
          <input
            placeholder="www.example.com"
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value })}
          />
          <div className="grid2">
            <div>
              <label className="label">Frequency</label>
              <select
                value={form.freq}
                onChange={(e) => setForm({ ...form, freq: e.target.value })}
              >
                <option>Daily</option>
                <option>Weekly</option>
                <option>Monthly</option>
              </select>
            </div>
            <div>
              <label className="label">Time</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
          </div>
          <div className="actions left">
            <button className="btn primary" onClick={add}>
              Add schedule
            </button>
          </div>
        </div>

        <h3 className="section">Scheduled scans</h3>
        <table className="list">
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{s.domain}</b>
                </td>
                <td>{s.freq}</td>
                <td>{s.time}</td>
                <td>
                  <button
                    className="link"
                    onClick={() => setItems(items.filter((x) => x.id !== s.id))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
