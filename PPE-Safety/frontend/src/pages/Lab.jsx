import Factory from "@lab/pages/Factory.jsx";

/**
 * The AI Safety Lab.
 *
 * A simulated factory floor, watched by a simulated camera, judged by the
 * real product's rules and thresholds — somewhere to learn what the
 * monitoring pages elsewhere in this dashboard are actually doing, and to
 * try things that would be reckless to try on a real floor: walk somebody
 * into a restricted zone, take a helmet off, cut the lighting until the
 * camera can no longer see.
 *
 * The simulation itself is the standalone lab's, imported rather than
 * copied, so there is exactly one implementation of the pipeline and one
 * set of tests covering it.
 *
 * `lab-scope` carries the lab's own token names for this subtree only —
 * `.panel`, `.inset`, `.machine` and the rest are generic enough that an
 * unscoped copy would be a trap for whoever adds a `.panel` to the dashboard
 * next. The values are this dashboard's light ones, so the page reads as one
 * of its own rather than as a different application; the floor inside keeps
 * its own surface tokens, because concrete is a picture of a place rather
 * than a piece of chrome. See `src/lab.css`.
 */
export default function Lab() {
  return (
    <div className="lab-scope min-h-full">
      <header className="px-4 pt-4 sm:px-6">
        <h1 className="text-lg font-semibold text-ink">AI Safety Lab</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-dim">
          A simulated floor running the real detection pipeline — the picture
          check, the model's confidence, the safety rules, the sightings an
          accusation needs before it is raised, and the decision that follows.
          Nothing here touches a camera or the event history: break whatever
          you like.
        </p>
      </header>
      <Factory />
    </div>
  );
}
