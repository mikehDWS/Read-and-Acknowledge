import type { Metadata } from "next";
import Link from "next/link";
import { managedDepartments } from "@/lib/departments";
import { getCurrentUser } from "@/lib/session";
import { signOut } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Read and Acknowledge", template: "%s · Read and Acknowledge" },
  description: "Confirm you have read and understood your organisation's documents.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const isManager = user ? (await managedDepartments(user.id)).length > 0 : false;
  return (
    <html lang="en-GB">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              Read and Acknowledge
            </Link>
            {user && (
              <nav aria-label="Main">
                <Link href="/my">My documents</Link>
                {isManager && <Link href="/team">My team</Link>}
                {user.role === "admin" && (
                  <>
                    <Link href="/admin">Documents</Link>
                    <Link href="/admin/people">People</Link>
                    <Link href="/admin/reminders">Reminders</Link>
                  </>
                )}
                <span className="who" title={user.email}>
                  {user.name}
                </span>
                <form action={signOut}>
                  <button type="submit" className="link-button">
                    Sign out
                  </button>
                </form>
              </nav>
            )}
          </div>
        </header>
        <main id="main" className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
