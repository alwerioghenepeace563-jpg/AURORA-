export interface AuroraApiUrlOptions {
  baseUrl?: string;
  isNative?: boolean;
  legacyOrigin?: string;
}
export function resolveAuroraApiUrl(path: string, options?: AuroraApiUrlOptions): string;
