import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import History from "./pages/History.jsx";
import Schedule from "./pages/Schedule.jsx";
import Settings from "./pages/Settings.jsx";
import Scan from "./pages/Scan.jsx";
import ReportPreview from "./pages/ReportPreview.jsx";
import ReportReady from "./pages/ReportReady.jsx";
import { useEffect } from "react";
import { applyTheme } from "./theme.js";



export default function App() {
useEffect(() => {
  applyTheme();
}, []);
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/new-scan" element={<Home />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/reports" element={<ReportPreview />} />
        <Route path="/reports/ready" element={<ReportReady />} />
        <Route path="/history" element={<History />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
