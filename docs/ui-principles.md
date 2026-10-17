# UI principles (Rick, 2026-10-17 — for every page, present and future)

Page space is precious. Two rules apply to the management centre, the help pages and the course site, and to any page added later.

## 1. The page head takes no space

- The brand header is one slim line (`<header class="site-header compact">`, about 50px, no tagline). The public lockup is not used on working pages.
- A page has **no title row of its own.** The sidebar already says where you are. `setTitle()` still sets the browser tab title and (on a phone) a small title; on a computer:
  - a page with no actions has no head at all;
  - actions (＋ Add, Publish…) are one slim, right-aligned row, or — better — sit in the page's own first row (for example the tabs row of the calendar).
- Do not stack banner + title + tabs + toolbar. Merge them into one row.

## 2. Explanations are small “i” hints, never text on the page

- Say the goal and the cautions in one or two short sentences, shown on hover / focus of a small ⓘ.
- Use `tipI(text)` in JavaScript, or `<span class="info" tabindex="0" data-tip="…">i</span>`. Put it on the heading, the field label or the bold line it explains. `setTitle(…, { info })` puts the page's ⓘ on its sidebar item.
- `tipify()` (management/src/01-core.js) also converts `<p class="hint">`, a `<small>` under a field and small grey `<p class="muted">` into an ⓘ after render, so older code follows the rule too. A warning that must stay in view (`.note`, `.msg`, `.bad`) or text with a link or button is left in place, as is anything marked `data-keep`.
- Empty states and results (“No events yet”) are content, not explanation, and stay as text.

## Also (calendar, same day)

- Times are typed or picked to the minute (`<input type="time" step="60">`); 8:14 works.
- Outlook / Teams terms: 会议链接 / Meeting link, 显示为 Free/Busy, 详细信息.
