import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Keep the earlier data and studio surfaces available while AgentOS becomes the default shell.
async function start() {
  const params = new URLSearchParams(window.location.search);
  const View = params.has("studio")
    ? (await import("./Studio")).Studio
    : params.has("data")
      ? (await import("./DataWorkspace")).DataWorkspace
      : params.has("workbench")
        ? (await import("./AgentWorkbench")).AgentWorkbench
        : (await import("./CompanyWorkspace")).CompanyWorkspace;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <View />
    </StrictMode>,
  );
}
void start();
