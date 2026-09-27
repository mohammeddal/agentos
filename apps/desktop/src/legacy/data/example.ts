import type { Asset, Catalog } from "./catalog";
const node = (
  id: string,
  name: string,
  kind: string,
  parents: string[],
  extra: Partial<Asset> = {},
): Asset => ({
  id,
  name,
  kind,
  parents,
  description: "",
  file: "",
  relation: "",
  owner: "",
  columns: [],
  status: "unknown",
  executionTime: null,
  ...extra,
});
export const exampleCatalog: Catalog = {
  version: 1,
  name: "Commerce analytics",
  example: true,
  importedAt: "",
  generatedAt: "2026-09-25T08:30:00Z",
  resultsAt: "2026-09-25T08:42:00Z",
  warnings: [],
  assets: [
    node("source.shop.orders", "orders", "source", [], {
      relation: "RAW.SHOP.ORDERS",
      description:
        "Order events from the commerce platform. Freshness has not been measured.",
    }),
    node("source.shop.payments", "payments", "source", [], {
      relation: "RAW.SHOP.PAYMENTS",
    }),
    node(
      "model.shop.stg_orders",
      "stg_orders",
      "model",
      ["source.shop.orders"],
      {
        file: "models/staging/stg_orders.sql",
        status: "success",
        description:
          "One row per order. Normalizes source timestamps and order status.",
      },
    ),
    node(
      "model.shop.stg_payments",
      "stg_payments",
      "model",
      ["source.shop.payments"],
      { file: "models/staging/stg_payments.sql", status: "success" },
    ),
    node(
      "model.shop.fct_revenue",
      "fct_revenue",
      "model",
      ["model.shop.stg_orders", "model.shop.stg_payments"],
      {
        file: "models/marts/fct_revenue.sql",
        relation: "ANALYTICS.MARTS.FCT_REVENUE",
        owner: "Analytics engineering",
        status: "success",
        description:
          "Order-level revenue, joined to payment events. A unique-key test failed in this fictional run. A one-to-many payment join is a hypothesis to investigate, not an established root cause.",
        columns: [
          { name: "order_id", type: "NUMBER" },
          { name: "customer_id", type: "NUMBER" },
          { name: "net_revenue", type: "DECIMAL(18,2)" },
          { name: "order_date", type: "DATE" },
        ],
      },
    ),
    node(
      "model.shop.customer_value",
      "customer_value",
      "model",
      ["model.shop.fct_revenue"],
      { file: "models/marts/customer_value.sql", status: "skipped" },
    ),
    node(
      "exposure.shop.revenue",
      "Revenue overview",
      "exposure",
      ["model.shop.fct_revenue"],
      {
        owner: "Finance",
        description:
          "Fictional Sigma dashboard, represented as a dbt exposure. No Sigma connection or usage evidence.",
      },
    ),
    node(
      "exposure.shop.retention",
      "Customer retention",
      "exposure",
      ["model.shop.customer_value"],
      { owner: "Growth" },
    ),
    node(
      "test.shop.unique_revenue",
      "unique_fct_revenue_order_id",
      "test",
      ["model.shop.fct_revenue"],
      {
        status: "fail",
        file: "models/marts/schema.yml",
        description:
          "The uniqueness assertion returned a failing result. The artifact does not contain offending rows.",
      },
    ),
    node(
      "test.shop.not_null_revenue",
      "not_null_fct_revenue_order_id",
      "test",
      ["model.shop.fct_revenue"],
      { status: "pass", file: "models/marts/schema.yml" },
    ),
  ],
};
