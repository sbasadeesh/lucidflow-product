import { Link } from "react-router-dom";
import Topbar from "./Topbar.jsx";

export default function NoScan() {
  return (
    <>
      <Topbar title="Reports" />
      <div className="content narrow">
        <div className="card">
          <p>No scan yet. Run a scan first to see its report.</p>
          <div className="actions left">
            <Link to="/" className="btn primary">
              Start a scan
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
