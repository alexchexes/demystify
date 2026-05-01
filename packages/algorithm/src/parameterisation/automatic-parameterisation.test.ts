import { describe, it, expect } from "vitest";
import { automaticParameterisation } from "./automatic-parameterisation.js";
import { Representor } from "../representor.js";
import { createContent, createHarEntry } from "../__helpers__/index.js";

const host = "api.example.com";
const href = `https://${host}`;
const mimeType = "application/json";
const method = "post";
const statusCode = "200";

describe("automaticParameterisation", () => {
  it("automatically folds non-strong text paths after four equivalent observations", () => {
    const representor = new Representor();
    const response = createContent({ id: 1, title: "Example" });
    for (const slug of [
      "christopher-taylor",
      "john-allen",
      "elisha-rumsey",
      "mary-smith",
    ]) {
      representor.upsert(
        createHarEntry({
          url: `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`,
          response,
        }),
      );
    }

    const data =
      representor.rest.data["en.wikipedia.org"]!.childrenStatic["api"]!
        .childrenStatic["rest_v1"]!.childrenStatic["page"]!.childrenStatic[
        "summary"
      ]!;
    expect(Object.keys(data.childrenStatic)).toHaveLength(0);
    expect(data.childrenDynamic[0]!.key).toBe("{summary}");
    expect(data.childrenDynamic).toHaveLength(1);
  });

  it("does not automatically fold non-strong text paths before four equivalent observations", () => {
    const representor = new Representor();
    const response = createContent({ ok: true });
    representor.upsert(
      createHarEntry({ url: `${href}/command/core/get-preference`, response }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/command/core/set-preference`, response }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/command/core/list-preferences`,
        response,
      }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/command/core/get-preference",
      "/command/core/list-preferences",
      "/command/core/set-preference",
    ]);
  });

  it("automatically folds non-strong text paths after four compatible shape observations", () => {
    const representor = new Representor();
    const responses = [
      createContent({ id: 1, status: "ready", meta: null }),
      createContent({ id: 2, status: false, meta: null }),
      createContent({ id: 3, status: "ready", meta: { id: 1, title: "A" } }),
      createContent({ id: 4, status: true, meta: { id: 2, title: "B" } }),
    ];
    for (const [idx, slug] of ["alpha", "beta", "gamma", "delta"].entries()) {
      representor.upsert(
        createHarEntry({
          url: `${href}/api/page/${slug}`,
          response: responses[idx],
        }),
      );
    }

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual(["/api/page/{page}"]);
  });

  it("does not fold generic empty collection wrappers as text paths", () => {
    const representor = new Representor();
    const response = createContent({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
    for (const resource of ["clients", "orders", "leads", "tasks"]) {
      representor.upsert(
        createHarEntry({ url: `${href}/api/v2/${resource}`, response }),
      );
    }

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/v2/clients",
      "/api/v2/leads",
      "/api/v2/orders",
      "/api/v2/tasks",
    ]);
  });

  it("keeps text safety checks when compatible shape matching is disabled", () => {
    const representor = new Representor({
      parameterisation: { compatibleShape: false },
    });
    const response = createContent({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
    for (const resource of ["clients", "orders", "leads", "tasks"]) {
      representor.upsert(
        createHarEntry({ url: `${href}/api/v2/${resource}`, response }),
      );
    }

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/v2/clients",
      "/api/v2/leads",
      "/api/v2/orders",
      "/api/v2/tasks",
    ]);
  });

  it("should automatically update to /a/{} given /a and /a/3/c", () => {
    // Test after upserting observations
    // /a/1 -> request1 (match)
    // /a/2 -> request1 (match)
    // /a -> request2
    // /a -> request1
    // /a/3/c -> request1
    // Then parameterise path ["a", "1"]
    // This gives
    // /a -> request1 & request2
    // /a/{} -> request1
    // /a/3/c -> request1
    const pathname = ["a", "1"];
    const representor = new Representor();
    const request1 = createContent({ test: 1 });
    const request2 = createContent({ test: false });
    representor.upsert(
      createHarEntry({ url: `${href}/a/1`, request: request1 }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/2`, request: request1 }),
    );
    representor.upsert(createHarEntry({ url: `${href}/a`, request: request2 }));
    representor.upsert(createHarEntry({ url: `${href}/a`, request: request1 }));
    representor.upsert(
      createHarEntry({ url: `${href}/a/3/c`, request: request1 }),
    );
    const insertedNode =
      representor.rest.data[host]!.childrenStatic["a"]!.childrenDynamic[0]!;
    automaticParameterisation({
      pathname,
      insertedNode,
      rootNode: representor.rest.data[host]!,
      method,
      mimeType,
      statusCode,
    });
    const node = representor.rest.data[host]!;
    const lvl1 = node.childrenStatic["a"]!;
    expect(
      lvl1.data?.methods["post"]!.request!["application/json"]?.body,
    ).toEqual({
      properties: {
        test: {
          type: ["boolean", "integer"],
        },
      },
      required: ["test"],
      type: "object",
    });
    const lvl2dynamic = lvl1.childrenDynamic[0]!;
    expect(lvl2dynamic.childrenDynamic).toHaveLength(0);
    expect(Object.keys(lvl2dynamic.childrenStatic)).toHaveLength(0);
    expect(lvl2dynamic.parent).not.toBeNull();
    expect(lvl2dynamic.key).toBe("{a}");
    expect(lvl2dynamic.data).not.toBeNull();
    const lvl2static = lvl1.childrenStatic["3"]!;
    expect(lvl2static.data).toBeNull();
    expect(lvl2static.key).toBe("3");
  });

  it("does not collapse collection resource names into a path parameter", () => {
    const representor = new Representor();
    const response = createContent({ data: [] });
    representor.upsert(
      createHarEntry({ url: `${href}/api/v2/clients`, response }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/api/v2/orders`, response }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/v2/clients",
      "/api/v2/orders",
    ]);
  });

  it("does not merge same-depth routes outside the proposed parameterised path", () => {
    const representor = new Representor();
    const response = createContent({ id: 1, name: "example" });
    representor.upsert(
      createHarEntry({ url: `${href}/api/v2/clients/109401`, response }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/api/v2/orders/43685`, response }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/api/v2/clients/125877`, response }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/v2/clients/{client}",
      "/api/v2/orders/43685",
    ]);
  });

  it("does not merge non-equivalent same-parent routes into a folded ID path", () => {
    const representor = new Representor();
    const clientResponse = createContent({ id: 1, name: "Example" });
    const searchResponse = createContent({ results: [] });
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/clients/109401`,
        response: clientResponse,
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/clients/search`,
        response: searchResponse,
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/clients/125877`,
        response: clientResponse,
      }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/v2/clients/search",
      "/api/v2/clients/{client}",
    ]);
  });

  it("folds strong ID paths with compatible response shapes", () => {
    const representor = new Representor();
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/orders/46068`,
        response: createContent({
          id: 46068,
          status: "ready",
          provider: { id: 1, name: "Provider" },
          extra: null,
        }),
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/orders/49212`,
        response: createContent({
          id: 49212,
          status: false,
          provider: { id: 1, name: "Provider", logo: "logo.png" },
          extra: { id: 7, title: "Additional" },
        }),
      }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual(["/api/v2/orders/{order}"]);
  });

  it("folds strong ID paths when observed URLs include query strings", () => {
    const representor = new Representor();
    const response = createContent({ id: 1, name: "Example" });
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/orders/46068?include=details`,
        response,
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/orders/49212?include=details`,
        response,
      }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual(["/api/v2/orders/{order}"]);
  });

  it("routes later ID examples with sparse optional branches into an existing dynamic path", () => {
    const representor = new Representor();
    const actionMaster = Object.fromEntries(
      Array.from({ length: 15 }, (_, index) => [
        `field_${index}`,
        `value_${index}`,
      ]),
    );
    const tariffOptionType = Object.fromEntries(
      Array.from({ length: 18 }, (_, index) => [
        `option_${index}`,
        `value_${index}`,
      ]),
    );
    const tariffResponse = {
      title: "Tariff",
      price: 100,
      is_active: true,
      provider: { id: 1, title: "Provider", website: "https://example.com" },
    };

    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/tariffs-proxy/3124278`,
        response: createContent({
          ...tariffResponse,
          id: 3124278,
          action_master: null,
          tariff_options: [
            {
              id: 1,
              value: "enabled",
              tariff_option_type: tariffOptionType,
            },
          ],
        }),
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/tariffs-proxy/3865176`,
        response: createContent({
          ...tariffResponse,
          id: 3865176,
          action_master: null,
          tariff_options: [
            {
              id: 2,
              value: "disabled",
              tariff_option_type: tariffOptionType,
            },
          ],
        }),
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/tariffs-proxy/3986544`,
        response: createContent({
          ...tariffResponse,
          id: 3986544,
          action_master: actionMaster,
          tariff_options: [],
        }),
      }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/v2/tariffs-proxy/{tariffs-proxy}",
    ]);
  });

  it("does not treat a tiny sparse strong ID shape as compatible with a richer shape", () => {
    const representor = new Representor();
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/orders/46068`,
        response: createContent({ id: 46068 }),
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/orders/49212`,
        response: createContent({
          id: 49212,
          status: "ready",
          provider: { id: 1, name: "Provider" },
        }),
      }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/v2/orders/46068",
      "/api/v2/orders/49212",
    ]);
  });

  it("can disable compatible shape matching", () => {
    const representor = new Representor({
      parameterisation: { compatibleShape: false },
    });
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/orders/46068`,
        response: createContent({ id: 46068, status: "ready" }),
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/orders/49212`,
        response: createContent({ id: 49212, status: false }),
      }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/v2/orders/46068",
      "/api/v2/orders/49212",
    ]);
  });

  it("can disable strong ID folding", () => {
    const representor = new Representor({
      parameterisation: { foldStrongIds: false },
    });
    const response = createContent({ id: 1, status: "ready" });
    representor.upsert(
      createHarEntry({ url: `${href}/api/v2/orders/46068`, response }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/api/v2/orders/49212`, response }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/v2/orders/46068",
      "/api/v2/orders/49212",
    ]);
  });

  it("can disable text folding", () => {
    const representor = new Representor({
      parameterisation: { foldText: false },
    });
    const response = createContent({ id: 1, title: "Example" });
    for (const slug of ["alpha", "beta", "gamma", "delta"]) {
      representor.upsert(
        createHarEntry({ url: `${href}/api/page/${slug}`, response }),
      );
    }

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/page/alpha",
      "/api/page/beta",
      "/api/page/delta",
      "/api/page/gamma",
    ]);
  });

  it("can disable automatic folding", () => {
    const representor = new Representor({
      parameterisation: { enabled: false },
    });
    const response = createContent({ id: 1, status: "ready" });
    representor.upsert(
      createHarEntry({ url: `${href}/api/v2/orders/46068`, response }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/api/v2/orders/49212`, response }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/api/v2/orders/46068",
      "/api/v2/orders/49212",
    ]);
  });

  it("preserves parent endpoint data when child leaves are folded", () => {
    const representor = new Representor();
    const parentResponse = createContent({ total: 2 });
    const childResponse = createContent({ id: 1, name: "Example" });
    representor.upsert(
      createHarEntry({ url: `${href}/a`, response: parentResponse }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/1`, response: childResponse }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/2`, response: childResponse }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual(["/a", "/a/{a}"]);
    expect(paths["/a"]?.post?.responses?.["200"]?.content?.[mimeType]).toEqual(
      expect.objectContaining({
        example: { total: 2 },
      }),
    );
  });

  it("does not overwrite an existing folded ID path with an incompatible ID cluster", () => {
    const representor = new Representor();
    const clientResponse = createContent({ id: 1, name: "Example" });
    const billingResponse = createContent({ id: 1, total: 100 });
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/clients/109401`,
        response: clientResponse,
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/clients/125877`,
        response: clientResponse,
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/clients/126364`,
        response: billingResponse,
      }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/api/v2/clients/126365`,
        response: billingResponse,
      }),
    );

    const clientsNode =
      representor.rest.data[host]!.childrenStatic["api"]!.childrenStatic["v2"]!
        .childrenStatic["clients"]!;
    expect(clientsNode.childrenDynamic).toHaveLength(1);
    expect(Object.keys(clientsNode.childrenStatic).sort()).toEqual([
      "126364",
      "126365",
    ]);
    const dynamicResponseBody =
      clientsNode.childrenDynamic[0]!.data?.methods[method]?.response?.[
        "200"
      ]?.[mimeType]?.body;
    expect(dynamicResponseBody?.properties?.["name"]?.type).toBe("string");
    expect(dynamicResponseBody?.properties?.["total"]).toBeUndefined();
  });

  it("does not collapse command names into a path parameter", () => {
    const representor = new Representor();
    const response = createContent({ ok: true });
    representor.upsert(
      createHarEntry({ url: `${href}/command/core/get-preference`, response }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/command/core/set-preference`, response }),
    );

    const paths = representor.rest.generate().getSpec().paths || {};
    expect(Object.keys(paths).sort()).toEqual([
      "/command/core/get-preference",
      "/command/core/set-preference",
    ]);
  });
});
