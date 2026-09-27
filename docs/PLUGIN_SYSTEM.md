# Plugin System

Plugins are versioned contribution bundles loaded through a narrow host contract. The core registry owns definitions; a plugin cannot mutate core state directly.

## Manifest

```json
{
  "schemaVersion": "1",
  "id": "com.example.data-platform",
  "name": "Data Platform Pack",
  "version": "1.0.0",
  "staffforge": { "minVersion": "0.1.0", "maxVersion": "0.x" },
  "permissions": ["warehouse.metadata.read", "warehouse.query"],
  "contributes": {
    "agents": ["./agents/detective.json"],
    "skills": ["./skills/metric-change.json"],
    "workflows": [],
    "tools": [],
    "capabilities": [],
    "commands": [],
    "ui": []
  }
}
```

## Contract

- Manifests and every referenced definition are schema-validated before registration.
- IDs are namespaced and collisions fail the plugin, not the host.
- Requested permissions are displayed before enablement. Installation does not grant them.
- Contributions are declarative in V1. Executable plugin modules are disabled until process isolation, signing, and an explicit trust model are available.
- A plugin may contribute agents, skills, tools, workflows, capability providers, policies, commands, context/memory providers, event processors, and UI extension descriptors.
- UI descriptors target named slots: `dashboard.widgets`, `agent.detail.tabs`, `sidebar.items`, `settings.sections`, `commandPalette.commands`, and `tool.result.renderers`.

## Sources

`PluginSource` supports local directories first. The registry reserves source kinds for Git repositories, npm packages, the StaffForge registry, and private organization registries.

## Lifecycle

Discover -> validate -> compatibility check -> permission review -> enable -> register -> observe. Any failure produces `plugin.failed` and leaves other plugins operational.
