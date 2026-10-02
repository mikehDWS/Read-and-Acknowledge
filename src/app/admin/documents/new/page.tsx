import type { Metadata } from "next";
import Link from "next/link";
import { listOutstations } from "@/lib/outstations";
import { requireAdmin } from "@/lib/session";
import { DocumentForm } from "../../components";

export const metadata: Metadata = { title: "New document" };

export default async function NewDocumentPage() {
  await requireAdmin("/admin/documents/new");
  const outstations = await listOutstations();
  return (
    <>
      <p>
        <Link href="/admin">← Documents</Link>
      </p>
      <h1>New document</h1>
      <p className="lead">
        Record the document by name, and choose which outstations need to acknowledge it. Readers read it
        wherever it&apos;s held today.
      </p>
      <div className="card">
        <DocumentForm outstations={outstations} />
      </div>
    </>
  );
}
