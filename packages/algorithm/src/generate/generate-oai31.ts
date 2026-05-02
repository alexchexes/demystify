import {
  OpenApiBuilder,
  OperationObject,
  PathItemObject,
} from "openapi3-ts/oas31";
import { HostToNode } from "../types/index.js";
import { yieldEndpoints } from "./yield-endpoints.js";
import {
  createAuthSecurityDefinitions,
  createPathParameterObjects,
  createQueryParameterObjects,
  createRequestBodyObject,
  createResponsesObject,
  createSecurityRequirementObjects,
  shouldIncludeRequestBody,
} from "./generate-oai31.helpers.js";

export function generateOai31(hostToNode: HostToNode): OpenApiBuilder {
  const hosts = Object.keys(hostToNode).join(", ");
  const builder = OpenApiBuilder.create({
    openapi: "3.1.0",
    info: {
      title: "OpenAPI Specification",
      version: "1.0.0",
      description: `A specification for ${hosts}`,
    },
    paths: {},
  });
  for (const [host, rootNode] of Object.entries(hostToNode)) {
    const endpoints = Array.from(yieldEndpoints([rootNode]));
    const protocols = new Set(endpoints.map(({ node }) => node.data.protocol));
    for (const protocol of protocols) {
      builder.addServer({
        url: `${protocol}//${host}`,
        variables: {
          host: {
            default: "localhost",
            description: "The host of the server",
          },
        },
      });
    }
    for (const endpoint of endpoints) {
      const {
        node: { data },
        pathname,
      } = endpoint;
      const pathParameterObjects = createPathParameterObjects(
        pathname,
        data.mostRecentPathname.split("/"),
      );
      const fullPathname = `/${pathname.slice(1).join("/")}`;
      for (const method of Object.keys(data.methods)) {
        const endpointMethod = data.methods[method]!;
        const authSecurityDefinitions = createAuthSecurityDefinitions(
          endpointMethod.requestHeaders,
          endpointMethod.cookies,
        );
        for (const { key, scheme } of authSecurityDefinitions) {
          builder.addSecurityScheme(key, scheme);
        }
        const queryParameterObjects = createQueryParameterObjects(
          endpointMethod.queryParameters,
        );
        const requestBody = createRequestBodyObject(endpointMethod.request);
        const responses = createResponsesObject(
          endpointMethod.response,
          endpointMethod.responseHeaders || [],
        );
        const operation: OperationObject = {
          summary: fullPathname,
          description: `**host**: ${data.protocol}//${host}`,
          responses,
        };
        const allParameterObjects = [
          ...pathParameterObjects,
          ...queryParameterObjects,
        ];
        if (allParameterObjects.length) {
          operation.parameters = allParameterObjects;
        }
        const security = createSecurityRequirementObjects(
          authSecurityDefinitions,
        );
        if (security) {
          operation.security = security;
        }
        if (requestBody && shouldIncludeRequestBody(method)) {
          operation.requestBody = requestBody;
        }
        const pathItemObject: PathItemObject = {
          [method]: operation,
        };
        builder.rootDoc.paths ??= {};
        const specPath = builder.rootDoc.paths[fullPathname];
        if (specPath) {
          specPath[method as "get"] = operation;
        } else {
          builder.rootDoc.paths[fullPathname] = pathItemObject;
        }
      }
    }
  }
  return builder;
}
