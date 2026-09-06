import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";

import { answer, tips } from "../floor/tutor.js";

/**
 * AI Tutor — reads the floor and answers from it.
 *
 * It sits behind a button in the corner rather than taking a column of the
 * page. Held open, it was a permanent third of a row spent on a thing most
 * viewers are not asking anything of at that moment, and its answers are
 * about whatever is happening on the floor — so the floor is what should
 * have the room, and the tutor should be one click away when the floor
 * raises a question.
 *
 * Tips update with the frame; questions are answered from the engine's own
 * explanations, in the page, with nothing sent anywhere.
 */
export default function Tutor({ ctx }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const scroller = useRef(null);
  const input = useRef(null);
  const live = tips(ctx);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, open]);

  // Opened by a click, so the caret belongs in the box — asking is the only
  // reason to open it.
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Escape closes it, the way it closes every other transient surface.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const ask = (event) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    const reply = answer(question, ctx);
    setMessages((current) => [...current, { role: "user", text: question }, { role: "tutor", text: reply }]);
    setDraft("");
  };

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="AI Tutor"
          className="panel fixed bottom-24 right-5 z-50 flex max-h-[70vh] w-[min(24rem,calc(100vw-2.5rem))] flex-col p-4 shadow-2xl"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-vision-dim text-vision">
              <MessageSquare size={15} />
            </span>
            <h2 className="text-sm font-semibold text-ink">AI Tutor</h2>
            <span className="ml-auto text-[10px] text-ink-faint">answers from this floor</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the tutor"
              className="rounded-lg p-1 text-ink-faint hover:bg-inset hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>

          <div ref={scroller} className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-xs leading-relaxed">
            <ul className="space-y-1.5">
              {live.map((tip, index) => (
                <li key={index} className="flex gap-2 text-ink">
                  <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vision" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
            {messages.map((message, index) => (
              <div
                key={index}
                className={`whitespace-pre-line rounded-lg px-2.5 py-1.5 ${
                  message.role === "user" ? "ml-6 bg-vision-dim text-ink" : "mr-6 bg-inset text-ink-dim"
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>

          <form onSubmit={ask} className="mt-3 flex items-center gap-2">
            <input
              ref={input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask a question..."
              aria-label="Ask the tutor"
              className="min-w-0 flex-1 rounded-lg border border-line bg-inset px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-vision focus:outline-none"
            />
            <button type="submit" aria-label="Send" className="rounded-lg bg-vision p-2 text-white hover:opacity-90">
              <Send size={14} />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "Close the AI Tutor" : "Ask the AI Tutor"}
        title={open ? "Close the AI Tutor" : "Ask the AI Tutor"}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-vision text-white shadow-lg transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-vision focus-visible:ring-offset-2"
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>
    </>
  );
}
