export type PathParameterisationMode = "off" | "id-only" | "safe-text";

export type PathParameterisationOptions = {
  enabled: boolean;
  foldStrongIds: boolean;
  foldText: boolean;
  compatibleShape: boolean;
};

export const defaultPathParameterisationOptions: PathParameterisationOptions = {
  enabled: true,
  foldStrongIds: true,
  foldText: true,
  compatibleShape: true,
};

export const resolvePathParameterisationOptions = (
  options: Partial<PathParameterisationOptions> = {},
): PathParameterisationOptions => ({
  ...defaultPathParameterisationOptions,
  ...options,
});

export const pathParameterisationOptionsFromMode = (
  mode: PathParameterisationMode,
): PathParameterisationOptions => {
  if (mode === "off") {
    return {
      ...defaultPathParameterisationOptions,
      enabled: false,
    };
  }
  if (mode === "id-only") {
    return {
      ...defaultPathParameterisationOptions,
      foldText: false,
    };
  }
  return defaultPathParameterisationOptions;
};

export const isPathParameterisationMode = (
  mode: string,
): mode is PathParameterisationMode =>
  mode === "off" || mode === "id-only" || mode === "safe-text";
