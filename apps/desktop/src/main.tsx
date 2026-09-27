import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Keep the earlier data and studio surfaces available while AgentOS becomes the default shell.
async function start() {
  const params = new URLSearchParams(window.location.search);
  const View = params.has("studio")
    ? (await import("./legacy/studio/Studio")).Studio
    : params.has("data")
      ? (await import("./legacy/data/DataWorkspace")).DataWorkspace
      : params.has("workbench")
        ? (await import("./legacy/workbench/AgentWorkbench")).AgentWorkbench
        : (await import("./app/CompanyWorkspace")).CompanyWorkspace;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <View />
    </StrictMode>,
  );
}
void start();
