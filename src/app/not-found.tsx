import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card narrow">
      <h1>Page not found</h1>
      <p>Check the link you were sent. If it still doesn&apos;t work, ask whoever shared it for a new one.</p>
      <p>
        <Link href="/">Go to the home page</Link>
      </p>
    </div>
  );
}
