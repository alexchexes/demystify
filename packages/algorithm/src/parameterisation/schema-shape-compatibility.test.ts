import { createSchema } from "genson-js";
import { describe, expect, it } from "vitest";
import { areSchemasShapeCompatible } from "./schema-shape-compatibility.js";

const schema = (value: unknown) => createSchema(value);

describe("areSchemasShapeCompatible", () => {
  it("treats null object branches as neutral instead of missing descendants", () => {
    const sparse = schema({
      id: 1,
      title: "Example",
      price: 100,
      active: true,
      provider: null,
    });
    const populated = schema({
      id: 2,
      title: "Other",
      price: 200,
      active: false,
      provider: Object.fromEntries(
        Array.from({ length: 150 }, (_, index) => [
          `field_${index}`,
          `value_${index}`,
        ]),
      ),
    });

    expect(areSchemasShapeCompatible(sparse, populated, "established")).toBe(
      true,
    );
  });

  it("treats empty array item shape as neutral", () => {
    const empty = schema({
      id: 1,
      title: "Example",
      options: [],
    });
    const populated = schema({
      id: 2,
      title: "Other",
      options: [
        {
          id: 1,
          value: "enabled",
          option: { id: 1, title: "Router" },
        },
      ],
    });

    expect(areSchemasShapeCompatible(empty, populated, "strong-id")).toBe(true);
  });

  it("treats empty object shape as neutral", () => {
    const empty = schema({
      id: 1,
      title: "Example",
      metadata: {},
    });
    const populated = schema({
      id: 2,
      title: "Other",
      metadata: {
        priority: 10,
        owner: { id: 1, name: "Alice" },
      },
    });

    expect(areSchemasShapeCompatible(empty, populated, "strong-id")).toBe(true);
  });

  it("does not treat a neutral null branch as positive text-route evidence", () => {
    const sparse = schema({
      id: 1,
      provider: null,
    });
    const populated = schema({
      id: 2,
      provider: { id: 1, title: "Provider" },
    });

    expect(areSchemasShapeCompatible(sparse, populated, "text")).toBe(false);
  });

  it("requires observed field overlap for strong ID shape compatibility", () => {
    expect(
      areSchemasShapeCompatible(
        schema({ id: null }),
        schema({ id: 2 }),
        "strong-id",
      ),
    ).toBe(false);
  });

  it("requires observed field overlap for established shape compatibility", () => {
    expect(
      areSchemasShapeCompatible(
        schema({ provider: null }),
        schema({ provider: { id: 1, title: "Provider" } }),
        "established",
      ),
    ).toBe(false);
  });

  it("rejects array versus object container conflicts", () => {
    expect(
      areSchemasShapeCompatible(
        schema({ id: 1, values: [] }),
        schema({ id: 2, values: {} }),
        "established",
      ),
    ).toBe(false);
  });

  it("rejects array item kind conflicts", () => {
    expect(
      areSchemasShapeCompatible(
        schema({ id: 1, values: [{ id: 1 }] }),
        schema({ id: 2, values: ["one"] }),
        "established",
      ),
    ).toBe(false);
  });

  it("rejects scalar versus object conflicts", () => {
    expect(
      areSchemasShapeCompatible(
        schema({ id: 1, provider: "unknown" }),
        schema({ id: 2, provider: { id: 1 } }),
        "established",
      ),
    ).toBe(false);
  });

  it("keeps scalar primitive variations compatible", () => {
    expect(
      areSchemasShapeCompatible(
        schema({ id: 1, status: "ready" }),
        schema({ id: 2, status: false }),
        "strong-id",
      ),
    ).toBe(true);
  });
});
