import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { DocumentForm } from "../../components";

export const metadata: Metadata = { title: "New document" };

export default async function NewDocumentPage() {
  await requireAdmin("/admin/documents/new");
  return (
    <>
      <p>
        <Link href="/admin">← Documents</Link>
      </p>
      <h1>New document</h1>
      <p className="lead">
        Record the document by name. Readers read it wherever it&apos;s held today; you&apos;ll add the people who
        need to sign it next.
      </p>
      <div className="card">
        <DocumentForm />
      </div>
    </>
  );
}
