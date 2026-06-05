// MCP tool loading for the chat API.
// Uses the AI SDK's experimental MCP client over SSE/HTTP transport.
import { experimental_createMCPClient } from "ai";
import { prisma } from "./prisma";

type McpClient = Awaited<ReturnType<typeof experimental_createMCPClient>>;

export interface LoadedMcp {
  tools: Record<string, unknown>;
  clients: McpClient[];
}

/**
 * Connect to all enabled MCP servers and aggregate their tools.
 * Returns the merged tool set plus the open clients (close them after streaming finishes).
 * Failures on a single server are logged and skipped — they never block the chat.
 */
export async function loadMcpTools(): Promise<LoadedMcp> {
  const servers = await prisma.mcpServer.findMany({
    where: { enabled: true },
  });

  const clients: McpClient[] = [];
  let tools: Record<string, unknown> = {};

  for (const server of servers) {
    try {
      let headers: Record<string, string> | undefined;
      if (server.headersJson) {
        try {
          headers = JSON.parse(server.headersJson);
        } catch {
          headers = undefined;
        }
      }

      const client = await experimental_createMCPClient({
        transport: {
          type: "sse",
          url: server.url,
          headers,
        },
      });

      const serverTools = await client.tools();
      tools = { ...tools, ...serverTools };
      clients.push(client);
    } catch (err) {
      console.error(`[mcp] failed to connect to "${server.name}" (${server.url}):`, err);
    }
  }

  return { tools, clients };
}

/** Close all MCP clients (call in onFinish / onError of the stream). */
export async function closeMcpClients(clients: McpClient[]): Promise<void> {
  await Promise.allSettled(clients.map((c) => c.close()));
}
