import { NavLink, Outlet } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { SETTINGS_SECTIONS } from "../config.js";
import Icon from "../components/Icon.jsx";

export default function Settings() {
  return (
    <>
      <Topbar title="Settings" />
      <div className="content">
        <div className="settings-body">
          <div className="settings-menu card">
            {SETTINGS_SECTIONS.map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                className={({ isActive }) => "settings-item" + (isActive ? " active" : "")}
              >
                <Icon name={s.icon} />
<span>{s.label}</span>
              </NavLink>
            ))}
          </div>
      
            <Outlet />
          
        </div>
      </div>
    </>
  );
}