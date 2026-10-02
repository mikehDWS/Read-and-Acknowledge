import type { Metadata } from "next";
import Link from "next/link";
import { listCategories, listDepartments } from "@/lib/departments";
import { requireAdmin } from "@/lib/session";
import { DocumentForm } from "../../components";

export const metadata: Metadata = { title: "New document" };

export default async function NewDocumentPage() {
  await requireAdmin("/admin/documents/new");
  const [departments, categories] = await Promise.all([listDepartments(), listCategories()]);
  return (
    <>
      <p>
        <Link href="/admin">← Documents</Link>
      </p>
      <h1>New document</h1>
      <p className="lead">
        Record the document by name, and choose which departments need to acknowledge it. Readers read it
        wherever it&apos;s held today.
      </p>
      <div className="card">
        <DocumentForm departments={departments} categories={categories} />
      </div>
    </>
  );
}
