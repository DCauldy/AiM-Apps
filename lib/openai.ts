import { openai } from '@ai-sdk/openai';

export function getModel(): string {
  // Default to GPT-4o for best balance of power and cost-effectiveness
  // GPT-4o is faster and cheaper than GPT-4 Turbo while maintaining excellent quality
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  // Trim whitespace to handle any accidental spaces in environment variables
  return model.trim();
}

// Export model instance for direct use with AI SDK
export const model = openai(getModel());