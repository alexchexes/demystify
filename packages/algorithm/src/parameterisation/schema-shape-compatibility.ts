import { Schema } from "genson-js";

type ShapeKind = "array" | "object" | "scalar" | "unknown";

type ShapeMode = "established" | "strong-id" | "text";

type ShapeScore = {
  compatibleCommon: number;
  conflicts: number;
  largerCoverage: number;
  smallerCoverage: number;
  smallerSize: number;
};

const COMMON_COLLECTION_KEYS = new Set([
  "count",
  "next",
  "previous",
  "results",
]);

const getSchemaTypes = (schema: Schema | undefined): string[] => {
  const type = schema?.type;
  if (!type) {
    if (schema?.properties) return ["object"];
    if (schema?.items) return ["array"];
    return [];
  }
  return Array.isArray(type) ? type : [type];
};

const getShapeKind = (schema: Schema | undefined): ShapeKind => {
  const nonNullTypes = getSchemaTypes(schema).filter((type) => type !== "null");
  if (!nonNullTypes.length) return "unknown";
  if (nonNullTypes.includes("object")) return "object";
  if (nonNullTypes.includes("array")) return "array";
  return "scalar";
};

const areKindsCompatible = (left: ShapeKind, right: ShapeKind): boolean => {
  if (left === "unknown" || right === "unknown") return true;
  if (left === right) return true;
  // Scalar values are intentionally grouped together. Captured examples often
  // disagree on string/number/boolean while still describing one route.
  return left === "scalar" && right === "scalar";
};

type ShapePath = {
  kind: ShapeKind;
  sparse: boolean;
};

const isSparseContainer = (schema: Schema | undefined): boolean => {
  // These shapes tell us the branch exists, but not what is inside it.
  const kind = getShapeKind(schema);
  if (kind === "unknown") return true;
  if (kind === "object") return !Object.keys(schema?.properties || {}).length;
  if (kind === "array") return !schema?.items;
  return false;
};

const getParentPath = (path: string): string | null => {
  if (path === "$") return null;
  if (path.endsWith("[]")) {
    const parent = path.slice(0, -2);
    return parent === "$" ? null : parent;
  }
  const lastDotIndex = path.lastIndexOf(".");
  if (lastDotIndex <= 0) return null;
  return path.slice(0, lastDotIndex);
};

// Sparse/null ancestors mean "not observed inside this branch", not "missing".
// Their descendants should not reduce coverage on the sparse side.
const hasSparseAncestor = (
  paths: Map<string, ShapePath>,
  path: string,
): boolean => {
  let parentPath = getParentPath(path);
  while (parentPath) {
    if (paths.get(parentPath)?.sparse) return true;
    parentPath = getParentPath(parentPath);
  }
  return false;
};

const isKnownKind = (kind: ShapeKind): boolean => kind !== "unknown";

// Null/unknown is not positive evidence for a field's shape.
const isCommonPathNeutral = (left: ShapePath, right: ShapePath): boolean =>
  !isKnownKind(left.kind) || !isKnownKind(right.kind);

// Flatten nested schemas to structural locations so optional populated branches
// can be compared against sparse/null examples without requiring exact equality.
const collectShapePaths = (
  schema: Schema | undefined,
  prefix = "$",
  paths = new Map<string, ShapePath>(),
): Map<string, ShapePath> => {
  if (!schema) return paths;

  for (const [key, value] of Object.entries(schema.properties || {})) {
    const path = `${prefix}.${key}`;
    paths.set(path, {
      kind: getShapeKind(value),
      sparse: isSparseContainer(value),
    });
    collectShapePaths(value, path, paths);
  }

  if (schema.items) {
    const path = `${prefix}[]`;
    paths.set(path, {
      kind: getShapeKind(schema.items),
      sparse: isSparseContainer(schema.items),
    });
    collectShapePaths(schema.items, path, paths);
  }

  return paths;
};

const getShapeScore = (left: Schema, right: Schema): ShapeScore => {
  const leftPaths = collectShapePaths(left);
  const rightPaths = collectShapePaths(right);
  const leftKeys = new Set(leftPaths.keys());
  const rightKeys = new Set(rightPaths.keys());
  let leftComparable = 0;
  let rightComparable = 0;
  let compatibleCommon = 0;
  let conflicts = 0;

  for (const key of leftKeys) {
    const leftPath = leftPaths.get(key)!;
    const rightPath = rightPaths.get(key);
    if (!rightPath) {
      if (!hasSparseAncestor(rightPaths, key)) leftComparable++;
      continue;
    }

    if (isCommonPathNeutral(leftPath, rightPath)) {
      continue;
    }

    leftComparable++;
    rightComparable++;
    if (areKindsCompatible(leftPath.kind, rightPath.kind)) {
      compatibleCommon++;
    } else {
      conflicts++;
    }
  }

  for (const key of rightKeys) {
    if (leftKeys.has(key)) continue;
    if (!hasSparseAncestor(leftPaths, key)) rightComparable++;
  }

  const smallerSize = Math.min(leftComparable, rightComparable);
  const largerSize = Math.max(leftComparable, rightComparable);

  return {
    compatibleCommon,
    conflicts,
    largerCoverage: largerSize ? compatibleCommon / largerSize : 1,
    smallerCoverage: smallerSize ? compatibleCommon / smallerSize : 1,
    smallerSize,
  };
};

const hasCompatibleRootKind = (left: Schema, right: Schema): boolean =>
  areKindsCompatible(getShapeKind(left), getShapeKind(right));

const isSparseGenericCollection = (schema: Schema): boolean => {
  if (getShapeKind(schema) !== "object") return false;
  const properties = schema.properties || {};
  const keys = Object.keys(properties);
  if (!keys.length || !keys.every((key) => COMMON_COLLECTION_KEYS.has(key))) {
    return false;
  }
  const results = properties["results"];
  return Boolean(
    results && getShapeKind(results) === "array" && !results.items,
  );
};

const isStrongIdShapeCompatible = (score: ShapeScore): boolean => {
  if (score.compatibleCommon === 0) return false;
  if (score.smallerSize < 8) {
    // ID-looking path values are strong route evidence, but avoid the degenerate
    // one-field subset case where `{ id }` would match nearly every object.
    return (
      score.compatibleCommon >= 2 &&
      score.smallerCoverage >= 0.9 &&
      (score.largerCoverage >= 0.6 || score.compatibleCommon >= 4)
    );
  }
  return score.smallerCoverage >= 0.9 && score.largerCoverage >= 0.6;
};

const isTextShapeCompatible = (
  left: Schema,
  right: Schema,
  score: ShapeScore,
): boolean => {
  // Empty collection wrappers repeat across unrelated resources such as clients,
  // orders, and leads, so they are not enough evidence for textual routes.
  if (isSparseGenericCollection(left) && isSparseGenericCollection(right)) {
    return false;
  }
  if (score.smallerSize < 2) return false;
  if (score.smallerSize < 8) {
    if (score.smallerCoverage === 1 && score.largerCoverage === 1) {
      return true;
    }
    return (
      score.compatibleCommon >= 3 &&
      score.smallerCoverage >= 0.9 &&
      score.largerCoverage >= 0.6
    );
  }
  return score.smallerCoverage >= 0.9 && score.largerCoverage >= 0.8;
};

const isEstablishedShapeCompatible = (score: ShapeScore): boolean => {
  if (score.compatibleCommon === 0) return false;
  if (score.smallerSize < 8) {
    return score.smallerCoverage >= 0.9 && score.largerCoverage >= 0.8;
  }
  return score.smallerCoverage >= 0.9 && score.largerCoverage >= 0.6;
};

export const areSchemasShapeCompatible = (
  left: Schema,
  right: Schema,
  mode: ShapeMode,
): boolean => {
  if (!hasCompatibleRootKind(left, right)) return false;
  const score = getShapeScore(left, right);

  // Observed object/array/scalar kind conflicts are hard stops. Sparse/null
  // branches are made neutral before this point, so remaining conflicts are real.
  if (score.conflicts > 0) {
    return false;
  }

  if (mode === "strong-id") {
    return isStrongIdShapeCompatible(score);
  }
  if (mode === "text") {
    return isTextShapeCompatible(left, right, score);
  }
  return isEstablishedShapeCompatible(score);
};
