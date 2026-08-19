import { Header } from "../../components/Header";
import { SavedList } from "../../components/SavedList";

export const metadata = { title: "My Collection · AVSAR" };

export default function SavedPage() {
  return (
    <>
      <Header />
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 mt-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Collection</h1>
          <p className="text-sm text-slate-500">Stories you saved to read later, kept on this device.</p>
        </div>
        <SavedList />
      </div>
    </>
  );
}
