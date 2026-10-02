import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/request";
import { getCurrentUser } from "@/lib/session";
import { setupComplete } from "@/lib/setup";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next, "");
  const user = await getCurrentUser();
  if (user) redirect(nextPath || (user.role === "admin" ? "/admin" : "/my"));
  const needsSetup = !(await setupComplete());

  return (
    <div className="card narrow">
      <h1>Sign in</h1>
      <p className="lead">
        {nextPath.startsWith("/sign/")
          ? "Sign in to acknowledge this document."
          : "Sign in to see the documents you need to acknowledge."}
      </p>
      {needsSetup && (
        <p className="notice warn">
          No admin account exists yet. <Link href="/setup">Set up the first admin</Link>.
        </p>
      )}
      <LoginForm next={nextPath} />
      <p className="hint" style={{ marginTop: 20 }}>
        First time here, or forgotten your password? Ask your admin for a set-password link.
      </p>
    </div>
  );
}
