import { randomUUID, randomBytes } from "node:crypto";
import { LLMProvider, UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";
import {
  buildRequestBody,
  transformRequestOut,
  transformResponseOut,
} from "../utils/gemini.util";
import { getAntigravityProjectId } from "@CCR/shared";

/**
 * Antigravity transformer for Google Cloud Code Assist internal API.
 *
 * Uses Gemini CLI header style by default for better quota distribution.
 * Google's Cloud Code API has separate quota buckets for different client identities:
 * - "Antigravity" headers (ideType=ANTIGRAVITY) → Antigravity quota
 * - "Gemini CLI" headers (ideType=IDE_UNSPECIFIED) → Gemini CLI quota (separate, larger)
 *
 * The Gemini CLI style uses `-preview` model suffix instead of `-high`/`-low` tier suffixes.
 * Thinking level is passed via generationConfig.thinkingConfig.thinkingLevel instead.
 *
 * Request format:
 * - URL: /v1internal:streamGenerateContent?alt=sse
 * - Body wraps standard Gemini body in { model, project, request: {...} }
 * - Required: model, project, request, userAgent, requestType, requestId, sessionId
 */
export class AntigravityTransformer implements Transformer {
  name = "antigravity";

  // This endpoint is for incoming CCR route matching (not used for outgoing requests)
  endPoint = "/v1internal\\::modelAndAction";

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider
  ): Promise<Record<string, any>> {
    const geminiBody = buildRequestBody(request);
    const projectId = await getAntigravityProjectId();

    // Strip "antigravity-" prefix and resolve model name for the API
    // Gemini CLI quota uses "-preview" suffix instead of "-high"/"-low"
    const stripped = request.model.replace(/^antigravity-/, "");
    const { apiModel, thinkingLevel } = resolveApiModel(stripped);

    // Inject thinkingLevel into generationConfig if resolved from tier suffix
    if (thinkingLevel && geminiBody.generationConfig) {
      geminiBody.generationConfig.thinkingConfig = {
        ...(geminiBody.generationConfig.thinkingConfig || {}),
        thinkingLevel,
      };
    }

    const body = {
      model: apiModel,
      userAgent: "antigravity",
      requestType: "agent",
      project: projectId,
      requestId: randomUUID(),
      request: {
        ...geminiBody,
        sessionId: randomBytes(16).toString("hex"),
      },
    };

    const action = request.stream
      ? "streamGenerateContent?alt=sse"
      : "generateContent";

    const baseUrl = provider.baseUrl.endsWith("/")
      ? provider.baseUrl.slice(0, -1)
      : provider.baseUrl;

    return {
      body,
      config: {
        url: new URL(`${baseUrl}/v1internal:${action}`),
        headers: {
          Accept: request.stream ? "text/event-stream" : "application/json",
          // Gemini CLI headers — uses separate (larger) quota bucket
          "User-Agent": "google-api-nodejs-client/10.3.0",
          "X-Goog-Api-Client": "gl-node/22.17.0",
          "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
        },
      },
    };
  }

  transformRequestOut = transformRequestOut;

  async transformResponseOut(response: Response): Promise<Response> {
    // Antigravity wraps responses in { response: {...} }
    // Unwrap before passing to standard gemini response handler
    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("application/json")) {
      // Non-streaming: unwrap { response: {...} } to standard gemini format
      const data: any = await response.json();
      const unwrapped = data.response || data;
      return transformResponseOut(
        new Response(JSON.stringify(unwrapped), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }),
        this.name,
        this.logger
      );
    }

    // Streaming: unwrap each SSE line's { response: {...} } wrapper
    if (!response.body) {
      return response;
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const unwrappedStream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              if (buffer) {
                controller.enqueue(encoder.encode(processLine(buffer)));
              }
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const processed = processLine(line);
              if (processed) {
                controller.enqueue(encoder.encode(processed + "\n"));
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    // Pass the unwrapped SSE stream to standard gemini response handler
    const unwrappedResponse = new Response(unwrappedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    return transformResponseOut(unwrappedResponse, this.name, this.logger);
  }
}

/**
 * Resolve model name for the Cloud Code API.
 *
 * Gemini 3 Pro/Flash models with tier suffixes (-high/-low/-medium) are converted
 * to -preview suffix for the Gemini CLI quota. The thinking level is extracted
 * and returned separately for injection into generationConfig.
 *
 * Examples:
 * - "gemini-3-pro-high"   → { apiModel: "gemini-3-pro-preview", thinkingLevel: "high" }
 * - "gemini-3-pro-low"    → { apiModel: "gemini-3-pro-preview", thinkingLevel: "low" }
 * - "gemini-3-pro"        → { apiModel: "gemini-3-pro-preview", thinkingLevel: undefined }
 * - "gemini-3-flash"      → { apiModel: "gemini-3-flash-preview", thinkingLevel: undefined }
 * - "gemini-3-flash-high" → { apiModel: "gemini-3-flash-preview", thinkingLevel: "high" }
 * - "gemini-2.5-pro"      → { apiModel: "gemini-2.5-pro", thinkingLevel: undefined }
 * - "claude-sonnet-4-5"   → { apiModel: "claude-sonnet-4-5", thinkingLevel: undefined }
 */
function resolveApiModel(model: string): { apiModel: string; thinkingLevel?: string } {
  // Only transform gemini-3-* models
  if (!model.toLowerCase().startsWith("gemini-3")) {
    return { apiModel: model };
  }

  // Extract thinking tier suffix if present
  const tierMatch = model.match(/-(minimal|low|medium|high)$/i);
  const thinkingLevel = tierMatch?.[1]?.toLowerCase();

  // Strip tier suffix and add -preview
  const baseName = thinkingLevel ? model.replace(/-(minimal|low|medium|high)$/i, "") : model;
  const apiModel = baseName.endsWith("-preview") ? baseName : `${baseName}-preview`;

  return { apiModel, thinkingLevel };
}

/**
 * Unwrap antigravity SSE data line: { response: {...} } → {...}
 */
function processLine(line: string): string {
  if (!line.startsWith("data: ")) {
    return line;
  }
  const jsonStr = line.slice(6).trim();
  if (!jsonStr) return line;
  try {
    const parsed = JSON.parse(jsonStr);
    const unwrapped = parsed.response || parsed;
    return `data: ${JSON.stringify(unwrapped)}`;
  } catch {
    return line;
  }
}
