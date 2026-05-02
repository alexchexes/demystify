import { describe, it, expect } from "vitest";
import { Validator } from "@seriousme/openapi-schema-validator";
import { generateOai31 } from "./generate-oai31.js";
import { OpenApiBuilder } from "openapi3-ts/oas31";
import { HostToNode } from "../types/index.js";
import { Representor } from "../representor.js";
import { createContent, createHarEntry } from "../__helpers__/index.js";

const validateSpec = (builder: OpenApiBuilder) =>
  new Validator().validate(builder.getSpec());

const getApiKeySecurityKey = (
  builder: OpenApiBuilder,
  name: string,
  location: "cookie" | "header",
) => {
  const securitySchemes = builder.rootDoc.components?.securitySchemes || {};
  return Object.keys(securitySchemes).find((key) => {
    const scheme = securitySchemes[key]!;
    return (
      "type" in scheme &&
      scheme.type === "apiKey" &&
      "name" in scheme &&
      scheme.name === name &&
      "in" in scheme &&
      scheme.in === location
    );
  });
};

describe("generateOai31", () => {
  const host = "api.example.com";
  const href = `https://${host}`;

  it("should create an OpenAPI builder with correct metadata", async () => {
    const representor = new Representor();
    const response1 = createContent({ test: 1 });
    representor.upsert(
      createHarEntry({
        url: `${href}/a/1`,
        response: response1,
        queryString: [{ name: "query", value: "1" }],
        cookies: [{ name: "token", value: "2" }],
      }),
    );
    representor.upsert(
      createHarEntry({ url: `${href}/a/2`, response: response1 }),
    );
    representor.upsert(
      createHarEntry({
        url: `${href}/a/3`,
        response: response1,
        queryString: [{ name: "b", value: "2" }],
      }),
    );
    const hostToNode: HostToNode = {
      [host]: representor.rest.data[host]!,
    };
    const result = generateOai31(hostToNode);
    const tokenSecurityKey = getApiKeySecurityKey(result, "token", "cookie");

    expect(await validateSpec(result)).toEqual({ valid: true });
    expect(result).toBeInstanceOf(OpenApiBuilder);
    expect(result.rootDoc.openapi).toBe("3.1.0");
    expect(result.rootDoc.info.title).toBe("OpenAPI Specification");
    expect(result.rootDoc.info.description).toContain("example.com");
    expect(result.rootDoc.servers).toHaveLength(1);
    expect(result.rootDoc.paths!["/a/{a}"]).toEqual({
      post: {
        summary: "/a/{a}",
        description: "**host**: https://api.example.com",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    test: {
                      type: "integer",
                    },
                  },
                  required: ["test"],
                },
                example: {
                  test: 1,
                },
              },
            },
            description: "",
            headers: {},
          },
        },
        parameters: [
          {
            name: "a",
            in: "path",
            example: "3",
            required: true,
            schema: {
              type: "string",
            },
          },
          {
            name: "query",
            in: "query",
            example: "1",
            required: true,
            schema: {
              type: "string",
            },
          },
          {
            name: "b",
            in: "query",
            example: "2",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        security: [
          {
            [tokenSecurityKey!]: [],
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  test: {
                    type: "string",
                  },
                },
                required: ["test"],
              },
              example: {
                test: "integer",
              },
            },
          },
        },
      },
    });
    expect(result.rootDoc.components?.securitySchemes).toEqual({
      [tokenSecurityKey!]: {
        type: "apiKey",
        in: "cookie",
        name: "token",
      },
    });
  });

  it("represents auth headers as operation security", async () => {
    const representor = new Representor();
    const entry = createHarEntry({
      response: createContent({ ok: true }),
      url: `${href}/csrf`,
    });
    entry.request.headers.push({ name: "X-CSRFToken", value: "abc" });
    representor.upsert(entry);

    const result = representor.rest.generate();
    const csrfSecurityKey = getApiKeySecurityKey(
      result,
      "X-CSRFToken",
      "header",
    );

    expect(result.rootDoc.components?.securitySchemes).toEqual({
      [csrfSecurityKey!]: {
        type: "apiKey",
        in: "header",
        name: "X-CSRFToken",
      },
    });
    expect(result.rootDoc.paths?.["/csrf"]?.post?.security).toEqual([
      {
        [csrfSecurityKey!]: [],
      },
    ]);
    expect(result.rootDoc.paths?.["/csrf"]?.post?.parameters).toBeUndefined();
    expect(await validateSpec(result)).toEqual({ valid: true });
  });

  it("represents authorization headers as bearer and header alternatives", async () => {
    const representor = new Representor();
    const entry = createHarEntry({
      response: createContent({ ok: true }),
      url: `${href}/bearer`,
    });
    entry.request.headers.push({
      name: "Authorization",
      value: "Bearer token",
    });
    representor.upsert(entry);

    const result = representor.rest.generate();
    const authorizationSecurityKey = getApiKeySecurityKey(
      result,
      "Authorization",
      "header",
    );

    expect(result.rootDoc.components?.securitySchemes).toEqual({
      bearer: {
        type: "http",
        scheme: "bearer",
      },
      [authorizationSecurityKey!]: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
      },
    });
    expect(result.rootDoc.paths?.["/bearer"]?.post?.security).toEqual([
      {
        bearer: [],
      },
      {
        [authorizationSecurityKey!]: [],
      },
    ]);
    expect(await validateSpec(result)).toEqual({ valid: true });
  });

  it("uses distinct security keys when sanitised credential names collide", async () => {
    const representor = new Representor();
    const entry = createHarEntry({
      cookies: [
        { name: "access+token", value: "one" },
        { name: "access_token", value: "two" },
      ],
      response: createContent({ ok: true }),
      url: `${href}/collision`,
    });
    entry.request.headers.push(
      { name: "X-Api+Key", value: "one" },
      { name: "X-Api_Key", value: "two" },
    );
    representor.upsert(entry);

    const result = representor.rest.generate();
    const keys = [
      getApiKeySecurityKey(result, "X-Api+Key", "header"),
      getApiKeySecurityKey(result, "X-Api_Key", "header"),
      getApiKeySecurityKey(result, "access+token", "cookie"),
      getApiKeySecurityKey(result, "access_token", "cookie"),
    ];

    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(4);
    expect(
      result.rootDoc.paths?.["/collision"]?.post?.security?.map(
        (requirement) => Object.keys(requirement)[0],
      ),
    ).toEqual(keys);
    expect(await validateSpec(result)).toEqual({ valid: true });
  });
});
