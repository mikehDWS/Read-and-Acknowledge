import type { Metadata } from "next";
import Link from "next/link";
import { MIN_SETUP_CODE_LENGTH, setupCodeConfigured, setupComplete } from "@/lib/setup";
import SetupForm from "./SetupForm";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  if (await setupComplete()) {
    return (
      <div className="card narrow">
        <h1>Setup is done</h1>
        <p>An admin account already exists. Admins add everyone else from the People page.</p>
        <p>
          <Link href="/login">Sign in</Link>
        </p>
      </div>
    );
  }

  if (!setupCodeConfigured()) {
    return (
      <div className="card narrow">
        <h1>Set up Read and Acknowledge</h1>
        <p>
          To create the first admin, add an environment variable called <code>SETUP_CODE</code> in your hosting
          settings. Make it a phrase of at least {MIN_SETUP_CODE_LENGTH} characters that only you know.
        </p>
        <p>Then redeploy the app and come back to this page.</p>
      </div>
    );
  }

  return (
    <div className="card narrow">
      <h1>Create the first admin</h1>
      <p className="lead">This page works once. After that, admins add everyone else from the People page.</p>
      <SetupForm />
    </div>
  );
}
