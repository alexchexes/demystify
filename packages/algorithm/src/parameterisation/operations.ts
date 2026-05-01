import { IrNode } from "../types/ir-graph.js";
import {
  createDynamicChild,
  isNodeDynamic,
  matchDynamicChildren,
  removeDynamicChild,
} from "../utils/dynamic-children-helpers.js";
import { createNode } from "../utils/index.js";
import { NodeData } from "../types/index.js";

/**
 * Remove nodes by removing their key from the parent
 * Remove data from the node
 * Keep when they have data or children
 * Returns a list of every data entry in nodes that was removed
 */
export const removeNodes = (nodes: IrNode[]): Array<NodeData> => {
  const outData: Array<NodeData> = [];
  for (const node of nodes) {
    if (node.data) {
      outData.push(node.data);
      node.data = null;
    }
    removeEmptyNodes(node);
  }
  return outData;
};

const removeEmptyNodes = (node: IrNode): void => {
  const hasStaticChildren = Object.keys(node.childrenStatic).length > 0;
  const hasDynamicChildren = node.childrenDynamic.length > 0;
  const hasChildren = hasStaticChildren || hasDynamicChildren;
  if (node.data || hasChildren) {
    return;
  }
  if (node.parent) {
    if (node.parent.childrenStatic[node.key]) {
      delete node.parent.childrenStatic[node.key];
    }
    if (isNodeDynamic(node)) {
      node.parent.childrenDynamic = removeDynamicChild(
        node.key,
        node.parent.childrenDynamic,
      );
    }
    removeEmptyNodes(node.parent);
  }
};

export const isPartDynamic = (part: string) =>
  part.startsWith("{") && part.endsWith("}");

/**
 * Inserts node at position pathname into intoNode
 * Creates nodes along its path if necessary
 */
export const insertNode = (
  pathname: string[],
  node: IrNode,
  intoNode: IrNode,
): void => {
  if (pathname.length === 0) {
    return;
  }
  const part = pathname[0]!;
  const isLast = pathname.length === 1;
  if (isPartDynamic(part)) {
    const dynamicChildExists = matchDynamicChildren(
      part,
      intoNode.childrenDynamic,
    );
    if (dynamicChildExists) {
      if (isLast) {
        dynamicChildExists.data = node.data;
      }
      return insertNode(pathname.slice(1), node, dynamicChildExists);
    } else {
      const child = isLast ? node : createDynamicChild(part, intoNode);
      intoNode.childrenDynamic.push(child);
      child.parent = intoNode;
      return insertNode(pathname.slice(1), node, child);
    }
  } else {
    const staticChildExists = intoNode.childrenStatic[part];
    if (staticChildExists) {
      if (isLast) {
        staticChildExists.data = node.data;
      }
      return insertNode(pathname.slice(1), node, staticChildExists);
    } else {
      const child = isLast ? node : createNode({ key: part, parent: intoNode });
      intoNode.childrenStatic[part] = child;
      child.parent = intoNode;
      return insertNode(pathname.slice(1), node, child);
    }
  }
};
