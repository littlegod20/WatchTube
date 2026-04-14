/** Shared API response shapes — extend as contracts grow */
export type ApiErrorBody = {
  error: string;
  details?: unknown;
};
