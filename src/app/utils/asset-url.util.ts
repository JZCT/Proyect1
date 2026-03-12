declare global {
  interface Window {
    CECAPTA_ASSET_BASE_URL?: string;
    CECAPTA_EMBED_MODE?: string;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

export function resolveAppAssetUrl(assetPath: string): string {
  const normalizedPath = assetPath.replace(/^\/+/, '');
  const configuredBase = typeof window !== 'undefined'
    ? String(window.CECAPTA_ASSET_BASE_URL || '').trim()
    : '';

  const baseUrl = configuredBase
    ? normalizeBaseUrl(configuredBase)
    : (typeof document !== 'undefined' ? document.baseURI : '/');

  return new URL(normalizedPath, baseUrl).toString();
}

