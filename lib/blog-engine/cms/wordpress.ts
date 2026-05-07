import { decrypt } from "@/lib/blog-engine/encryption";
import type { BofuBlog, BofuCmsConnection, PublishResult } from "@/types/blog-engine";

/**
 * Build the WordPress post body from a blog, including image upload,
 * category/tag resolution, schema injection, and SEO meta.
 */
async function buildWordPressPostBody(
  blog: BofuBlog,
  connection: BofuCmsConnection,
  baseUrl: string,
  auth: string
): Promise<Record<string, unknown>> {
  // 1. Upload featured image (if available)
  let mediaId: number | null = null;
  if (blog.featured_image_url) {
    mediaId = await uploadMedia(
      blog.featured_image_url,
      blog.featured_image_alt || blog.title,
      baseUrl,
      auth
    );
  }

  // 2. Resolve categories
  const categoryIds = await resolveCategories(
    blog.wp_categories,
    baseUrl,
    auth
  );

  // 3. Resolve tags
  const tagIds = await resolveTags(blog.wp_tags, baseUrl, auth);

  // 4. Inject schema markup into content
  const contentWithSchema = injectSchemaMarkup(blog);

  // 5. Assemble post body
  const postBody: Record<string, unknown> = {
    title: blog.title,
    content: contentWithSchema,
    excerpt: blog.excerpt || "",
    status: connection.wp_default_status || "draft",
    slug: blog.slug,
    categories: categoryIds,
    tags: tagIds,
  };

  if (mediaId) {
    postBody.featured_media = mediaId;
  }

  // 6. Add SEO plugin meta fields
  const meta = buildSeoMeta(blog, connection.wp_seo_plugin || "none");
  if (Object.keys(meta).length > 0) {
    postBody.meta = meta;
  }

  return postBody;
}

/**
 * Publish a blog post to WordPress via REST API (creates a new post).
 */
export async function publishToWordPress(
  blog: BofuBlog,
  connection: BofuCmsConnection
): Promise<PublishResult> {
  if (
    !connection.wp_site_url ||
    !connection.wp_username ||
    !connection.wp_app_password_encrypted
  ) {
    return { success: false, error: "WordPress credentials not configured" };
  }

  const password = decrypt(connection.wp_app_password_encrypted);
  const auth = Buffer.from(`${connection.wp_username}:${password}`).toString(
    "base64"
  );
  const baseUrl = connection.wp_site_url.replace(/\/+$/, "");

  try {
    const postBody = await buildWordPressPostBody(blog, connection, baseUrl, auth);

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: `WordPress API error (${response.status}): ${errorBody}`,
      };
    }

    const post = await response.json();

    return {
      success: true,
      postId: String(post.id),
      postUrl: post.link,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Sync refined blog content to an existing WordPress post (PUT update).
 */
export async function syncToWordPress(
  blog: BofuBlog,
  connection: BofuCmsConnection
): Promise<PublishResult> {
  if (!blog.cms_post_id) {
    return { success: false, error: "No existing WordPress post ID to sync to" };
  }

  if (
    !connection.wp_site_url ||
    !connection.wp_username ||
    !connection.wp_app_password_encrypted
  ) {
    return { success: false, error: "WordPress credentials not configured" };
  }

  const password = decrypt(connection.wp_app_password_encrypted);
  const auth = Buffer.from(`${connection.wp_username}:${password}`).toString(
    "base64"
  );
  const baseUrl = connection.wp_site_url.replace(/\/+$/, "");

  try {
    const postBody = await buildWordPressPostBody(blog, connection, baseUrl, auth);

    const response = await fetch(
      `${baseUrl}/wp-json/wp/v2/posts/${blog.cms_post_id}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postBody),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: `WordPress API error (${response.status}): ${errorBody}`,
      };
    }

    const post = await response.json();

    return {
      success: true,
      postId: String(post.id),
      postUrl: post.link,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Upload an image to WordPress media library.
 */
async function uploadMedia(
  imageUrl: string,
  altText: string,
  baseUrl: string,
  auth: string
): Promise<number | null> {
  try {
    // Fetch the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) return null;

    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";
    const extension = contentType.split("/")[1] || "jpg";
    const filename = `blog-engine-${Date.now()}.${extension}`;

    // Upload to WordPress
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: imageBuffer,
    });

    if (!response.ok) return null;

    const media = await response.json();

    // Set alt text
    if (altText) {
      await fetch(`${baseUrl}/wp-json/wp/v2/media/${media.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alt_text: altText }),
      });
    }

    return media.id;
  } catch {
    return null;
  }
}

/**
 * Resolve category names to WordPress category IDs (creating if needed).
 */
async function resolveCategories(
  categoryNames: string[],
  baseUrl: string,
  auth: string
): Promise<number[]> {
  if (!categoryNames.length) return [];

  const ids: number[] = [];

  for (const name of categoryNames) {
    // Check if category exists
    const searchResponse = await fetch(
      `${baseUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(name)}`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    if (searchResponse.ok) {
      const existing = await searchResponse.json();
      const match = existing.find(
        (c: { name: string }) =>
          c.name.toLowerCase() === name.toLowerCase()
      );

      if (match) {
        ids.push(match.id);
        continue;
      }
    }

    // Create the category
    const createResponse = await fetch(
      `${baseUrl}/wp-json/wp/v2/categories`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      }
    );

    if (createResponse.ok) {
      const created = await createResponse.json();
      ids.push(created.id);
    }
  }

  return ids;
}

/**
 * Resolve tag names to WordPress tag IDs (creating if needed).
 */
async function resolveTags(
  tagNames: string[],
  baseUrl: string,
  auth: string
): Promise<number[]> {
  if (!tagNames.length) return [];

  const ids: number[] = [];

  for (const name of tagNames) {
    const searchResponse = await fetch(
      `${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    if (searchResponse.ok) {
      const existing = await searchResponse.json();
      const match = existing.find(
        (t: { name: string }) =>
          t.name.toLowerCase() === name.toLowerCase()
      );

      if (match) {
        ids.push(match.id);
        continue;
      }
    }

    const createResponse = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    if (createResponse.ok) {
      const created = await createResponse.json();
      ids.push(created.id);
    }
  }

  return ids;
}

/**
 * Inject JSON-LD schema markup into blog content.
 */
function injectSchemaMarkup(blog: BofuBlog): string {
  const schemas: string[] = [];

  if (blog.schema_article) {
    schemas.push(
      `<script type="application/ld+json">${JSON.stringify(blog.schema_article)}</script>`
    );
  }
  if (blog.schema_faq) {
    schemas.push(
      `<script type="application/ld+json">${JSON.stringify(blog.schema_faq)}</script>`
    );
  }
  if (blog.schema_local_business) {
    schemas.push(
      `<script type="application/ld+json">${JSON.stringify(blog.schema_local_business)}</script>`
    );
  }
  if (blog.schema_breadcrumb) {
    schemas.push(
      `<script type="application/ld+json">${JSON.stringify(blog.schema_breadcrumb)}</script>`
    );
  }

  if (schemas.length === 0) return blog.content_html;

  return blog.content_html + "\n" + schemas.join("\n");
}

/**
 * Build SEO plugin-specific meta fields.
 */
function buildSeoMeta(
  blog: BofuBlog,
  plugin: string
): Record<string, string> {
  const meta: Record<string, string> = {};

  if (plugin === "yoast") {
    if (blog.meta_title) meta["_yoast_wpseo_title"] = blog.meta_title;
    if (blog.meta_description)
      meta["_yoast_wpseo_metadesc"] = blog.meta_description;
    if (blog.seo_plugin_fields) {
      const fields = blog.seo_plugin_fields as Record<string, string>;
      if (fields.focus_keyword)
        meta["_yoast_wpseo_focuskw"] = fields.focus_keyword;
    }
  } else if (plugin === "rankmath") {
    if (blog.meta_title) meta["rank_math_title"] = blog.meta_title;
    if (blog.meta_description)
      meta["rank_math_description"] = blog.meta_description;
    if (blog.seo_plugin_fields) {
      const fields = blog.seo_plugin_fields as Record<string, string>;
      if (fields.focus_keyword)
        meta["rank_math_focus_keyword"] = fields.focus_keyword;
    }
  }

  return meta;
}

/**
 * Test a WordPress connection.
 */
export async function testWordPressConnection(
  siteUrl: string,
  username: string,
  appPasswordEncrypted: string
): Promise<{ success: boolean; error?: string; siteName?: string }> {
  try {
    const password = decrypt(appPasswordEncrypted);
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const baseUrl = siteUrl.replace(/\/+$/, "");

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Authentication failed (${response.status})`,
      };
    }

    const user = await response.json();

    // Also fetch site info
    const siteResponse = await fetch(`${baseUrl}/wp-json/`);
    const siteInfo = siteResponse.ok ? await siteResponse.json() : null;

    return {
      success: true,
      siteName: siteInfo?.name || user.name,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}
