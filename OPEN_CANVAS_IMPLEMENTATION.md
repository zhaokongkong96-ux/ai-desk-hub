# v0.11.0 · approved open canvas implementation

The user selected the attached centered-clock, unboxed quiet-horizon design. This supersedes the all-card and all-glass concepts. Non-calendar UI is monochrome; event categories keep their established colors inside calendar views. Notes/clock/tasks sit above the complete day timeline, music and capture remain available at the bottom. Topics, Radar, RETURN and dialogs share the same neutral editorial style. Original data and calendar/integration logic are retained.

Implementation: `open-canvas.css`, presentation-only `open-canvas.js`, generated background under `assets/theme/`, vendored Bootstrap Icons. All assets have project-relative URLs and are included in the staged site and v0.11.0 offline cache. Calendar blocks now show start time and a compact title while keeping complete accessible labels and agenda text.

Verified locally with Chromium and WebKit at primary iPad landscape, compact landscape, portrait and mobile sizes. Existing mocked Feishu, push and integration checks plus local navigation/capture/calendar checks passed. Offline shell reload verified in Chromium. `design-qa.md` and screenshots are local ignored review evidence. No real iPad acceptance or online release is implied. Public release remains a separate user decision. No unrelated Feishu Worker files included in this change.

Release target v0.11.1: the user explicitly requested synchronizing the latest visual design and layout on 2026-10-30. Includes the already published daily hotlist and existing daily workflow; no backend or personal-data migration.
