import crypto from "crypto";
import type { BofuBlog, BofuCmsConnection, PublishResult } from "@/types/blog-engine";

/**
 * Build the blog payload for webhook events.
 */
function buildWebhookPayload(blog: BofuBlog) {
  return {
    id: blog.id,
    title: blog.title,
    slug: blog.slug,
    content_html: blog.content_html,
    content_markdown: blog.content_markdown,
    excerpt: blog.excerpt,
    answer_capsule: blog.answer_capsule,
    meta_title: blog.meta_title,
    meta_description: blog.meta_description,
    og_title: blog.og_title,
    og_description: blog.og_description,
    featured_image_url: blog.featured_image_url,
    featured_image_alt: blog.featured_image_alt,
    wp_categories: blog.wp_categories,
    wp_tags: blog.wp_tags,
    schema_article: blog.schema_article,
    schema_faq: blog.schema_faq,
    schema_local_business: blog.schema_local_business,
    schema_breadcrumb: blog.schema_breadcrumb,
    seo_plugin_fields: blog.seo_plugin_fields,
    internal_links: blog.internal_links,
    external_citations: blog.external_citations,
  };
}

/**
 * Send a webhook event with HMAC signature.
 */
async function sendWebhookEvent(
  blog: BofuBlog,
  connection: BofuCmsConnection,
  event: string
): Promise<PublishResult> {
  if (!connection.webhook_url) {
    return { success: false, error: "Webhook URL not configured" };
  }

  try {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      blog: buildWebhookPayload(blog),
    };

    const body = JSON.stringify(payload);

    // Generate HMAC signature for verification
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-AiM-Event": event,
    };

    if (connection.webhook_secret) {
      const signature = crypto
        .createHmac("sha256", connection.webhook_secret)
        .update(body)
        .digest("hex");
      headers["X-AiM-Signature"] = signature;
    }

    const response = await fetch(connection.webhook_url, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: `Webhook error (${response.status}): ${errorBody}`,
      };
    }

    // Try to parse response for post ID/URL
    let responseData: Record<string, unknown> = {};
    try {
      responseData = await response.json();
    } catch {
      // Response may not be JSON
    }

    return {
      success: true,
      postId: responseData.postId as string | undefined,
      postUrl: responseData.postUrl as string | undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Publish a blog post via webhook (for Zapier, Make, or custom integrations).
 * Sends the full blog payload with HMAC signature for verification.
 */
export async function publishToWebhook(
  blog: BofuBlog,
  connection: BofuCmsConnection
): Promise<PublishResult> {
  return sendWebhookEvent(blog, connection, "blog.published");
}

/**
 * Sync refined blog content via webhook (sends blog.updated event).
 */
export async function syncToWebhook(
  blog: BofuBlog,
  connection: BofuCmsConnection
): Promise<PublishResult> {
  return sendWebhookEvent(blog, connection, "blog.updated");
}

/**
 * Test a webhook connection.
 */
export async function testWebhookConnection(
  webhookUrl: string,
  webhookSecret?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      event: "connection.test",
      timestamp: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-AiM-Event": "connection.test",
    };

    if (webhookSecret) {
      const signature = crypto
        .createHmac("sha256", webhookSecret)
        .update(body)
        .digest("hex");
      headers["X-AiM-Signature"] = signature;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Webhook responded with ${response.status}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}
