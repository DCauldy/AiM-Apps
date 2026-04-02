import { generateObject, generateText } from 'ai';
import { model } from '@/lib/openai';
import { z } from 'zod';

export interface Claim {
  claim: string;
  context: string;
}

export interface VerificationResult {
  claim: string;
  verified: boolean;
  corrected?: string;
  notes?: string;
}

// Schema for claims extraction
const claimsSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string(),
      context: z.string(),
    })
  ),
});

// Schema for claim verification
const verificationSchema = z.object({
  verified: z.boolean(),
  corrected: z.string().nullable().optional(),
  notes: z.string().optional(),
});

/**
 * Extract verifiable claims, facts, and figures from an AI response
 */
export async function extractClaims(response: string): Promise<Claim[]> {
  const extractionPrompt = `You are analyzing an AI-generated response to identify specific, verifiable claims, facts, figures, and statements that can be fact-checked.

Your task is to extract ONLY verifiable claims - things that can be checked for accuracy:
- Specific numbers, dates, statistics
- Factual statements about events, people, places
- Claims about relationships, causality
- Technical specifications or data
- Historical facts or dates

DO NOT extract:
- Opinions or subjective statements
- General advice or recommendations
- Vague statements without specific claims
- Future predictions
- Hypothetical scenarios

For each claim you identify, provide:
1. The claim itself (as a concise statement)
2. The context where it appears in the response

Here is the response to analyze:
${response}`;

  try {
    const { object } = await generateObject({
      model,
      schema: claimsSchema,
      prompt: extractionPrompt,
      temperature: 0.3,
    });

    return object.claims || [];
  } catch (error) {
    console.error("Error extracting claims:", error);
    return [];
  }
}

/**
 * Generate verification queries for each claim
 */
export function generateVerificationQueries(claims: Claim[]): string[] {
  return claims.map((claim) => {
    return `Is it accurate that: "${claim.claim}"?\n\nContext: ${claim.context}\n\nPlease verify this specific claim. If it's incorrect, provide the correct information. If it's accurate, confirm it.`;
  });
}

/**
 * Verify a single claim
 */
export async function verifyClaim(query: string): Promise<VerificationResult> {
  const verificationPrompt = `You are a fact-checking assistant. Your task is to verify the accuracy of the claim in the following query.

${query}

Be thorough but concise. Focus on factual accuracy.`;

  try {
    const { object } = await generateObject({
      model,
      schema: verificationSchema,
      prompt: verificationPrompt,
      temperature: 0.2,
    });

    // Extract the original claim from the query
    const claimMatch = query.match(/Is it accurate that: "([^"]+)"/);
    const originalClaim = claimMatch ? claimMatch[1] : query;

    return {
      claim: originalClaim,
      verified: object.verified === true,
      corrected: object.corrected || undefined,
      notes: object.notes || undefined,
    };
  } catch (error) {
    console.error("Error verifying claim:", error);
    return {
      claim: query,
      verified: false,
      notes: "Error during verification",
    };
  }
}

/**
 * Verify all claims from a response
 */
export async function verifyAllClaims(claims: Claim[]): Promise<VerificationResult[]> {
  const queries = generateVerificationQueries(claims);
  const results: VerificationResult[] = [];

  for (const query of queries) {
    const result = await verifyClaim(query);
    results.push(result);
  }

  return results;
}

/**
 * Revise the original response based on verification results
 */
export async function reviseAnswer(
  originalResponse: string,
  verificationResults: VerificationResult[]
): Promise<string> {
  // If no verification results or all are verified, return original
  if (verificationResults.length === 0) {
    return originalResponse;
  }

  const allVerified = verificationResults.every((r) => r.verified);
  if (allVerified && verificationResults.every((r) => !r.corrected)) {
    // All claims verified as correct, return original
    return originalResponse;
  }

  // Build summary of verification results
  const verificationSummary = verificationResults
    .map((result, index) => {
      let summary = `${index + 1}. Claim: "${result.claim}"\n`;
      if (result.verified && !result.corrected) {
        summary += "   Status: Verified as accurate\n";
      } else if (result.corrected) {
        summary += `   Status: Incorrect - should be: "${result.corrected}"\n`;
      } else {
        summary += "   Status: Could not verify\n";
      }
      if (result.notes) {
        summary += `   Notes: ${result.notes}\n`;
      }
      return summary;
    })
    .join("\n");

  const revisionPrompt = `You are revising an AI-generated response based on fact-checking results.

ORIGINAL RESPONSE:
${originalResponse}

VERIFICATION RESULTS:
${verificationSummary}

Your task is to revise the original response to:
1. Keep all verified accurate information unchanged
2. Correct any inaccurate claims with the verified correct information
3. Maintain the original structure, tone, and formatting
4. Only make necessary corrections - don't add unnecessary changes
5. If a claim could not be verified, note this appropriately or remove it if it's critical

Return the revised response that incorporates all verified corrections while maintaining the original response's structure and style.`;

  try {
    const { text } = await generateText({
      model,
      prompt: revisionPrompt,
      temperature: 0.3,
    });

    return text || originalResponse;
  } catch (error) {
    console.error("Error revising answer:", error);
    // Return original if revision fails
    return originalResponse;
  }
}

/**
 * Complete Chain-of-Verification process
 */
export async function performChainOfVerification(
  originalResponse: string
): Promise<{ revisedResponse: string; verificationResults: VerificationResult[] }> {
  // Step 1: Extract claims
  const claims = await extractClaims(originalResponse);

  if (claims.length === 0) {
    // No claims to verify, return original
    return {
      revisedResponse: originalResponse,
      verificationResults: [],
    };
  }

  // Step 2: Verify all claims
  const verificationResults = await verifyAllClaims(claims);

  // Step 3: Revise answer based on verification
  const revisedResponse = await reviseAnswer(originalResponse, verificationResults);

  return {
    revisedResponse,
    verificationResults,
  };
}
