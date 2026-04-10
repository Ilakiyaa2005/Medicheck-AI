/**
 * Router.jsx  —  Page navigation wrapper
 *
 * Pages:
 *   "landing"   → Landing.jsx  (intro / marketing page)
 *   "scanner"   → App.jsx      (existing scanner — UNCHANGED)
 *   "dashboard" → Dashboard.jsx (analytics)
 *
 * This file is the ONLY new file that touches main.jsx.
 * App.jsx, App.css are completely untouched.
 */

import { useState } from "react";
import Landing   from "./Landing.jsx";
import App       from "./App.jsx";
import Dashboard from "./Dashboard.jsx";
import "./Router.css";

export default function Router() {
  const [page, setPage] = useState("landing");

  /* nav bar injected on top of scanner & dashboard pages */
  const NavBar = () => (
    <nav className="router-nav">
      <div className="rn-logo" onClick={() => setPage("landing")}>
        <span className="rn-hex">⬡</span> SPECTRAAUTH
      </div>
      <div className="rn-links">
        <button
          className={`rn-btn ${page === "landing"   ? "rn-active" : ""}`}
          onClick={() => setPage("landing")}>
          Home
        </button>
        <button
          className={`rn-btn ${page === "scanner"   ? "rn-active" : ""}`}
          onClick={() => setPage("scanner")}>
          🔬 Scanner
        </button>
        <button
          className={`rn-btn ${page === "dashboard" ? "rn-active" : ""}`}
          onClick={() => setPage("dashboard")}>
          📊 Dashboard
        </button>
      </div>
    </nav>
  );

  if (page === "landing") {
    return <Landing onEnter={() => setPage("scanner")} />;
  }

  if (page === "scanner") {
    return (
      <div className="router-page">
        <NavBar />
        {/* App renders its own header too — the router nav sits above it */}
        <App />
      </div>
    );
  }

  if (page === "dashboard") {
    return (
      <div className="router-page">
        <NavBar />
        <Dashboard onBack={() => setPage("scanner")} />
      </div>
    );
  }

  return null;
}
