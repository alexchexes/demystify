import {
  ContentObject,
  HeaderObject,
  HeadersObject,
  MediaTypeObject,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
  ResponsesObject,
  SecurityRequirementObject,
  SecuritySchemeObject,
} from "openapi3-ts/oas31";
import { Endpoint } from "./yield-endpoints.js";
import { NodeData } from "../types/index.js";
import { isPartDynamic } from "../parameterisation/operations.js";

export const shouldIncludeRequestBody = (method: string) => {
  return !new Set(["GET", "DELETE", "HEAD"]).has(method);
};

type RequestParam = Endpoint["node"]["data"]["methods"]["get"]["request"];
export const createRequestBodyObject = (request: RequestParam) => {
  if (!request) return;
  const contentObject: ContentObject = {};
  Object.entries(request).forEach(([mediaType, data]) => {
    const mediaTypeObject: MediaTypeObject = {
      schema: data.body,
      example: data.mostRecent,
    };
    contentObject[mediaType] = mediaTypeObject;
  });
  const requestBodyObject: RequestBodyObject = {
    content: contentObject,
  };
  return requestBodyObject;
};

type ResponseParam = Endpoint["node"]["data"]["methods"]["get"]["response"];
export const createResponsesObject = (
  responseObject: ResponseParam,
  headers: string[],
) => {
  // Create response headers
  const headersObject: HeadersObject = {};

  if (headers) {
    for (const header of headers) {
      const headerObj: HeaderObject = {
        required: false,
        schema: {
          type: "string",
        },
      };
      headersObject[header] = headerObj;
    }
  }

  // Initialise responses object, set response objects from status codes
  const responsesObject: ResponsesObject = {};
  Object.entries(responseObject).forEach(([statusCode, mediaTypeObj]) => {
    Object.entries(mediaTypeObj).forEach(([mediaType, data]) => {
      const contentObject: ContentObject = {};
      const mediaTypeObject: MediaTypeObject = {
        schema: data.body,
        example: data.mostRecent,
      };
      contentObject[mediaType] = mediaTypeObject;
      const responseObject: ResponseObject = {
        content: contentObject,
        description: "",
        headers: headersObject,
      };
      responsesObject[statusCode] = responseObject;
    });
  });

  return responsesObject;
};

export const createQueryParameterObjects = (
  queryParameters: NodeData["methods"]["get"]["queryParameters"],
): Array<ParameterObject> => {
  if (!queryParameters || !Object.keys(queryParameters).length) return [];
  return Object.entries(queryParameters).map(([name, example]) => {
    const parameterObject: ParameterObject = {
      name,
      in: "query",
      example,
      required: true,
      schema: {
        type: "string",
      },
    };
    return parameterObject;
  });
};

type ApiKeySecurityLocation = "cookie" | "header";

type ApiKeySecurityDefinition = {
  key: string;
  scheme: SecuritySchemeObject;
};

type AuthSecurityDefinition = ApiKeySecurityDefinition & {
  key: string;
  scheme: SecuritySchemeObject;
};

const sanitiseSecurityKeyPart = (value: string): string => {
  const sanitised = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return sanitised || "credential";
};

const FNV1A_32_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_32_PRIME = 0x01000193;

const createShortHash = (value: string): string => {
  // FNV-1a is used here only as a small deterministic hash for component keys.
  let hash = FNV1A_32_OFFSET_BASIS;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV1A_32_PRIME);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
};

const getSecurityKeyName = (
  location: ApiKeySecurityLocation,
  name: string,
): string => {
  const canonicalName = location === "header" ? name.toLowerCase() : name;
  return `apikey_${location}_${sanitiseSecurityKeyPart(name)}_${createShortHash(
    `${location}:${canonicalName}`,
  )}`;
};

const createApiKeySecurityDefinition = (
  location: ApiKeySecurityLocation,
  name: string,
): ApiKeySecurityDefinition => ({
  key: getSecurityKeyName(location, name),
  scheme: {
    type: "apiKey",
    in: location,
    name,
  },
});

const isAuthorizationHeader = (name: string): boolean =>
  name.toLowerCase() === "authorization";

const createHeaderSecurityDefinitions = (
  name: string,
): AuthSecurityDefinition[] => {
  const apiKey = createApiKeySecurityDefinition("header", name);
  if (!isAuthorizationHeader(name)) return [apiKey];
  return [
    {
      key: "bearer",
      scheme: {
        type: "http",
        scheme: "bearer",
      },
    },
    apiKey,
  ];
};

export const createAuthSecurityDefinitions = (
  headers: string[] = [],
  cookies: NodeData["methods"]["get"]["cookies"],
): AuthSecurityDefinition[] => [
  ...headers.flatMap(createHeaderSecurityDefinitions),
  ...Object.keys(cookies || {}).map((name) =>
    createApiKeySecurityDefinition("cookie", name),
  ),
];

export const createSecurityRequirementObjects = (
  definitions: AuthSecurityDefinition[],
): SecurityRequirementObject[] | undefined => {
  if (!definitions.length) return undefined;
  // HAR only proves which credentials were present, not which one is required.
  // Keep each scheme as an alternative so generated clients can try them.
  return definitions.map(
    ({ key }) =>
      ({
        [key]: [],
      }) as SecurityRequirementObject,
  );
};

/**
 * A path may be parameterised, such as /a/b/{}/d
 * In which case, pathnames such as /a/b/<anything>/d will match
 * So there are two pathnames, the one that may be parameterised,
 *  and an actual pathname of a recent request
 *  that matched the parameterised name
 */
export const createPathParameterObjects = (
  parameterisedPathname: string[],
  actualPathname: string[],
): Array<ParameterObject> => {
  const parameters: ParameterObject[] = [];
  const minLen = Math.min(parameterisedPathname.length, actualPathname.length);
  for (let i = 0; i < minLen; i++) {
    const paramName = parameterisedPathname[i]!;
    const actualName = actualPathname[i]!;
    if (isPartDynamic(paramName)) {
      parameters.push({
        name: paramName.replace(/[{}]/g, ""),
        in: "path",
        schema: {
          type: "string",
        },
        // Important to keep it required for compatability with Scalar's API client
        required: true,
        example: actualName,
      });
    }
  }
  return parameters;
};
