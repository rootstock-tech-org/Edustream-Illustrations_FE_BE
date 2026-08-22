import { getPapers } from "../../../lib/getPapers";
import { CATEGORY_VIEWS } from "../../../lib/categories";
import { Header } from "../../components/Header";
import { PaperCard } from "../../components/PaperCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Research Papers · AVSAR" };

export default function PapersPage() {
  const { papers, generatedAt } = getPapers();

  // Group by module, preserving the curriculum order; top papers before latest.
  const byModule = CATEGORY_VIEWS.map((cat) => {
    const items = papers.filter((p) => p.moduleId === cat.id);
    const top = items.filter((p) => p.kind === "top");
    const latest = items.filter((p) => p.kind === "latest");
    return { cat, items: [...top, ...latest] };
  }).filter((g) => g.items.length > 0);

  return (
    <>
      <Header />
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-2 mt-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Research Papers</h1>
          <p className="text-sm text-[var(--muted)]">
            Curated VLSI and semiconductor papers from arXiv, grouped by course module.
            {generatedAt ? ` Updated ${new Date(generatedAt).toLocaleDateString()}.` : ""}
          </p>
        </div>

        {byModule.length === 0 ? (
          <p className="mt-6 border border-dashed border-[var(--border-strong)] bg-[var(--panel)] p-10 text-center text-[var(--muted)]">
            No papers yet. Run the papers build to populate this page.
          </p>
        ) : (
          byModule.map(({ cat, items }) => (
            <section key={cat.id} id={`m-${cat.id}`} className="scroll-mt-24 border-t border-[var(--border)] py-7">
              <div className="mb-4 flex items-center gap-3">
                <span className="h-6 w-1.5 rounded-full" style={{ background: cat.accent }} />
                <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">{cat.label}</h2>
                <span className="text-xs font-medium text-[var(--muted)]">{items.length} papers</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((p) => (
                  <PaperCard key={p.id} paper={p} accent={cat.accent} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
