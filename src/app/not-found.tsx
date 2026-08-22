import Link from "next/link";
import { Header } from "../components/Header";

// On-brand 404 (e.g. an old /topic/* link) that sends the reader back to the feed.
export default function NotFound() {
  return (
    <>
      <Header />
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
        <p className="text-5xl font-black text-[var(--text)]">404</p>
        <p className="mt-3 text-[var(--muted)]">This page doesn&rsquo;t exist.</p>
        <Link
          href="/"
          className="mt-6 rounded-full bg-[var(--text)] px-5 py-2 text-sm font-semibold text-white"
        >
          Back to VLSI News
        </Link>
      </div>
    </>
  );
}
