import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isUuid } from "@/lib/validation";

/** The signature image for one acknowledgement. Admins only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = await queryOne<{ signature_png: Buffer | null }>(
    "SELECT signature_png FROM acknowledgements WHERE id = $1",
    [id],
  );
  if (!row?.signature_png) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(row.signature_png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
