import { Validator } from "@seriousme/openapi-schema-validator";
import { describe, it, expect } from "vitest";
import { createHarEntry } from "./__helpers__/create-har-entry.js";
import localhost from "./__fixtures__/localhost.json" with { type: "json" };
import { Representor } from "./representor.js";
import {
  MediaTypeObject,
  OpenApiBuilder,
  RequestBodyObject,
} from "openapi3-ts/oas31";
import { createContent } from "./__helpers__/index.js";
import { IrNode } from "./types/index.js";

const validateSpec = (builder: OpenApiBuilder) =>
  new Validator().validate(builder.getSpec());

const simpleJsonA = JSON.stringify({ a: { b: 1 } });
const simpleJsonB = JSON.stringify({ a: { c: 1 } });
const expectMergeAbc: MediaTypeObject = {
  schema: {
    type: "object",
    properties: {
      a: {
        type: "object",
        properties: {
          b: {
            type: "integer",
          },
          c: {
            type: "integer",
          },
        },
      },
    },
    required: ["a"],
  },
  example: {
    a: {
      c: 1,
    },
  },
};

const url = "https://www.example.com/v1/test";
const pathname = "/v1/test";

const createRequest = (text: string) => ({
  url,
  request: {
    text,
    mimeType: "application/json",
  },
});

const createResponse = (text: string) => ({
  url,
  response: {
    text,
    mimeType: "application/json",
  },
});

describe("generation following upsert of REST HAR entries", () => {
  it("has a valid OpenAPIObject", () => {
    const representor = new Representor();
    representor.upsert(createHarEntry());
    const result = representor.rest.generate();
    if (!result) return expect(result).toBeDefined();

    expect(result.getSpec().openapi).toBe("3.1.0");
    expect(result.getSpec().info.title).toBe("OpenAPI Specification");
    expect(result.getSpec().info.version).toBe("1.0.0");
    expect(result.getSpec().info.description).toBe(
      "A specification for www.example.com",
    );
    expect(result.getSpec().paths).toBeDefined();
  });

  it("merges request data into a valid MediaTypeObject", async () => {
    const representor = new Representor();
    const request1 = createRequest(simpleJsonA);
    const request2 = createRequest(simpleJsonB);
    representor.upsert(createHarEntry(request1));
    representor.upsert(createHarEntry(request2));
    const result = representor.rest.generate();
    if (!result) return expect(result).toBeDefined();

    const requestBody = result.getSpec().paths?.[pathname]?.post
      ?.requestBody as RequestBodyObject;
    const mediaTypeObject = requestBody?.content["application/json"];
    expect(mediaTypeObject).toEqual(expectMergeAbc);
    expect(await validateSpec(result)).toEqual({ valid: true });
  });

  it("merges response data into a valid MediaTypeObject", async () => {
    const representor = new Representor();
    const response1 = createResponse(simpleJsonA);
    const response2 = createResponse(simpleJsonB);
    representor.upsert(createHarEntry(response1));
    representor.upsert(createHarEntry(response2));
    const result = representor.rest.generate();
    if (!result) return expect(result).toBeDefined();

    const mediaTypeObject =
      result.getSpec().paths?.[pathname]?.post?.responses?.["200"]?.content[
        "application/json"
      ];
    expect(mediaTypeObject).toEqual(expectMergeAbc);
    expect(await validateSpec(result)).toEqual({ valid: true });
  });

  it("includes query parameters in the spec", async () => {
    const representor = new Representor();
    const queryString = [{ name: "param1", value: "value1" }];
    const entry = createHarEntry({ queryString, url });
    representor.upsert(entry);
    const result = representor.rest.generate();
    if (!result) return expect(result).toBeDefined();

    const parameters = result.getSpec().paths?.[pathname]?.post?.parameters;
    expect(parameters?.[0]).toMatchObject({
      name: "param1",
      in: "query",
    });
    expect(await validateSpec(result)).toEqual({ valid: true });
  });
});

describe("edge cases", () => {
  it("handles cases where the har method is uppercase and lowercase", async () => {
    const representor = new Representor();
    const entry1 = createHarEntry(createResponse(simpleJsonA));
    const entry2 = createHarEntry(createResponse(simpleJsonB));
    entry1.request.method = "POST";
    entry2.request.method = "post";
    representor.upsert(entry1);
    representor.upsert(entry2);
    const result = representor.rest.generate();
    if (!result) return expect(result).toBeDefined();

    const mediaTypeObject =
      result.getSpec().paths?.[pathname]?.post?.responses?.["200"]?.content[
        "application/json"
      ];
    expect(mediaTypeObject).toEqual(expectMergeAbc);
    expect(await validateSpec(result)).toEqual({ valid: true });
  });

  it("decodes base64 in response bodies", () => {
    const representor = new Representor();
    // @ts-expect-error is valid
    expect(localhost.log.entries.every(representor.upsert)).toBe(true);
  });
});

describe("other functionality", () => {
  it("resets state", () => {
    const representor = new Representor();
    representor.upsert(createHarEntry());
    expect(representor.rest.generate().getSpec().paths).not.toEqual({});
    representor.reset();
    expect(representor.rest.generate().getSpec().paths).toEqual({});
  });

  it("returns true when it deletes a host", () => {
    const representor = new Representor();
    representor.upsert(createHarEntry());
    expect(representor.rest.data["www.example.com"]).toBeDefined();
    const deleted = representor.rest.deleteName("www.example.com");
    expect(representor.rest.data["www.example.com"]).not.toBeDefined();
    expect(deleted).toBe(true);
  });

  it("returns false when it does not delete a host", () => {
    const representor = new Representor();
    const deleted = representor.rest.deleteName("anotherhost.com");
    expect(deleted).toBe(false);
  });

  it("deserialises state from a serialised string", () => {
    const representor = new Representor();
    const entry1 = createHarEntry(createResponse(simpleJsonA));
    const entry2 = createHarEntry(createResponse(simpleJsonB));
    representor.upsert(entry1);
    representor.upsert(entry2);
    const serialised = representor.serialise();
    representor.reset();
    const wasSuccessful = representor.deserialise(serialised);
    expect(representor.rest.generate().getSpec().paths).not.toEqual({});
    expect(wasSuccessful).toBe(true);
  });

  it("when input string is invalid deserialise returns false", () => {
    const representor = new Representor();
    const wasSuccessful = representor.deserialise("invalid");
    expect(wasSuccessful).toBe(false);
  });
});

describe("upsert and automatic parameterisation integration tests", () => {
  const host = "api.example.com";
  const href = `https://${host}`;

  it("does not merge an existing non-equivalent route when folding equivalent IDs", () => {
    const representor = new Representor();
    const response1 = createContent({ test: 1 });
    const response2 = createContent({ test: false });
    representor.upsert(
      createHarEntry({ url: `${href}/a/1`, response: response1 }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/3`, response: response2 }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/2`, response: response2 }),
    );
    const node: IrNode = representor.rest.data[host]!;

    expect(
      node.childrenStatic["a"]!.childrenDynamic[0]!.data?.methods["post"]!
        .response["200"]!["application/json"]!.body?.properties,
    ).toEqual({
      test: {
        type: "boolean",
      },
    });
    expect(node.childrenDynamic).toHaveLength(0);
    expect(Object.values(node.childrenStatic)).toHaveLength(1);
    const a = node.childrenStatic["a"]!;
    expect(a.childrenDynamic).toHaveLength(1);
    expect(Object.values(a.childrenStatic)).toHaveLength(1);
    expect(
      a.childrenStatic["1"]!.data?.methods["post"]!.response["200"]![
        "application/json"
      ]!.body?.properties,
    ).toEqual({
      test: {
        type: "integer",
      },
    });
    const dynamic = a.childrenDynamic[0]!;
    expect(dynamic.childrenDynamic).toHaveLength(0);
    expect(Object.values(dynamic.childrenStatic)).toHaveLength(0);
  });

  it("given /a/{}, compatible requests match against it", () => {
    const representor = new Representor();
    const response1 = createContent({ test: 1 });
    representor.upsert(
      createHarEntry({ url: `${href}/a/1`, response: response1 }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/2`, response: response1 }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/3`, response: response1 }),
    );
    const node: IrNode = representor.rest.data[host]!;
    expect(
      node.childrenStatic["a"]!.childrenDynamic[0]!.data?.methods["post"]!
        .response["200"]!["application/json"]!.body?.properties,
    ).toEqual({
      test: {
        type: "integer",
      },
    });
    expect(node.childrenDynamic).toHaveLength(0);
    expect(Object.values(node.childrenStatic)).toHaveLength(1);
    const a = node.childrenStatic["a"]!;
    expect(a.childrenDynamic).toHaveLength(1);
    expect(Object.values(a.childrenStatic)).toHaveLength(0);
    const dynamic = a.childrenDynamic[0]!;
    expect(dynamic.childrenDynamic).toHaveLength(0);
    expect(Object.values(dynamic.childrenStatic)).toHaveLength(0);
  });

  it("given /a/{}, incompatible requests do not match against it", () => {
    const representor = new Representor();
    const response1 = createContent({ test: { value: 1 }, ok: true });
    const response2 = createContent({ test: [1], ok: true });
    representor.upsert(
      createHarEntry({ url: `${href}/a/1`, response: response1 }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/2`, response: response1 }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/3`, response: response2 }),
    );

    const a = representor.rest.data[host]!.childrenStatic["a"]!;
    expect(a.childrenDynamic).toHaveLength(1);
    expect(Object.values(a.childrenStatic)).toHaveLength(1);
    expect(a.childrenStatic["3"]!.data).not.toBeNull();
  });

  it("given /a/{}/a/{}, compatible requests match against it", () => {
    const representor = new Representor();
    const response1 = createContent({ test: 1 });
    representor.upsert(
      createHarEntry({ url: `${href}/a/1/a/1`, response: response1 }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/2/a/2`, response: response1 }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/3/a/3`, response: response1 }),
    );
    const node: IrNode = representor.rest.data[host]!;
    expect(node.childrenDynamic).toHaveLength(0);
    expect(Object.values(node.childrenStatic)).toHaveLength(1);
    const a1 = node.childrenStatic["a"]!;
    expect(a1.childrenDynamic).toHaveLength(1);
    expect(Object.values(a1.childrenStatic)).toHaveLength(0);
    const dynamic1 = a1.childrenDynamic[0]!;
    expect(dynamic1.childrenDynamic).toHaveLength(0);
    expect(Object.values(dynamic1.childrenStatic)).toHaveLength(1);
    const a2 = dynamic1.childrenStatic["a"]!;
    expect(a2.childrenDynamic).toHaveLength(1);
    expect(Object.values(a2.childrenStatic)).toHaveLength(0);
    const dynamic2 = a2.childrenDynamic[0]!;
    expect(
      dynamic2.data?.methods["post"]!.response["200"]!["application/json"]!.body
        ?.properties,
    ).toEqual({
      test: {
        type: "integer",
      },
    });
    expect(dynamic2.childrenDynamic).toHaveLength(0);
    expect(Object.values(dynamic2.childrenStatic)).toHaveLength(0);
  });

  it("should obey part-in-common heuristic, that equivalence requires at least one similar part", () => {
    const representor = new Representor();
    const response = createContent({ test: 1 });
    representor.upsert(createHarEntry({ url: `${href}/1/2`, response }));
    representor.upsert(createHarEntry({ url: `${href}/3/4`, response }));
    const node: IrNode = representor.rest.data[host]!;
    // node
    expect(node.childrenDynamic).toHaveLength(0);
    expect(Object.values(node.childrenStatic)).toHaveLength(2);
    // /1
    expect(node.childrenStatic["1"]?.childrenDynamic).toHaveLength(0);
    expect(
      Object.values(node.childrenStatic["1"]!.childrenStatic),
    ).toHaveLength(1);
    // /3
    expect(node.childrenStatic["3"]?.childrenDynamic).toHaveLength(0);
    expect(
      Object.values(node.childrenStatic["3"]!.childrenStatic),
    ).toHaveLength(1);
    // /1/2
    expect(
      Object.values(
        node.childrenStatic["1"]!.childrenStatic["2"]!.childrenStatic,
      ),
    ).toHaveLength(0);
    expect(
      node.childrenStatic["1"]?.childrenStatic["2"]?.childrenDynamic,
    ).toHaveLength(0);
    // /3/4
    expect(
      Object.values(
        node.childrenStatic["3"]!.childrenStatic["4"]!.childrenStatic,
      ),
    ).toHaveLength(0);
    expect(
      node.childrenStatic["3"]?.childrenStatic["4"]?.childrenDynamic,
    ).toHaveLength(0);
  });
});
