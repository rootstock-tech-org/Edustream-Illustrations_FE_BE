// Suggest keywords for a topic by pulling its news from Google News and taking
// the most frequent meaningful words from the headlines. The user then keeps or
// removes these on the Keywords step.
import { fetchGoogleNews } from "./googleNews";
import { regionOpts } from "./regions";
import nlp from "compromise";

export type SuggestedKeyword = { word: string; count: number };

// Common words we never want as keywords.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "nor", "so", "yet", "of", "to", "in", "on", "at",
  "by", "with", "from", "as", "is", "are", "was", "were", "be", "been", "being", "it", "its", "this",
  "that", "these", "those", "he", "she", "they", "them", "his", "her", "their", "we", "you", "your",
  "our", "us", "i", "my", "me", "will", "would", "can", "could", "should", "may", "might", "has",
  "have", "had", "do", "does", "did", "not", "no", "up", "out", "off", "over", "into", "about",
  "after", "before", "how", "what", "when", "where", "why", "who", "which", "than", "then", "now",
  "new", "get", "gets", "got", "say", "says", "said", "one", "two", "more", "most", "some", "all",
  "just", "also", "here", "there", "amid", "vs", "via", "per", "top", "best", "first", "last",
  "day", "days", "week", "year", "years", "time", "news", "report", "update", "latest",
  "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  // generic verbs / adjectives that are not useful as keywords
  "former", "back", "bring", "brings", "against", "claim", "claims", "ahead", "still", "even",
  "big", "huge", "set", "put", "take", "takes", "taken", "make", "makes", "made", "give", "given",
  "keep", "hold", "call", "calls", "come", "comes", "came", "want", "wants", "need", "needs",
  "look", "looks", "into", "out", "own", "only", "much", "many", "next", "amid", "ever", "every",
  "another", "around", "again", "less", "long", "high", "low", "early", "late", "full", "real",
  "will", "ers", "sept",
  // months (rarely useful as keywords)
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  // generic nouns
  "man", "men", "woman", "women", "people", "thing", "things", "way", "ways", "part",
  "lot", "kind", "guy", "guys", "someone", "something", "everyone",
]);

// topic -> suggested keywords, most frequent first.
export async function suggestKeywords(topic: string, region?: string, limit = 15): Promise<SuggestedKeyword[]> {
  const items = await fetchGoogleNews(topic, regionOpts(region));
  const topicWords = new Set(topic.toLowerCase().split(/\s+/).filter(Boolean));

  const counts = new Map<string, number>();
  for (const it of items) {
    // Keep only nouns and names (real keywords). compromise drops verbs,
    // adjectives, prepositions etc. automatically, for any topic.
    const nounSpans = nlp(it.headline).match("#Noun").not("#Pronoun").out("array") as string[];
    for (const span of nounSpans) {
      const words = span.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
      for (const w of words) {
        if (STOPWORDS.has(w) || topicWords.has(w)) continue;
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .filter(([, c]) => c >= 2) // needs to appear at least twice to be a real theme
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}
