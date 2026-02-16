type OAuthFormValue = string | number | boolean | undefined | null;
type OAuthFormParams = Record<string, OAuthFormValue>;

interface PostOAuthFormOptions {
  url: string;
  params: OAuthFormParams;
  extraHeaders?: Record<string, string>;
  requestErrorPrefix: string;
  oauthErrorPrefix?: string;
  signal?: AbortSignal;
}

interface OAuthErrorPayload {
  error?: string;
  error_description?: string;
}

function formatOAuthError(prefix: string, payload: OAuthErrorPayload): string {
  const description = payload.error_description ? ` - ${payload.error_description}` : "";
  return `${prefix}: ${payload.error || "unknown"}${description}`;
}

export function buildOAuthFormParams(params: OAuthFormParams): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    form.set(key, String(value));
  }
  return form;
}

export function buildOAuthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    ...(extraHeaders || {}),
  };
}

export async function postOAuthForm<T>(
  options: PostOAuthFormOptions
): Promise<T> {
  const response = await fetch(options.url, {
    method: "POST",
    headers: buildOAuthHeaders(options.extraHeaders),
    body: buildOAuthFormParams(options.params).toString(),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${options.requestErrorPrefix}: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as T;
  const oauthError = data as OAuthErrorPayload;

  if (oauthError.error) {
    throw new Error(
      formatOAuthError(options.oauthErrorPrefix || options.requestErrorPrefix, oauthError)
    );
  }

  return data;
}
