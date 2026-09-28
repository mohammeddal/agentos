export type ProviderPermissions = {
  codex: "on-request" | "never";
  claude: "default" | "acceptEdits";
};

export const PROVIDER_PERMISSIONS_STORAGE = "agentos:provider-permissions:v1";

export const defaultProviderPermissions: ProviderPermissions = {
  codex: "on-request",
  claude: "default",
};

export function readProviderPermissions(): ProviderPermissions {
  try {
    const saved = JSON.parse(localStorage.getItem(PROVIDER_PERMISSIONS_STORAGE) || "null");
    return {
      codex: saved?.codex === "never" ? "never" : "on-request",
      claude: saved?.claude === "acceptEdits" ? "acceptEdits" : "default",
    };
  } catch {
    return defaultProviderPermissions;
  }
}

export function saveProviderPermissions(value: ProviderPermissions) {
  localStorage.setItem(PROVIDER_PERMISSIONS_STORAGE, JSON.stringify(value));
}
