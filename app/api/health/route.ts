import { checkHealth } from "@/lib/claude-cli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports whether Claude Code is installed and logged in. Spends no tokens. */
export async function GET() {
  const health = await checkHealth();
  return Response.json(health, {
    headers: { "Cache-Control": "no-store" },
  });
}
