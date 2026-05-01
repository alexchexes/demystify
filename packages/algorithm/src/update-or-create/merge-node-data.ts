import { mergeSchemas } from "genson-js";
import { NodeData } from "../types/index.js";

type Data = NodeData["methods"]["get"];
type Req = NonNullable<NodeData["methods"]["get"]["request"]>;
type Res = NodeData["methods"]["get"]["response"];
type Cookies = NodeData["methods"]["get"]["cookies"];

const mergeCookies = (
  dest: NonNullable<Cookies>,
  src: NonNullable<Cookies>,
) => ({
  ...dest,
  ...src,
});

const mergeRequest = (dest: Data, src: Req = {}) => {
  Object.entries(src).forEach(([mediaType, srcData]) => {
    // Nothing in dest or src to merge
    if (!srcData || !srcData.body) return;
    dest["request"] ??= {};
    // Nothing in dest to merge, but src has data
    if (!dest["request"][mediaType]?.body) {
      dest["request"][mediaType] = srcData;
      return;
    }
    // Merge schemas
    dest["request"][mediaType].body = mergeSchemas([
      dest["request"][mediaType].body,
      srcData.body,
    ]);
    dest["request"][mediaType].mostRecent = srcData.mostRecent;
  });
};

const mergeResponse = (dest: Data, src: Res = {}) => {
  Object.entries(src).forEach(([statusCode, srcMediaTypeObj]) => {
    // statusCode in src does not exist in dest
    if (!dest["response"]?.[statusCode]) {
      dest["response"][statusCode] = srcMediaTypeObj;
      return;
    }
    // statusCode exists in both dest and src
    Object.entries(srcMediaTypeObj).forEach(([mediaType, mediaTypeData]) => {
      const srcData = srcMediaTypeObj[mediaType]!;
      if (!dest["response"]?.[statusCode]?.[mediaType]) {
        // dest does not contain mediaType, set from src
        dest["response"][statusCode]![mediaType] = srcData;
        return;
      } else {
        // update or create schemas
        const selector = dest["response"][statusCode]![mediaType]!;
        if (!selector.body) {
          selector.body = srcData.body;
        } else if (srcData.body) {
          selector.body = mergeSchemas([selector.body, srcData.body]);
        }
        selector.mostRecent = mediaTypeData.mostRecent;
      }
    });
  });
};

export const mergeNodeData = (dest: NodeData, src: NodeData): NodeData => {
  dest.protocol = src.protocol;
  dest.mostRecentPathname = src.mostRecentPathname;
  for (const [method, methodObj] of Object.entries(src.methods)) {
    // Method doesn't exist in dest, set src and continue to next method
    if (!dest.methods[method]) {
      dest.methods[method] = methodObj;
      continue;
    }

    const srcSchema = src.methods[method]!;
    const destSchema = dest.methods[method]!;
    // Merge cookies
    if (src.methods[method]?.cookies) {
      if (!dest.methods[method]?.cookies) {
        dest.methods[method].cookies = src.methods[method].cookies;
      } else {
        dest.methods[method].cookies = mergeCookies(
          dest.methods[method].cookies,
          src.methods[method].cookies,
        );
      }
    }
    // Merge request
    if (destSchema.request || srcSchema.request) {
      mergeRequest(destSchema, srcSchema.request);
    }
    // Merge query params
    if (destSchema.queryParameters || srcSchema.queryParameters) {
      destSchema.queryParameters = {
        ...destSchema.queryParameters,
        ...srcSchema.queryParameters,
      };
    }
    // Merge request headers
    if (destSchema.requestHeaders || srcSchema.requestHeaders) {
      const destReqHeaders = destSchema.requestHeaders || [];
      const srcReqHeaders = srcSchema.requestHeaders || [];
      destSchema.requestHeaders = Array.from(
        new Set([...destReqHeaders, ...srcReqHeaders]),
      );
    }
    // Merge response headers
    if (destSchema.responseHeaders || srcSchema.responseHeaders) {
      const destResHeaders = destSchema.responseHeaders || [];
      const srcResHeaders = srcSchema.responseHeaders || [];
      destSchema.responseHeaders = Array.from(
        new Set([...destResHeaders, ...srcResHeaders]),
      );
    }
    // Merge responses
    mergeResponse(destSchema, methodObj.response);
  }
  return dest;
};
