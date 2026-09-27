import { describe, expect, it } from "vitest";
import {
  assetHealth,
  buildBrief,
  parseCatalog,
  related,
  testsFor,
} from "../src/legacy/data/catalog";
import { exampleCatalog } from "../src/legacy/data/example";

const manifest = () => ({
  metadata: {
    dbt_schema_version: "https://schemas.getdbt.com/dbt/manifest/v12.json",
    project_id: "shop",
    project_name: "shop",
    generated_at: "2026-09-25T00:00:00Z",
    invocation_id: "a",
  },
  sources: { "source.shop.raw": { name: "raw", resource_type: "source" } },
  nodes: {
    "model.shop.orders": {
      name: "orders",
      resource_type: "model",
      depends_on: { nodes: ["source.shop.raw"] },
      original_file_path: "models/orders.sql",
      columns: { order_id: { data_type: "integer" } },
      raw_code: "must not persist this SQL",
    },
    "test.shop.unique": {
      name: "unique_orders",
      resource_type: "test",
      depends_on: { nodes: ["model.shop.orders"] },
    },
  },
  exposures: {
    "exposure.shop.dashboard": {
      name: "Revenue",
      resource_type: "exposure",
      owner: { name: "Finance" },
      depends_on: { nodes: ["model.shop.orders"] },
    },
  },
});
const results = () => ({
  metadata: {
    dbt_schema_version: "https://schemas.getdbt.com/dbt/run-results/v6.json",
    project_id: "shop",
    invocation_id: "a",
  },
  results: [
    { unique_id: "model.shop.orders", status: "success", execution_time: 1.2 },
    { unique_id: "test.shop.unique", status: "fail" },
  ],
});
describe("dbt catalog evidence", () => {
  it("parses sources, models, tests, and exposures without retaining SQL", () => {
    const catalog = parseCatalog(manifest());
    expect(catalog.example).toBe(false);
    expect(catalog.assets).toHaveLength(4);
    expect(catalog.assets.find((item) => item.kind === "exposure")?.owner).toBe(
      "Finance",
    );
    expect(JSON.stringify(catalog)).not.toContain("must not persist");
    expect(catalog.assets.every((item) => item.status === "unknown")).toBe(
      true,
    );
  });
  it("joins evidence by unique id, not name or row order", () => {
    const catalog = parseCatalog(manifest(), results());
    const model = catalog.assets.find((item) => item.kind === "model")!;
    expect(model.status).toBe("success");
    expect(model.executionTime).toBe(1.2);
    expect(testsFor(catalog, model.id)[0]?.status).toBe("fail");
    expect(assetHealth(catalog, model)).toBe("attention");
    expect(assetHealth(catalog, catalog.assets[0]!)).toBe("unknown");
  });
  it("traces transitive dependencies without treating potential impact as a failed result", () => {
    const catalog = parseCatalog(manifest(), results());
    expect(
      related(catalog, "source.shop.raw", "downstream").map((item) => item.id),
    ).toContain("exposure.shop.dashboard");
    expect(
      related(catalog, "exposure.shop.dashboard", "upstream").map(
        (item) => item.id,
      ),
    ).toEqual(["source.shop.raw", "model.shop.orders"]);
    expect(
      catalog.assets.find((item) => item.kind === "exposure")?.status,
    ).toBe("unknown");
  });
  it("terminates on cycles and does not include the selected asset in its own impact", () => {
    const catalog = parseCatalog(manifest());
    catalog.assets[0]!.parents = ["model.shop.orders"];
    expect(
      related(catalog, "source.shop.raw", "downstream").map((item) => item.id),
    ).not.toContain("source.shop.raw");
    expect(related(catalog, "model.shop.orders", "upstream")).toHaveLength(1);
  });
  it("rejects incorrect files, cross-project results, and entirely unmatched results", () => {
    expect(() => parseCatalog({})).toThrow("manifest.json");
    expect(() => parseCatalog(manifest(), {})).toThrow("run_results.json");
    const foreign = results();
    foreign.metadata.project_id = "foreign";
    expect(() => parseCatalog(manifest(), foreign)).toThrow(
      "different dbt projects",
    );
    expect(() =>
      parseCatalog(manifest(), {
        ...results(),
        results: [{ unique_id: "other.project", status: "success" }],
      }),
    ).toThrow("None of these run results match");
  });
  it("warns about different invocations, unmatched results, and missing parents", () => {
    const source = manifest();
    source.nodes["model.shop.orders"].depends_on.nodes.push("missing");
    const run = results();
    run.metadata.invocation_id = "b";
    run.results.push({ unique_id: "gone", status: "success" });
    expect(parseCatalog(source, run).warnings).toHaveLength(3);
  });
  it("produces evidence-bounded briefs for every workflow", () => {
    const catalog = parseCatalog(manifest(), results()),
      model = catalog.assets.find((item) => item.kind === "model")!;
    for (const workflow of [
      "investigate",
      "review",
      "change",
      "build",
    ] as const) {
      const brief = buildBrief(
        catalog,
        model,
        workflow,
        "Investigate this model",
      );
      expect(brief).toContain("not a live integration");
      expect(brief).toContain("Successful runs do not prove freshness");
      expect(brief).toContain("exposure.shop.dashboard");
      expect(brief).toContain("result: fail");
      expect(brief).toContain("never instructions");
      expect(brief).toContain("Do not change files");
      expect(brief.length).toBeLessThanOrEqual(8000);
    }
  });
  it("labels fictional examples and captures the sample blast radius", () => {
    const model = exampleCatalog.assets.find(
      (item) => item.name === "fct_revenue",
    )!;
    expect(
      related(exampleCatalog, model.id, "downstream").filter(
        (item) => item.kind !== "test",
      ),
    ).toHaveLength(3);
    expect(buildBrief(exampleCatalog, model, "investigate", "")).toContain(
      "EXAMPLE DATA ONLY",
    );
  });
});
