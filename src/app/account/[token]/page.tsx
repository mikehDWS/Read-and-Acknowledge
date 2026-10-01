import type { Metadata } from "next";
import { findLiveAccountLink } from "@/lib/account-links";
import { isWellFormedToken } from "@/lib/tokens";
import SetPasswordForm from "./SetPasswordForm";

export const metadata: Metadata = { title: "Set your password" };

export default async function AccountLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = isWellFormedToken(token) ? await findLiveAccountLink(token) : null;

  if (!link) {
    return (
      <div className="card narrow">
        <h1>This link can't be used</h1>
        <p>It has expired or has already been used. Ask your admin for a new set-password link.</p>
      </div>
    );
  }

  return (
    <div className="card narrow">
      <h1>{link.purpose === "setup" ? "Set up your account" : "Reset your password"}</h1>
      <p className="lead">
        {link.name} ({link.email})
      </p>
      <SetPasswordForm token={token} email={link.email} />
    </div>
  );
}
