import { describe, expect, it } from "vitest";

import { renderBrandedEmail } from "./branded-template";

describe("renderBrandedEmail", () => {
  it("escapes URL values before injecting them into attributes", () => {
    const html = renderBrandedEmail({
      appUrl: `https://apps.example.test/"bad"`,
      preheader: "Preview",
      eyebrow: "AiM",
      title: "Title",
      body: "<p>Body</p>",
      ctaLabel: "Open",
      ctaUrl: `https://apps.example.test/path?next="bad"&x=<script>`,
    });

    expect(html).toContain(
      `href="https://apps.example.test/path?next=&quot;bad&quot;&amp;x=&lt;script&gt;"`
    );
    expect(html).toContain(
      `src="https://apps.example.test/&quot;bad&quot;/logo-white.svg"`
    );
    expect(html).toContain(
      `href="https://apps.example.test/&quot;bad&quot;/apps"`
    );
    expect(html).not.toContain(`href="https://apps.example.test/path?next="bad"`);
  });
});
