// Read/write the app config.yaml.
//   GET  /api/config           -> current config
//   POST /api/config { ... }   -> merge fields into config.yaml, return new config
import { NextResponse } from "next/server";
import { readConfig, writeConfig, type AppConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readConfig());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<AppConfig>;
  const current = readConfig();
  const next: AppConfig = {
    topic: typeof body.topic === "string" ? body.topic : current.topic,
    region: typeof body.region === "string" ? body.region : current.region,
    sources: Array.isArray(body.sources) ? body.sources : current.sources,
    keywords: Array.isArray(body.keywords) ? body.keywords : current.keywords,
  };
  writeConfig(next);
  return NextResponse.json(next);
}
