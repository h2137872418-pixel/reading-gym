import { useEffect, useState } from "react";
import History from "./pages/History";
import Session from "./pages/Session";
import SettingsPage from "./pages/Settings";
import Today from "./pages/Today";
import { ToastProvider } from "./components/Toast";

export function navigate(path: string) {
  if (location.hash.slice(1) === path) return;
  location.hash = path;
}

function useHashRoute() {
  const [hash, setHash] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const onChange = () => setHash(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const route = useHashRoute();
  const sessionMatch = route.match(/^\/session\/([^/]+)(?:\/([^/]+))?$/);
  const page = sessionMatch ? "session" : route === "/history" ? "history" : route === "/settings" ? "settings" : "today";

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            答题台 <small>Reading Gym</small>
          </div>
          <nav className="nav">
            <a href="#/" className={page === "today" ? "active" : ""}>
              今日
            </a>
            <a href="#/history" className={page === "history" ? "active" : ""}>
              历史
            </a>
            <a href="#/settings" className={page === "settings" ? "active" : ""}>
              设置
            </a>
          </nav>
        </header>

        <main className={page === "session" ? "page wide" : "page"}>
          {page === "session" && sessionMatch && (
            <Session
              date={decodeURIComponent(sessionMatch[1])}
              passageId={sessionMatch[2] ? decodeURIComponent(sessionMatch[2]) : undefined}
            />
          )}
          {page === "today" && <Today />}
          {page === "history" && <History />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>
    </ToastProvider>
  );
}
