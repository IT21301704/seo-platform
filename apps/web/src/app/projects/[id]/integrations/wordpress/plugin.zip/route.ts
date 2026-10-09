import { pluginZip } from "@/lib/plugin-zip";
import { requireProject, requireUser } from "@/lib/session";

/** The WordPress companion plugin as an uploadable ZIP. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { db } = await requireUser();
  await requireProject(db, id);
  const zip = pluginZip();
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="seo-platform.zip"',
      "content-length": String(zip.length),
    },
  });
}
