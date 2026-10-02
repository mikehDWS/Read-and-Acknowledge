import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { queryOne } from "@/lib/db";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import { addMeAsSigner } from "@/app/admin/actions";
import { requireUser } from "@/lib/session";
import { isWellFormedToken } from "@/lib/tokens";
import SignForm from "./SignForm";

export const metadata: Metadata = { title: "Acknowledge a document" };

type Doc = {
  id: string;
  name: string;
  description: string | null;
  version_label: string | null;
  category: string | null;
  due_date: string | null;
  location_url: string | null;
  status: "open" | "closed";
  is_expected: boolean;
  acknowledged_at: Date | null;
};

export default async function SignPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const { token } = await params;
  const { confirmed } = await searchParams;
  if (!isWellFormedToken(token)) notFound();
  const user = await requireUser(`/sign/${token}`);

  const doc = await queryOne<Doc>(
    `SELECT d.id, d.name, d.description, d.version_label,
            (SELECT c.name FROM document_categories c WHERE c.id = d.category_id) AS category,
            d.due_date, d.location_url, d.status,
            EXISTS (SELECT 1 FROM document_signers es WHERE es.document_id = d.id AND es.user_id = $2) AS is_expected,
            (SELECT a.acknowledged_at FROM acknowledgements a
              WHERE a.document_id = d.id AND a.user_id = $2 AND a.voided_at IS NULL) AS acknowledged_at
       FROM documents d WHERE d.link_token = $1`,
    [token, user.id],
  );
  if (!doc) notFound();

  return (
    <div className="card narrow" style={{ maxWidth: 640 }}>
      <h1>{doc.name}</h1>
      <dl className="meta">
        {doc.category && (
          <>
            <dt>Category</dt>
            <dd>{doc.category}</dd>
          </>
        )}
        {doc.version_label && (
          <>
            <dt>Version</dt>
            <dd>{doc.version_label}</dd>
          </>
        )}
        {doc.due_date && (
          <>
            <dt>Due</dt>
            <dd>
              {formatDate(doc.due_date)}
              {!doc.acknowledged_at && isOverdue(doc.due_date) && <span className="badge bad"> Overdue</span>}
            </dd>
          </>
        )}
        <dt>Signing as</dt>
        <dd>{user.name}</dd>
      </dl>
      {doc.description && <p style={{ whiteSpace: "pre-line" }}>{doc.description}</p>}
      {doc.location_url && (
        <p>
          <a href={doc.location_url} target="_blank" rel="noopener noreferrer">
            Open the document
          </a>{" "}
          <span className="hint">Opens in a new tab. Read it before you confirm.</span>
        </p>
      )}

      {doc.acknowledged_at ? (
        <div className="notice ok" role="status">
          <strong>{confirmed ? "Thank you. " : ""}You acknowledged this document on {formatDateTime(doc.acknowledged_at)}.</strong>
        </div>
      ) : !doc.is_expected && user.role === "admin" && doc.status === "open" ? (
        <form action={addMeAsSigner}>
          <p className="notice warn">You&apos;re not on this document&apos;s list yet. As an admin, you can add yourself.</p>
          <input type="hidden" name="document_id" value={doc.id} />
          <button type="submit" name="then" value="sign">
            Add me to the list
          </button>
        </form>
      ) : !doc.is_expected ? (
        <p className="notice warn">
          You&apos;re not on the list for this document. If you think you should be, contact your admin.
        </p>
      ) : doc.status === "closed" ? (
        <p className="notice warn">This document is no longer accepting acknowledgements.</p>
      ) : (
        <SignForm token={token} signerName={user.name} />
      )}

      <p style={{ marginTop: 24 }}>
        <Link href="/my">Back to my documents</Link>
      </p>
    </div>
  );
}
