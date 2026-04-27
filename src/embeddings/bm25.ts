import { DEFAULT_BM25_B, DEFAULT_BM25_K1 } from "../constants.js";
import type { KnowledgeGraph } from "../core/graph.js";

/**
 * Lightweight in-memory BM25 scoring engine.
 *
 * Builds an inverted index from the knowledge graph's fragments.
 * Title terms are repeated for extra weight (title boost).
 * Scores are computed on demand per query.
 */
export class BM25Engine {
  /** term → set of document paths containing it */
  private readonly invertedIndex = new Map<string, Set<string>>();
  /** path → total token count in the document */
  private readonly docLengths = new Map<string, number>();
  /** path → tokenized terms (for scoring) */
  private readonly docTerms = new Map<string, string[]>();
  private avgDocLen = 0;
  private docCount = 0;

  constructor(
    private readonly k1 = DEFAULT_BM25_K1,
    private readonly b = DEFAULT_BM25_B,
  ) {}

  /** Build the inverted index from the current graph state. */
  buildIndex(graph: KnowledgeGraph): void {
    this.invertedIndex.clear();
    this.docLengths.clear();
    this.docTerms.clear();

    let totalLen = 0;

    for (const [path, fragment] of graph.fragments) {
      // Title boost: repeat title twice for extra weight
      const text = `${fragment.title} ${fragment.title} ${fragment.tags.join(" ")} ${fragment.content}`;
      const terms = tokenize(text);

      this.docTerms.set(path, terms);
      this.docLengths.set(path, terms.length);
      totalLen += terms.length;

      for (const term of new Set(terms)) {
        let postings = this.invertedIndex.get(term);
        if (!postings) {
          postings = new Set();
          this.invertedIndex.set(term, postings);
        }
        postings.add(path);
      }
    }

    this.docCount = graph.fragments.size;
    this.avgDocLen = this.docCount > 0 ? totalLen / this.docCount : 0;
  }

  /** Score all indexed documents against a query. Returns path→score map. */
  score(query: string): Map<string, number> {
    const queryTerms = tokenize(query);
    const scores = new Map<string, number>();

    if (this.docCount === 0) return scores;

    for (const [path, docTermsList] of this.docTerms) {
      let docScore = 0;
      const docLen = this.docLengths.get(path) ?? 0;

      for (const qt of queryTerms) {
        const df = this.invertedIndex.get(qt)?.size ?? 0;
        if (df === 0) continue;

        // Term frequency in this document
        let tf = 0;
        for (const t of docTermsList) {
          if (t === qt) tf++;
        }
        if (tf === 0) continue;

        // IDF with smoothing (avoid log(0))
        const idf = Math.log(1 + (this.docCount - df + 0.5) / (df + 0.5));

        // BM25 TF normalization
        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLen)));

        docScore += idf * tfNorm;
      }

      if (docScore > 0) {
        scores.set(path, docScore);
      }
    }

    return scores;
  }
}

/**
 * Simple tokenizer: lowercase, split on non-alphanumeric (preserving
 * underscores for identifiers like WM_DISPLAYCHANGE), filter short tokens.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2);
}
