import { NextRequest, NextResponse } from "next/server";
import {
  loadSettings,
  saveSettings,
  addYouTubeChannel,
  removeYouTubeChannel,
  updateYouTubeChannel,
  updateSettings,
} from "@/lib/settings/store";
import { resolveYouTubeChannel } from "@/lib/collectors/youtube-channel";

export async function GET() {
  const settings = await loadSettings();
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "add_channel") {
      const input = String(body.input ?? "").trim();
      if (!input) {
        return NextResponse.json({ error: "チャンネルURLまたはIDを入力してください" }, { status: 400 });
      }
      const resolved = await resolveYouTubeChannel(input);
      if (!resolved) {
        return NextResponse.json(
          { error: "チャンネルを解決できません。YOUTUBE_API_KEYを確認してください" },
          { status: 400 }
        );
      }
      const settings = await addYouTubeChannel(resolved);
      return NextResponse.json(settings);
    }

    if (action === "remove_channel") {
      const settings = await removeYouTubeChannel(String(body.id));
      return NextResponse.json(settings);
    }

    if (action === "toggle_channel") {
      const settings = await updateYouTubeChannel(String(body.id), {
        enabled: Boolean(body.enabled),
      });
      return NextResponse.json(settings);
    }

    if (action === "resolve_channel") {
      const resolved = await resolveYouTubeChannel(String(body.input ?? ""));
      if (!resolved) {
        return NextResponse.json({ error: "チャンネルが見つかりません" }, { status: 404 });
      }
      return NextResponse.json(resolved);
    }

    if (action === "update_settings") {
      const settings = await updateSettings({
        youtubeMaxAgeHours: body.youtubeMaxAgeHours,
        youtubeSearchQueries: body.youtubeSearchQueries,
      });
      return NextResponse.json(settings);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const current = await loadSettings();
  const settings = await saveSettings({ ...current, ...body });
  return NextResponse.json(settings);
}
