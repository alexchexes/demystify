import { areSchemasEqual } from "genson-js";
import { intersection } from "lodash";
import { IrNode, NodeData } from "../types/index.js";
import { areSchemasShapeCompatible } from "./schema-shape-compatibility.js";

type NodeDataEquivalenceOptions = {
  compatibleShape?: boolean;
  mediaType?: string;
  method?: string;
  mode?: "established" | "strong-id" | "text";
  statusCode?: string;
};

const areBodiesEquivalent = (
  destBody: Parameters<typeof areSchemasEqual>[0] | undefined,
  srcBody: Parameters<typeof areSchemasEqual>[0] | undefined,
  options: NodeDataEquivalenceOptions,
): boolean => {
  if (!destBody || !srcBody) return false;
  if (options.mode === "text") {
    // Text routes are the riskiest false-positive source. Keep their safety
    // vetoes active even when compatible-shape widening is disabled, while
    // still requiring exact equality in that stricter mode.
    const textShapeSafe = areSchemasShapeCompatible(destBody, srcBody, "text");
    return options.compatibleShape
      ? textShapeSafe
      : areSchemasEqual(destBody, srcBody) && textShapeSafe;
  }
  if (areSchemasEqual(destBody, srcBody)) return true;
  return Boolean(
    options.compatibleShape &&
      areSchemasShapeCompatible(destBody, srcBody, options.mode || "text"),
  );
};

const areRequestsEquivalent = (
  destRequestBody: Parameters<typeof areSchemasEqual>[0] | undefined,
  srcRequestBody: Parameters<typeof areSchemasEqual>[0] | undefined,
): boolean => {
  if (!destRequestBody && !srcRequestBody) return true;
  if (!destRequestBody || !srcRequestBody) return false;
  return areSchemasEqual(destRequestBody, srcRequestBody);
};

export const isNodeDataEquivalent = (
  dest: NodeData,
  src: NodeData,
  options: NodeDataEquivalenceOptions = {},
): boolean => {
  const methodsIntersect = options.method
    ? intersection(
        [options.method],
        Object.keys(dest.methods),
        Object.keys(src.methods),
      )
    : intersection(Object.keys(dest.methods), Object.keys(src.methods));
  if (!methodsIntersect.length) {
    return false;
  }

  for (const method of methodsIntersect) {
    const endpointDest = dest.methods[method];
    const endpointSrc = src.methods[method];
    if (!endpointDest?.response || !endpointSrc?.response) {
      return false;
    }
    const statusCodes = options.statusCode
      ? [options.statusCode]
      : Object.keys(endpointSrc.response);
    for (const statusCode of statusCodes) {
      // Automatic folding compares the concrete observation's response slot.
      // Without this, a path could fold because of another status/media variant.
      const mediaTypes = options.mediaType
        ? [options.mediaType]
        : Object.keys(endpointSrc.response[statusCode] || []);
      for (const mediaType of mediaTypes) {
        const responseDestBody =
          endpointDest.response[statusCode]?.[mediaType]?.body;
        const responseSrcBody =
          endpointSrc.response[statusCode]?.[mediaType]?.body;

        if (!areBodiesEquivalent(responseDestBody, responseSrcBody, options)) {
          continue;
        }

        const requestDestBody = endpointDest.request?.[mediaType]?.body;
        const requestSrcBody = endpointSrc.request?.[mediaType]?.body;
        if (areRequestsEquivalent(requestDestBody, requestSrcBody)) {
          return true;
        }
      }
    }
  }

  return false;
};

export const areNodesEquivalent = (dest: IrNode, src: IrNode): boolean => {
  if (!dest.data || !src.data) {
    return false;
  }
  return isNodeDataEquivalent(dest.data, src.data);
};
