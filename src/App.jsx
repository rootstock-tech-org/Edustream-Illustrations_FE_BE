/**
 * App.jsx
 * -------
 * The shell: a persistent module selector on top and the active module's
 * full-screen tool below. Each tool is an independent interactive experience.
 */
import { useState } from 'react';
import ModuleSelector from './components/ModuleSelector';
import { MODULES, getModule } from './data/modules';
import { getTool, ComingSoonTool } from './tools/registry';

// Deep-link support so the game world (or any host) can open one module directly:
//   ?module=<slug>            -> start on that module
//   ?module=<slug>&embed=1    -> that module only, full-screen, no top selector
function readInitial() {
  if (typeof window === 'undefined') return { slug: MODULES[0].slug, embed: false };
  const p = new URLSearchParams(window.location.search);
  const slug = p.get('module');
  const valid = slug && MODULES.some((m) => m.slug === slug);
  return { slug: valid ? slug : MODULES[0].slug, embed: p.has('embed') && p.get('embed') !== '0' };
}

export default function App() {
  const initial = readInitial();
  const [activeSlug, setActiveSlug] = useState(initial.slug);
  const module = getModule(activeSlug);
  const Tool = getTool(activeSlug);

  const select = (slug) => {
    setActiveSlug(slug);
    // Keep the URL shareable/deep-linkable as the user switches modules.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('module', slug);
      window.history.replaceState({}, '', url);
    }
  };

  if (initial.embed) {
    return (
      <main className="relative h-full w-full overflow-hidden">
        {Tool ? <Tool module={module} /> : <ComingSoonTool module={module} />}
      </main>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ModuleSelector activeSlug={activeSlug} onSelect={select} />
      <main className="relative flex-1 overflow-hidden">
        {Tool ? <Tool module={module} /> : <ComingSoonTool module={module} />}
      </main>
    </div>
  );
}
