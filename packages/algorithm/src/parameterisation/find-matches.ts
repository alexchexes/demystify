import { IrNode } from "../types/ir-graph.js";
import { areNodesEquivalent } from "./node-data-equivalence.js";
import {
  matchDynamicChildren
} from "../utils/dynamic-children-helpers.js";
import { isPartDynamic } from "./operations.js";

/**
 * Find all matching nodes in the IR tree for a given pathname
 * Matches meet the following criteria:
 *  - same length e.g. /a/b = 2
 *  - by comparator
 * The default comparator looks for equivalent request and response
 * schema for 2xx status codes of an endpoint
 *
 * When () => true, all nodes of the same level are returned,
 * regardless of their data
 */
export const findAllMatches = (
  pathname: string[],
  insertedNode: IrNode,
  rootNode: IrNode,
  comparator: (a: IrNode, b: IrNode) => boolean = areNodesEquivalent,
): IrNode[] => {
  return dfs(pathname, insertedNode, rootNode, comparator);
};

/**
 * Find nodes that match the static/dynamic shape of a pathname.
 * Static parts match the same static child or an existing dynamic child, while
 * dynamic parts match any child at that level. This is used when applying a
 * known parameterised path.
 */
export const findPathMatches = (
  pathname: string[],
  insertedNode: IrNode,
  rootNode: IrNode,
  comparator: (a: IrNode, b: IrNode) => boolean = areNodesEquivalent,
): IrNode[] => {
  return dfsPath(pathname, insertedNode, rootNode, comparator);
};

const dfs = (
  pathname: string[],
  insertedNode: IrNode,
  currentNode: IrNode,
  comparator: (a: IrNode, b: IrNode) => boolean,
  results: IrNode[] = [],
): IrNode[] => {
  if (pathname.length === 0) {
    return results;
  }
  const part = pathname[0]!;
  const isLast = pathname.length === 1;
  const childDynamic = matchDynamicChildren(part, currentNode.childrenDynamic);
  if (isLast) {
    const staticChildren = Object.values(currentNode.childrenStatic);
    for (const leaf of staticChildren) {
      if (comparator(insertedNode, leaf)) {
        results.push(leaf);
      }
    }
    if (childDynamic) {
      if (comparator(insertedNode, childDynamic)) {
        results.push(childDynamic);
      }
    }
    return results;
  }
  const items = Object.values(currentNode.childrenStatic);
  if (childDynamic) {
    items.push(childDynamic);
  }
  for (const value of items) {
    results.push(...dfs(
        pathname.slice(1),
        insertedNode,
        value,
        comparator,
        [],
    ));
  }
  return results;
};

const getPatternChildren = (part: string, currentNode: IrNode): IrNode[] => {
  if (isPartDynamic(part)) {
    return [
      ...Object.values(currentNode.childrenStatic),
      ...currentNode.childrenDynamic,
    ];
  }

  const children: IrNode[] = [];
  const staticChild = currentNode.childrenStatic[part];
  if (staticChild) {
    children.push(staticChild);
  }
  const dynamicChild = matchDynamicChildren(part, currentNode.childrenDynamic);
  if (dynamicChild) {
    children.push(dynamicChild);
  }
  return children;
};

const dfsPath = (
  pathname: string[],
  insertedNode: IrNode,
  currentNode: IrNode,
  comparator: (a: IrNode, b: IrNode) => boolean,
  results: IrNode[] = [],
): IrNode[] => {
  if (pathname.length === 0) {
    return results;
  }

  const part = pathname[0]!;
  const children = getPatternChildren(part, currentNode);
  const isLast = pathname.length === 1;
  if (isLast) {
    for (const leaf of children) {
      if (comparator(insertedNode, leaf)) {
        results.push(leaf);
      }
    }
    return results;
  }

  for (const value of children) {
    results.push(
      ...dfsPath(pathname.slice(1), insertedNode, value, comparator, []),
    );
  }
  return results;
};
