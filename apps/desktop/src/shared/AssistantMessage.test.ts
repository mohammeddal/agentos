import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AssistantMessage } from "./AssistantMessage";

const render = (text: string) => renderToStaticMarkup(createElement(AssistantMessage, { text }));
describe("safe readable assistant output", () => {
  it("renders paragraphs, lists, emphasis and code", () => {
    const html = render(
      "## Result\n\nA **clear** answer.\n\n- One\n- Two\n\n```js\nconst x = 1;\n```",
    );
    expect(html).toContain("<h3>Result</h3>");
    expect(html).toContain("<strong>clear</strong>");
    expect(html).toContain("<li>One</li>");
    expect(html).toContain("<pre><code");
  });
  it("never embeds raw HTML, images or executable links", () => {
    const html = render(
      '<script>alert(1)</script>\n\n<img src="https://example.com/tracker">\n\n![Remote](https://example.com/tracker)\n\n[unsafe](javascript:alert%281%29)\n\n[local](file:///private/data)',
    );
    expect(html).not.toMatch(/<script|<img|javascript:|file:\/\//);
    expect(html).toContain("not loaded automatically");
  });
  it("opens explicit web citations separately without giving access to the app window", () => {
    const html = render("[Source](https://example.com/docs)");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
