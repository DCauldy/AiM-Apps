// Re-export from Blog Engine — single source of truth for AES-256-GCM crypto.
// Reuses BLOG_ENGINE_ENCRYPTION_KEY env var across both apps.
export { encrypt, decrypt } from "@/lib/blog-engine/encryption";
