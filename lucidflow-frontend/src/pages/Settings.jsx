import { NavLink, Outlet } from "react-router-dom";
import { SETTINGS_SECTIONS } from "../config.js";

export default function Settings() {
  return (
    <div className="settings">
      <h1 className="page-title">Settings</h1>
      <div className="settings-body">
        <nav className="settings-menu">
          {SETTINGS_SECTIONS.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) => "settings-item" + (isActive ? " active" : "")}
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <section className="settings-panel">
          <Outlet />
        </section>
      </div>
    </div>
  );
}