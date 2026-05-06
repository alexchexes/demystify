import { IrNode } from '../types/index.js';
import { pathToParts } from './path-to-parts.js';
import { createNodeData } from './create-node-data.js';
import { createNode } from '../utils/index.js';
import { ValidHar } from '../har-to-hartype/index.js';
import { mergeNodeData } from './merge-node-data.js';
import { getStaticChildMatch } from '../utils/index.js';
import { matchDynamicChildren } from '../utils/dynamic-children-helpers.js';
import { NodeData } from '../types/ir-graph-node-data.js';
import { isNodeDataEquivalent } from '../parameterisation/node-data-equivalence.js';
import { isStrongPathParameterValue } from '../parameterisation/path-parameter-values.js';
import {
  PathParameterisationOptions,
  resolvePathParameterisationOptions,
} from '../parameterisation/parameterisation-options.js';

type UpdateOrCreateNodeParams = {
  options: PathParameterisationOptions;
  node: IrNode;
  parts: string[];
  data: NodeData;
}

function updateOrCreateNode({ options, node, parts, data }: UpdateOrCreateNodeParams): IrNode {
  // Base case, no more parts to match. Update or create the node
  // If node.data is null, then it becomes the harEntry (create)
  // Otherwise, merge the harEntry into the existing data (update)
  if (parts.length === 0) {
    const src = data;
    const dest = node.data;
    if (!dest) node.data = src;
    else node.data = mergeNodeData(dest, src);
    return node;
  }
  const part = parts[0]!;
  const dynamicMatch = matchDynamicChildren(part, node.childrenDynamic);
  // Look at dynamic nodes first
  // This is important because we want to match against this first, should it exist
  // Prior to going down that path, confirm that an endpoint exists in the subgraph
  if (
    dynamicMatch &&
    canDynamicMatchPart(part, dynamicMatch) &&
    nodeHasDataForPath(dynamicMatch, parts.slice(1), data, options)
  ) {
    return updateOrCreateNode({ options, node: dynamicMatch, parts: parts.slice(1), data });
  }
  // Look for an existing match, if found, continue the search
  const staticMatch = getStaticChildMatch(part, node);
  if (staticMatch) {
    return updateOrCreateNode({ options, node: staticMatch, parts: parts.slice(1), data });
  }
  // Create a node if no match is found
  // If we get to this point, parts is non-empty and there is neither a static or dynamic match
  node.childrenStatic ??= {};
  node.childrenStatic[part] = createNode({ key: part, parent: node });
  return updateOrCreateNode({ options, node: node.childrenStatic[part], parts: parts.slice(1), data });
}

const getPathPartIndex = (node: IrNode): number => {
  if (!node.parent) return -1;
  return getPathPartIndex(node.parent) + 1;
};

const collectMostRecentPathPartsAtIndex = (
  node: IrNode,
  index: number,
): string[] => {
  const result: string[] = [];
  const current = node.data?.mostRecentPathname.split("/").slice(1)[index];
  if (current) {
    result.push(current);
  }
  for (const child of Object.values(node.childrenStatic)) {
    result.push(...collectMostRecentPathPartsAtIndex(child, index));
  }
  for (const child of node.childrenDynamic) {
    result.push(...collectMostRecentPathPartsAtIndex(child, index));
  }
  return result;
};

const canDynamicMatchPart = (part: string, dynamicNode: IrNode): boolean => {
  const examples = collectMostRecentPathPartsAtIndex(
    dynamicNode,
    getPathPartIndex(dynamicNode),
  );
  if (!examples.length) return true;
  if (examples.every(isStrongPathParameterValue)) {
    return isStrongPathParameterValue(part);
  }
  return true;
};

const nodeHasDataForPath = (
  node: IrNode,
  parts: string[],
  data: NodeData,
  options: PathParameterisationOptions,
): boolean => {
  if (parts.length === 0) {
    return Boolean(
      node.data &&
        // Existing dynamic routes can accept later compatible-shape examples,
        // but only after the dynamic route was already established.
        isNodeDataEquivalent(node.data, data, {
          compatibleShape: options.enabled && options.compatibleShape,
          mode: "established",
        }),
    );
  }
  const part = parts[0]!;
  if (node.childrenStatic && node.childrenStatic[part]) {
    if (nodeHasDataForPath(node.childrenStatic[part], parts.slice(1), data, options)) {
      return true;
    }
  }
  for (const dynamicNode of node.childrenDynamic) {
    if (
      canDynamicMatchPart(part, dynamicNode) &&
      nodeHasDataForPath(dynamicNode, parts.slice(1), data, options)
    ) {
      return true;
    }
  }
  return false;
};

type UpdateOrCreateParams = {
  data: ValidHar;
  options?: Partial<PathParameterisationOptions>;
  rootNode: IrNode | null;
};
export function updateOrCreate({
  data,
  options: inputOptions,
  rootNode,
}: UpdateOrCreateParams): { root: IrNode, inserted: IrNode } {
  const { har } = data;
  if (!rootNode) {
    const host = new URL(har.request.url).host;
    rootNode = createNode({ key: host });
  }
  const options = resolvePathParameterisationOptions(inputOptions);
  const newNode = updateOrCreateNode({
    options,
    node: rootNode,
    parts: pathToParts(har),
    data: createNodeData({ data }),
  });
  return { root: rootNode, inserted: newNode };
}
