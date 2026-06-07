import { NextResponse } from "next/server";
import { syncScriptHistoryFromFiles } from "@/lib/external-refs/loader";

export async function POST() {
  try {
    const count = await syncScriptHistoryFromFiles();
    return NextResponse.json({ synced: count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
