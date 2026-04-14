import { HttpError } from "../middleware/errorHandler.js";

export function routeParamString(value: string | string[] | undefined, label = "id"): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) throw new HttpError(400, `Missing ${label}`);
  return raw;
}
