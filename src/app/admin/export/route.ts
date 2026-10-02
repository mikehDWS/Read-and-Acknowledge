import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isUuid, optionalDate } from "@/lib/validation";

type Row = {
  id: string;
  document_name: string;
  document_category: string | null;
  version_label: string | null;
  signer_name: string;
  signer_email: string;
  signer_outstation: string | null;
  signer_distribution_lists: string | null;
  employee_id: string | null;
  acknowledged_at: Date;
  statement_text: string;
  ip_address: string | null;
  user_agent: string | null;
  voided_at: Date | null;
  voided_by: string | null;
  void_reason: string | null;
};

const HEADER = [
  "acknowledgement_id",
  "document",
  "category",
  "version",
  "name",
  "email",
  "outstation",
  "distribution_lists",
  "employee_id",
  "acknowledged_at_utc",
  "statement",
  "ip_address",
  "user_agent",
  "status",
  "voided_at_utc",
  "voided_by",
  "void_reason",
];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const documentId = params.get("document") ?? "";
  const from = optionalDate(params.get("from") ?? "");
  const to = optionalDate(params.get("to") ?? "");
  const outstation = params.get("outstation")?.trim().slice(0, 200) || null;
  const list = params.get("list")?.trim().slice(0, 200) || null;
  const category = params.get("category")?.trim().slice(0, 200) || null;
  if ((documentId && !isUuid(documentId)) || from === undefined || to === undefined) {
    return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  }

  // Dates are whole UTC days; "to" is inclusive.
  const rows = await query<Row>(
    `SELECT a.id, a.document_name, a.document_category, a.version_label, a.signer_name, a.signer_email, a.signer_outstation, a.signer_distribution_lists, u.employee_id,
            a.acknowledged_at, a.statement_text, a.ip_address, a.user_agent,
            a.voided_at, v.email AS voided_by, a.void_reason
       FROM acknowledgements a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN users v ON v.id = a.voided_by
      WHERE ($1::uuid IS NULL OR a.document_id = $1::uuid)
        AND ($2::date IS NULL OR a.acknowledged_at >= $2::date)
        AND ($3::date IS NULL OR a.acknowledged_at < $3::date + 1)
        AND ($4::text IS NULL OR lower(a.signer_outstation) = lower($4))
        AND ($5::text IS NULL OR lower($5) = ANY (string_to_array(lower(a.signer_distribution_lists), ', ')))
        AND ($6::text IS NULL OR lower(a.document_category) = lower($6))
      ORDER BY a.acknowledged_at`,
    [documentId || null, from, to, outstation, list, category],
  );

  const csv = toCsv(
    HEADER,
    rows.map((r) => [
      r.id,
      r.document_name,
      r.document_category,
      r.version_label,
      r.signer_name,
      r.signer_email,
      r.signer_outstation,
      r.signer_distribution_lists,
      r.employee_id,
      r.acknowledged_at,
      r.statement_text,
      r.ip_address,
      r.user_agent,
      r.voided_at ? "voided" : "valid",
      r.voided_at,
      r.voided_by,
      r.void_reason,
    ]),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `acknowledgements-${stamp}.csv`;
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
