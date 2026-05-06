import { IrNode } from "../types/index.js";
import {
  insertNode,
  removeNodes,
} from "./operations.js";
import { setPathParameterNames } from "./set-path-parameter-names.js";
import { findPathMatches } from "./find-matches.js";
import { mergeNodeData } from "../update-or-create/merge-node-data.js";
import { createNode } from "../utils/node-creation.js";

export const parameterise = (
  newPathname: string[],
  insertedNode: IrNode,
  rootNode: IrNode,
  nodesToParameterise: IrNode[] = findPathMatches(
    newPathname,
    insertedNode,
    rootNode,
    () => true,
  ),
): void => {
  // Get all matching nodes, e.g. /a/{b} matches /a/c, /a/d, /a/[...]
  // Including nodes that have different data, as they are still considered
  // to be the same node
  const removedNodeData = removeNodes(nodesToParameterise);
  if (!removedNodeData.length) return;
  const removedData = removedNodeData.reduce(mergeNodeData);
  const newNode = createNode({ data: removedData });
  if (newNode) {
    insertNode(newPathname, newNode, rootNode);
    setPathParameterNames(newNode, nodesToParameterise);
  }
};
