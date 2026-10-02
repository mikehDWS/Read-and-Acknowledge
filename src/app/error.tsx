"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card narrow">
      <h1>Something went wrong</h1>
      <p>Try again in a moment. If this keeps happening, ask your admin to check that the app&apos;s database is connected.</p>
      <div className="actions">
        <button type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
