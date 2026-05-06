import { cloneDeep } from "lodash";
import { describe, test, expect } from "vitest";
import { parameterise } from "./parameterise.js";
import { Representor } from "../representor.js";
import { createContent, createHarEntry } from "../__helpers__/index.js";
import { IrNode } from "../types/index.js";

const host = "api.example.com";
const href = `https://${host}`;
const mimeType = "application/json";
const method = "post";

describe("parameterise", () => {
  test("parameterises /{}", () => {
    const representor = new Representor();
    const request = createContent({ test: "string" });
    representor.upsert(createHarEntry({ url: `${href}/a`, request }));
    representor.upsert(createHarEntry({ url: `${href}/b`, request }));
    const parameterisePathname = ["{dynamic}"];
    const compareTo = representor.rest.data[host]!.childrenStatic["a"]!;
    parameterise(parameterisePathname, compareTo, representor.rest.data[host]!);
    const node: IrNode = representor.rest.data[host]!.childrenDynamic[0]!;
    representor.upsert(createHarEntry({ url: `${href}/b`, request }));
    // /{} should be /{param1} since there is nothing else to base on
    expect(node.key).toEqual("{param1}");
    const reqBodyTypes =
      node.data?.methods?.[method]?.request?.[mimeType]?.body?.properties?.[
        "test"
      ]?.type;
    expect(reqBodyTypes).toEqual("string");
  });

  test("parameterises /any/{}", () => {
    const representor = new Representor();
    const request1 = createContent({ test: 1 });
    const request2 = createContent({ test: false });
    representor.upsert(
      createHarEntry({ url: `${href}/a/b`, request: request1 }),
    );
    const compareTo = cloneDeep(
      representor.rest.data[host]!.childrenStatic["a"]!.childrenStatic["b"]!,
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/c`, request: request1 })
    );
    const parameterisePathname = ["a", "{dynamic}"];
    representor.upsert(
      createHarEntry({ url: `${href}/a/b/c`, request: request1 })
    );
    representor.upsert(createHarEntry({ url: `${href}/a`, request: request2 }));
    representor.upsert(createHarEntry({ url: `${href}/a`, request: request1 }));
    parameterise(parameterisePathname, compareTo, representor.rest.data[host]!);
    const node: IrNode =
      representor.rest.data[host]!.childrenStatic["a"]!.childrenDynamic[0]!;
    expect(node.key).toEqual("{a}");
    expect(node.childrenDynamic).toHaveLength(0);
    expect(Object.values(node.childrenStatic)).toHaveLength(0);
    expect(node.parent!.childrenDynamic).toHaveLength(1);
    expect(Object.values(node.parent!.childrenStatic)).toHaveLength(1);
    expect(
      node.parent?.data?.methods?.[method]?.request?.[mimeType]?.body
        ?.properties?.["test"]?.type
    ).toEqual(["boolean", "integer"]);
    const reqBodyTypes =
      node.data?.methods?.[method]?.request?.[mimeType]?.body?.properties?.[
        "test"
      ]?.type;
    expect(reqBodyTypes).toEqual("integer");
  });
});
