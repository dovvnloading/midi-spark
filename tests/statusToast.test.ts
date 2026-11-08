import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusToast } from "../src/components/StatusToast";

describe("action feedback accessibility", () => {
  const onDismiss = () => {};

  it("announces blocking errors assertively with a visible dismissal action", () => {
    const html = renderToStaticMarkup(createElement(StatusToast, {
      notice: {id: 1, kind: "error", message: "Audio preview could not start"},
      onDismiss,
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("Audio preview could not start");
    expect(html).toContain('aria-label="Dismiss notification"');
  });

  it("announces ordinary completion without interrupting assistive technologies", () => {
    const html = renderToStaticMarkup(createElement(StatusToast, {
      notice: {id: 2, kind: "success", message: "MIDI export completed"},
      onDismiss,
    }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('role="alert"');
  });

  it("does not leave a stale live region message when no notice is visible", () => {
    const html = renderToStaticMarkup(createElement(StatusToast, {
      notice: null,
      onDismiss,
    }));
    expect(html).not.toContain('aria-live=');
    expect(html).not.toContain('role="alert"');
  });
});
