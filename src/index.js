#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { createAuthSession } from "./auth.js";
import { searchLots, fetchLotDetails, classifyQuery } from "./search.js";
import { listFavorites } from "./favorites.js";

const takeSchema = z.number().int().min(1).max(50).optional().describe("página, padrão 20, teto 50");
const skipSchema = z.number().int().min(0).optional().describe("offset, padrão 0");

export function buildTools(deps = {}) {
  const { fetchImpl, configPath, env } = deps;
  const session = createAuthSession({ fetchImpl, configPath, env });
  return [
    {
      name: "kwara_search",
      description:
        "Busca lotes na Kwara. q é texto, código de leilão (K-2551), id numérico de leilão (listing), URL /evento/... ou URL /bens/.... Id numérico de lote vai em kwara_lot.",
      schema: {
        q: z.string().describe("texto, K-xxxx, id de leilão, URL /evento ou /bens"),
        take: takeSchema,
        skip: skipSchema,
      },
      run: async ({ q, take, skip }) => searchLots({ q, take, skip, fetchImpl }),
    },
    {
      name: "kwara_lot",
      description: "Ficha de um lote. id é o id numérico do lote ou a URL /bens/{slug}.",
      schema: {
        id: z.string().describe("id do lote ou URL /bens/"),
      },
      run: async ({ id }) => {
        const classified = classifyQuery(id);
        const lotId = classified.kind === "lot" ? classified.id : id;
        const lot = await fetchLotDetails(lotId, { fetchImpl });
        return { lot };
      },
    },
    {
      name: "kwara_favorites",
      description: "Lista os favoritos da conta configurada no MCP.",
      schema: {
        take: takeSchema,
        skip: skipSchema,
        onlyActiveItems: z.boolean().optional().describe("só itens ativos, padrão true"),
      },
      run: async ({ take, skip, onlyActiveItems }) =>
        listFavorites({ take, skip, onlyActiveItems, fetchImpl, configPath, env, session }),
    },
  ];
}

export const TOOLS = buildTools();

export function createServer(deps = {}) {
  const server = new McpServer({
    name: "kwara",
    version: "1.0.0",
  });
  const tools = buildTools(deps);
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.schema, async (args) => {
      try {
        const data = await tool.run(args);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error.message }],
          isError: true,
        };
      }
    });
  }
  return server;
}

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Kwara MCP Server running on stdio");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(console.error);
}
