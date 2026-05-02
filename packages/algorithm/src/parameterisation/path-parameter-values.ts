const isVersionLike = (part: string): boolean =>
  /^(v|version|api[-_]?v|rest_v)\d+([._-]\d+)*$/i.test(part);

export const isStrongPathParameterValue = (part: string): boolean => {
  if (isVersionLike(part)) return false;
  if (/^\d+$/.test(part)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      part,
    )
  ) {
    return true;
  }
  if (/^[0-9a-f]{12,}$/i.test(part)) return true;
  return /^(?=.*\d)[A-Za-z0-9]{8,}$/.test(part);
};
