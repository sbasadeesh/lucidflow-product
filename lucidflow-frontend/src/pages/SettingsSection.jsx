import { Navigate, useParams } from "react-router-dom";
import { PLANNED_LABEL, SETTINGS_SECTIONS } from "../config.js";

// Dummy page: title and a label only. No data, no actions.
export default function SettingsSection() {
  const { section } = useParams();
  const item = SETTINGS_SECTIONS.find((s) => s.to === `/settings/${section}`);
  if (!item) return <Navigate to="/settings" replace />;

    return (
    <section className="settings-panel card">
      <h2 className="panel-title">{item.label}</h2>
      <p className="planned">{PLANNED_LABEL}</p>
    </section>
  );
}