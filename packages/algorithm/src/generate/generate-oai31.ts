import {
  OpenApiBuilder,
  OperationObject,
  PathItemObject,
} from "openapi3-ts/oas31";
import { HostToNode } from "../types/index.js";
import { yieldEndpoints } from "./yield-endpoints.js";
import {
  createCookieParameterObjects,
  createPathParameterObjects,
  createQueryParameterObjects,
  createRequestBodyObject,
  createResponsesObject,
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
  const headerCombos: { [s: string]: string[] } = {};
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
      const pathParameterObjects = createPathParameterObjects(pathname, data.mostRecentPathname.split('/'));
      const fullPathname = `/${pathname.slice(1).join("/")}`;
      for (const method of Object.keys(data.methods)) {
        const requestHeaders = data.methods[method]?.requestHeaders || [] as string[];
        const reqAuthName = requestHeaders.join("");
        if (reqAuthName) {
          headerCombos[reqAuthName] = requestHeaders;
        }

        const endpointMethod = data.methods[method]!;
        const queryParameterObjects = createQueryParameterObjects(
          endpointMethod.queryParameters
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
        const cookieParameterObjects = createCookieParameterObjects(endpointMethod.cookies);
        const allParameterObjects = [
          ...pathParameterObjects,
          ...queryParameterObjects,
          ...cookieParameterObjects,
        ];
        if (allParameterObjects.length) {
          operation.parameters = allParameterObjects;
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
  for (const headerNames of Object.values(headerCombos)) {
    let count = 1;
    const authNameFinal = `Header Auth ${count}`;
    for (const headerName of headerNames) {
      builder.addSecurityScheme(authNameFinal, {
        type: "apiKey",
        in: "header",
        name: headerName,
      });
    }
    count++;
  }
  return builder;
}
