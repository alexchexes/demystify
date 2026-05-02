import { negate } from "lodash";
import { IrNode } from "../types/index.js";
import {
  isNodeDynamic,
  matchDynamicChildren,
} from "../utils/dynamic-children-helpers.js";
import { parameterise } from "./parameterise.js";
import { findAllMatches } from "./find-matches.js";
import { isNodeDataEquivalent } from "./node-data-equivalence.js";
import { isPartDynamic } from "./operations.js";
import {
  PathParameterisationOptions,
  resolvePathParameterisationOptions,
} from "./parameterisation-options.js";
import { isStrongPathParameterValue } from "./path-parameter-values.js";

const TEXT_PARAMETER_MIN_OCCURRENCES = 4;

/**
 * Does a node or any of its parents have dynamic parts?
 * Defined as a key that is a path parameter
 * Meaning, enclosed in {} - /example/{id}
 */
const hasDynamicParts = (node: IrNode): boolean => {
  if (!node.parent) return false;
  if (isNodeDynamic(node)) return true;
  return hasDynamicParts(node.parent);
};

const hasPartInCommonAtSamePosition = (p1: string[], p2: string[]): boolean => {
  return p1.some((part, idx) => part === p2[idx]);
};

const getDifferingPartIndexes = (p1: string[], p2: string[]): number[] => {
  const result: number[] = [];
  for (let i = 0; i < p1.length; i++) {
    if (p1[i] !== p2[i]) {
      result.push(i);
    }
  }
  return result;
};

type ParameterisationCandidate = {
  newPathname: string[];
  strong: boolean;
};

const getParameterisationCandidate = (
  pathname: string[],
  matchPathname: string[],
): ParameterisationCandidate | null => {
  if (pathname.length !== matchPathname.length) return null;
  if (!hasPartInCommonAtSamePosition(pathname, matchPathname)) return null;

  const differingPartIndexes = getDifferingPartIndexes(pathname, matchPathname);
  if (!differingPartIndexes.length) return null;

  return {
    newPathname: getParameterisedPathname(pathname, matchPathname),
    strong: differingPartIndexes.every(
      (idx) =>
        isStrongPathParameterValue(pathname[idx]!) &&
        isStrongPathParameterValue(matchPathname[idx]!),
    ),
  };
};

const getParameterisedPathname = (
  path1: string[],
  path2: string[],
): string[] => {
  const result: string[] = [];
  for (let i = 0; i < path1.length; i++) {
    if (path1[i] && path1[i] === path2[i]) {
      result.push(path1[i]!);
    } else {
      result.push(`{${path1[i]}}`);
    }
  }
  return result;
};

/**
 * A canadidate has:
 *  - same length e.g. /a/b = 2
 *  - no existing dynamic parts
 *  - exclude self
 *  - has a least one static part in common
 *  - the same data
 */

type Param = {
  // /a/b -> ["a", "b"]
  pathname: string[];
  // The node that was inserted and will be the reference point for checks
  insertedNode: IrNode;
  // The root of the IR
  rootNode: IrNode;
  // The method of the request
  method: string;
  // The response mime type
  mimeType: string;
  // The response status code
  statusCode: string;
  options?: Partial<PathParameterisationOptions>;
};

type MatchGroup = {
  matches: IrNode[];
  newPathname: string[];
  strong: boolean;
};

const getDynamicPartCount = (pathname: string[]): number =>
  pathname.filter(isPartDynamic).length;

const hasExistingDynamicTarget = (
  pathname: string[],
  rootNode: IrNode,
): boolean => {
  let currentNode = rootNode;
  let hasDynamicPart = false;

  for (const part of pathname) {
    if (isPartDynamic(part)) {
      const dynamicChild = matchDynamicChildren(
        part,
        currentNode.childrenDynamic,
      );
      if (!dynamicChild) return false;
      currentNode = dynamicChild;
      hasDynamicPart = true;
      continue;
    }

    const staticChild = currentNode.childrenStatic[part];
    if (!staticChild) return false;
    currentNode = staticChild;
  }

  return hasDynamicPart;
};

/**
 * Automatically parameterises similar paths in the OpenAPI IR tree
 * This operation is idempotent
 * @param rootNode The root node of the IR tree
 */
export const automaticParameterisation = (param: Param): void => {
  const { pathname, insertedNode, rootNode, method, mimeType, statusCode } =
    param;
  const options = resolvePathParameterisationOptions(param.options);
  if (!options.enabled) return;
  if (isNodeDynamic(insertedNode)) return;
  // Gather shape candidates first, then apply equivalence per candidate type.
  // Strong IDs and text routes deliberately use different schema thresholds.
  const matches = findAllMatches(pathname, insertedNode, rootNode, () => true);
  // Remove any matches that have path parameters
  // This means we never parameterise a path twice
  // The implementation identifies all parameters in one go
  const noDynamicParts = matches.filter(negate(hasDynamicParts));
  const groups = new Map<string, MatchGroup>();
  for (const match of noDynamicParts) {
    if (
      match.data?.mostRecentPathname === insertedNode.data?.mostRecentPathname
    ) {
      continue;
    }

    const candidate = getParameterisationCandidate(
      pathname,
      match.data?.mostRecentPathname.split("/").slice(1) || [],
    );
    if (!candidate) {
      continue;
    }

    if (candidate.strong && !options.foldStrongIds) {
      continue;
    }
    if (!candidate.strong && !options.foldText) {
      continue;
    }
    if (
      !insertedNode.data ||
      !match.data ||
      !isNodeDataEquivalent(insertedNode.data, match.data, {
        compatibleShape: options.compatibleShape,
        mediaType: mimeType,
        method,
        mode: candidate.strong ? "strong-id" : "text",
        statusCode,
      })
    ) {
      continue;
    }

    // Group by the exact target template. This prevents a matching sibling from
    // pulling in unrelated same-depth paths when only one cluster justified it.
    const key = candidate.newPathname.join("\0");
    const group = groups.get(key);
    if (group) {
      group.matches.push(match);
      group.strong &&= candidate.strong;
    } else {
      groups.set(key, {
        matches: [match],
        newPathname: candidate.newPathname,
        strong: candidate.strong,
      });
    }
  }

  const qualifyingGroups = Array.from(groups.values())
    .filter(
      (group) =>
        // One dynamic child per parent means a second incompatible cluster at the
        // same template would overwrite the first. Keep that cluster static.
        !hasExistingDynamicTarget(group.newPathname, rootNode) &&
        (group.strong ||
          group.matches.length + 1 >= TEXT_PARAMETER_MIN_OCCURRENCES),
    )
    .sort((a, b) => {
      if (a.strong !== b.strong) return a.strong ? -1 : 1;
      if (a.matches.length !== b.matches.length) {
        return b.matches.length - a.matches.length;
      }
      return (
        getDynamicPartCount(a.newPathname) - getDynamicPartCount(b.newPathname)
      );
    });

  const group = qualifyingGroups[0];
  if (group) {
    parameterise(group.newPathname, insertedNode, rootNode, [
      insertedNode,
      ...group.matches,
    ]);
  }
};
