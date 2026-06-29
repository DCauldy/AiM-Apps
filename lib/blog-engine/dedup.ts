import { embed } from "ai";
import { getEmbeddingModel } from "@/lib/openrouter";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface TrigramMatch {
  id: string;
  title: string;
  status: string;
  similarity: number;
}

interface EmbeddingMatch {
  id: string;
  title: string;
  status: string;
  similarity: number;
}

export interface DedupMatch {
  id: string;
  title: string;
  similarity: number;
  matchType: "trigram" | "embedding";
}

export interface DedupResult {
  isDuplicate: boolean;
  matches: DedupMatch[];
  embedding: number[] | null;
}

/**
 * Two-layer topic deduplication:
 *   Layer 1 — Trigram (no API call): catches titles with similar wording
 *   Layer 2 — Vector embedding (one API call): catches semantically similar topics
 *
 * If trigram finds a high-confidence match (>0.6), skips the embedding layer.
 * Graceful degradation: if either layer fails, the other still works.
 * If both fail, topic passes through (safe default).
 */
export async function checkTopicDuplicate(
  userId: string,
  title: string
): Promise<DedupResult> {
  const supabase = createServiceRoleClient();
  const matches: DedupMatch[] = [];
  let embedding: number[] | null = null;

  // ── Layer 1: Trigram similarity (no API call) ──────────────────────────
  try {
    const { data: trigramMatches, error } = await supabase.rpc(
      "match_topics_trigram",
      { p_user_id: userId, p_title: title, p_threshold: 0.3 }
    );

    if (!error && trigramMatches && trigramMatches.length > 0) {
      for (const m of trigramMatches as TrigramMatch[]) {
        matches.push({
          id: m.id,
          title: m.title,
          similarity: m.similarity,
          matchType: "trigram",
        });
      }

      // High-confidence trigram match — short-circuit, skip embedding API call
      const bestTrigram = trigramMatches[0] as TrigramMatch;
      if (bestTrigram.similarity > 0.6) {
        console.log(
          `[Dedup] Trigram short-circuit: "${title}" ≈ "${bestTrigram.title}" (${bestTrigram.similarity.toFixed(3)})`
        );
        return { isDuplicate: true, matches, embedding: null };
      }
    }
  } catch (err) {
    console.error("[Dedup] Trigram layer failed (non-fatal):", err);
  }

  // ── Layer 2: Vector cosine similarity (one embedding API call) ────────
  try {
    const { embedding: generated } = await embed({
      model: getEmbeddingModel(),
      value: title,
    });
    embedding = generated;

    // Format as pgvector string for the RPC call
    const embeddingStr = `[${embedding.join(",")}]`;

    const { data: embeddingMatches, error } = await supabase.rpc(
      "match_topics_embedding",
      {
        p_user_id: userId,
        p_embedding: embeddingStr,
        p_threshold: 0.85,
        p_limit: 5,
      }
    );

    if (!error && embeddingMatches && embeddingMatches.length > 0) {
      for (const m of embeddingMatches as EmbeddingMatch[]) {
        // Avoid adding a match that trigram already found
        if (!matches.some((existing) => existing.id === m.id)) {
          matches.push({
            id: m.id,
            title: m.title,
            similarity: m.similarity,
            matchType: "embedding",
          });
        }
      }

      console.log(
        `[Dedup] Embedding match: "${title}" ≈ "${(embeddingMatches[0] as EmbeddingMatch).title}" (${(embeddingMatches[0] as EmbeddingMatch).similarity.toFixed(3)})`
      );
      return { isDuplicate: true, matches, embedding };
    }
  } catch (err) {
    console.error("[Dedup] Embedding layer failed (non-fatal):", err);
  }

  // If trigram found low-confidence matches but embedding found nothing,
  // still treat as duplicate if any trigram match exists
  if (matches.length > 0) {
    return { isDuplicate: true, matches, embedding };
  }

  return { isDuplicate: false, matches: [], embedding };
}
