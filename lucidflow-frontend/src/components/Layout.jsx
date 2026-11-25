import { NavLink, Outlet } from "react-router-dom";
import { NAV_LINKS } from "../config.js";
import Icon from "./Icon.jsx";

export function Logo() {
  return (
    <div className="logo">
      <img src="/logo.png" alt="LucidFlow - Every Click Flawless. Every Journey Compliant." />
    </div>
  );
}

export default function Layout() {
  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <Logo />
        <nav>
          {NAV_LINKS.map((l) =>
            l.disabled ? (
              <span key={l.label} className="nav-item disabled">
                <Icon name={l.icon} />
                <span>{l.label}</span>
              </span>
            ) : (
              <NavLink
                key={l.label}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
              >
                <Icon name={l.icon} />
                <span>{l.label}</span>
              </NavLink>
            ),
          )}
        </nav>
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}