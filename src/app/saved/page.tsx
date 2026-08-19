import Link from "next/link";
import { Header } from "../../components/Header";
import { SavedList } from "../../components/SavedList";

export const metadata = { title: "My Collection · AVSAR" };

export default function SavedPage() {
  return (
    <>
      <Header />
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 mt-8">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            <span aria-hidden>←</span> Back to news
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Collection</h1>
          <p className="text-sm text-slate-500">Stories you saved to read later, all in one place.</p>
        </div>
        <SavedList />
      </div>
    </>
  );
}
