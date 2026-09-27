import { useEffect, useState } from "react";
import { parseRoute, routeHash, type WorkspaceRoute } from "./navigation";

export function useWorkspaceRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const read = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  function go(next: WorkspaceRoute) {
    setRoute(next);
    const hash = routeHash(next);
    if (window.location.hash !== hash) window.location.hash = hash;
  }
  return { route, go };
}
