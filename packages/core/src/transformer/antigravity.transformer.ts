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
 * Uses Gemini CLI headers (IDE_UNSPECIFIED) for better quota distribution.
 */
export class AntigravityTransformer implements Transformer {
  name = "antigravity";
  endPoint = "/v1internal\\::modelAndAction";

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider
  ): Promise<Record<string, any>> {
    const geminiBody = buildRequestBody(request);
    const projectId = await getAntigravityProjectId();

    const stripped = request.model.replace(/^antigravity-/, "");
    const { apiModel, thinkingLevel } = resolveApiModel(stripped);

    if (thinkingLevel && geminiBody.generationConfig) {
      geminiBody.generationConfig.thinkingConfig = {
        ...(geminiBody.generationConfig.thinkingConfig || {}),
        thinkingLevel,
      };
    }

    const action = request.stream
      ? "streamGenerateContent?alt=sse"
      : "generateContent";
    const baseUrl = provider.baseUrl.replace(/\/$/, "");

    return {
      body: {
        model: apiModel,
        userAgent: "antigravity",
        requestType: "agent",
        project: projectId,
        requestId: randomUUID(),
        request: {
          ...geminiBody,
          sessionId: randomBytes(16).toString("hex"),
        },
      },
      config: {
        url: new URL(`${baseUrl}/v1internal:${action}`),
        headers: {
          Accept: request.stream ? "text/event-stream" : "application/json",
          "User-Agent": "google-api-nodejs-client/10.3.0",
          "X-Goog-Api-Client": "gl-node/22.17.0",
          "Client-Metadata":
            "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
        },
      },
    };
  }

  transformRequestOut = transformRequestOut;

  async transformResponseOut(response: Response): Promise<Response> {
    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("application/json")) {
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

    if (!response.body) {
      return response;
    }

    // Streaming: unwrap each SSE line's { response: {...} } wrapper
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
                controller.enqueue(encoder.encode(unwrapSSELine(buffer)));
              }
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const processed = unwrapSSELine(line);
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

    return transformResponseOut(
      new Response(unwrappedStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
      this.name,
      this.logger
    );
  }
}

/**
 * Resolve model name for the Cloud Code API.
 * Gemini 3 models: strip tier suffix (-high/-low/-medium/-minimal) and add -preview.
 */
function resolveApiModel(model: string): {
  apiModel: string;
  thinkingLevel?: string;
} {
  if (!model.toLowerCase().startsWith("gemini-3")) {
    return { apiModel: model };
  }

  const tierMatch = model.match(/-(minimal|low|medium|high)$/i);
  const thinkingLevel = tierMatch?.[1]?.toLowerCase();
  const baseName = thinkingLevel
    ? model.replace(/-(minimal|low|medium|high)$/i, "")
    : model;
  const apiModel = baseName.endsWith("-preview")
    ? baseName
    : `${baseName}-preview`;

  return { apiModel, thinkingLevel };
}

/** Unwrap an Antigravity SSE data line: { response: {...} } → {...} */
function unwrapSSELine(line: string): string {
  if (!line.startsWith("data: ")) {
    return line;
  }
  const jsonStr = line.slice(6).trim();
  if (!jsonStr) {
    return line;
  }
  try {
    const parsed = JSON.parse(jsonStr);
    return `data: ${JSON.stringify(parsed.response || parsed)}`;
  } catch {
    return line;
  }
}
