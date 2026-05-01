import { describe, it, expect } from "vitest";
import { Validator } from "@seriousme/openapi-schema-validator";
import { generateOai31 } from "./generate-oai31.js";
import { OpenApiBuilder } from "openapi3-ts/oas31";
import { HostToNode } from "../types/index.js";
import { Representor } from "../representor.js";
import { createContent, createHarEntry } from "../__helpers__/index.js";

const validateSpec = (builder: OpenApiBuilder) =>
  new Validator().validate(builder.getSpec());

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
          {
            name: "token",
            in: "cookie",
            required: true,
            schema: {
              type: "string",
            },
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
  });
});
