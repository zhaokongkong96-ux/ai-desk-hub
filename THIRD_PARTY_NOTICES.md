# Third-party components and references

## User-selected aquarium reference (local v0.15.1)

`assets/aquarium/reference-v2.png` is the user's supplied 1448×1086 reference, retained byte-for-byte for the requested local implementation. Source SHA-256: `41ab7e832c259799585c92ec8ff160553e873918b73e9d3574a786d1de1f5cd2`. The original creator and license were not supplied; no public-domain or stock-image license is asserted.

`assets/aquarium/clean-ui-plate-v2.png` was produced with OpenAI ImageGen to remove baked-in UI from that reference. Only former UI regions are used from the cleaned image at runtime. The scene uses the supplied source; fish texture deformation and restrained water shimmer are rendered locally. This implementation has not been publicly deployed.

- FullCalendar Standard Bundle 6.1.19, MIT, Copyright (c) 2021 Adam Shaw. Source: https://github.com/fullcalendar/fullcalendar. Distribution retrieved from the official npm registry (`fullcalendar@6.1.19`, tarball SHA-1 e43bdd0c21a7e18f897ece4006d1b0b4d29b5e39). Local bundle: vendor/fullcalendar-6.1.19.min.js. License: vendor/fullcalendar-LICENSE.md. No Premium plugins used.
- Third Screen: https://github.com/ericvaish/thirdscreen. Visual and interaction reference selected by the user: dark panels, fixed zones, large clock and glanceable tasks. AI Desk Hub implements these ideas in its existing HTML/CSS/JavaScript; no Third Screen source code, mascot, branding, or application dependencies were copied.

## Bundled ambient wallpapers (retrieved 2026-10-27)

Ten original landscape images: five oil paintings and five nature photos. Downloaded and bundled locally, not hotlinked. `wallpapers.js` records each source, download URL, author, license and verified image dimensions. All ten downloads are unmodified; no portrait image is cropped to pass as landscape.

- `assets/wallpapers/wheat-field.jpg`: **麦田与柏树**, Vincent van Gogh, 1889. [Source](https://www.metmuseum.org/art/collection/search/436535). Public Domain · The Met Open Access. 1200×955.
- `assets/wallpapers/montmartre.jpg`: **冬日清晨的蒙马特大道**, Camille Pissarro, 1897. [Source](https://www.metmuseum.org/art/collection/search/437310). Public Domain · The Met Open Access. 1200×969.
- `assets/wallpapers/jalais-hill.jpg`: **蓬图瓦兹的雅莱山**, Camille Pissarro, 1867. [Source](https://www.metmuseum.org/art/collection/search/437299). Public Domain · The Met Open Access. 1200×915.
- `assets/wallpapers/heart-andes.jpg`: **安第斯之心**, Frederic Edwin Church, 1859. [Source](https://www.metmuseum.org/art/collection/search/10481). Public Domain · The Met Open Access. 1200×661.
- `assets/wallpapers/rocky-mountains.jpg`: **落基山脉：兰德峰**, Albert Bierstadt, 1863. [Source](https://www.metmuseum.org/art/collection/search/10154). Public Domain · The Met Open Access. 1200×719.
- `assets/wallpapers/forest.jpg`: **绿意森林**, Diogo Nunes. [Source](https://unsplash.com/photos/green-forest-UOkZT4JT8fw). Unsplash License. 2048×1536.
- `assets/wallpapers/alpine-lake.jpg`: **高山湖镜**, Ales Krivec. [Source](https://unsplash.com/photos/landscape-photography-of-lake-surrounded-by-mountains-8aSs7QejvSw). Unsplash License. 2048×1367.
- `assets/wallpapers/misty-hills.jpg`: **雨后雾山**, Ricardo Gomez Angel. [Source](https://unsplash.com/photos/high-angle-of-mountain-range-covered-with-mists-qfcBVgqJ_1E). Unsplash License. 2048×1377.
- `assets/wallpapers/sand-dunes.jpg`: **沙丘光影**, Matt Artz. [Source](https://unsplash.com/photos/sand-dunes-at-daytime-ShQbbBBvoPM). Unsplash License. 2048×1362.
- `assets/wallpapers/ocean.jpg`: **海浪与云**, Tim Marshall. [Source](https://unsplash.com/photos/landscape-photography-of-ocean-qKlD2QlK-CY). Unsplash License. 2048×1365.

Unsplash License: https://unsplash.com/license (free commercial/noncommercial use; do not sell unmodified photos or replicate a competing image service). Met works are designated Public Domain on each collection page under its Open Access program. Oil paintings use contain to preserve the full composition; nature photos use cover for the display and may crop edges according to screen orientation.

## Daily Topics headline sources

Public RSS metadata only (headline, publisher, publication date and report link); no article text, source images, popularity scores or third-party RSS proxy copied. Media copyrights remain with their respective publishers. Each card links back to the report; Google News links may redirect to the publisher. Category/search feeds are discovery suggestions, not independently verified statements or a whole-web popularity ranking.

- Google News Chinese RSS: https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans ; topic searches use the same RSS service.
- 少数派 official RSS: https://sspai.com/feed ; subscription guide: https://sspai.com/post/24194 .
- IT之家 official RSS: https://www.ithome.com/rss/ ; announcement: https://www.ithome.com/0/000/037.htm .

## Daily AI Radar metadata

The daily catalog combines the existing Awesome AI Hardware directory (https://github.com/s87343472/awesome-ai-hardware, data/projects.json) with the official GitHub repository search API (https://docs.github.com/en/rest/search/search#search-repositories). Repository names, descriptions, declared licenses, timestamps and links are metadata, not a certification of reproducibility, safety, popularity or licensing compliance. New discovery is keyword filtered and remains unreviewed. The GitHub runner token is never included in the public output.


## Open canvas interface
Background `assets/theme/quiet-horizon.png` generated with OpenAI ImageGen from the approved UI reference, 2026-10-29.
`vendor/desk-icons.svg`: Bootstrap Icons, Copyright The Bootstrap Authors, MIT. Source: https://github.com/twbs/icons .

## Independent swimming assets (local v0.15.2)

`assets/aquarium/swim-background-v3.png`, `fish-atlas-v3.png` and `turn-atlas-v3.png` were made with OpenAI ImageGen from the user's selected reference for the requested local aquarium. They reconstruct water behind the fish and provide transparent fish/turning poses; these assets are not byte-identical extractions or real fish footage. The unmodified source remains in `reference-v2.png` as local provenance; the v0.15.2 static-site build uses only the current three rendering assets. No additional stock-image licensing or original authorship is asserted.

## Small fish turning pose (local v0.15.4)

`assets/aquarium/small-turn-v4.png` was generated with built-in OpenAI ImageGen using the supplied small silver-blue fish atlas as reference. It supplies a single head-on turning pose with alpha, replacing the cropped half-head fallback. It is a generated perspective reconstruction, not original source pixels or real footage. The prompt and verification limits are recorded in `docs/AQUARIUM_TURN_V0154.md`.

## Multi-view turn sequences (local v0.15.6)

`assets/aquarium/gold-views-v6.png` and `small-views-v6.png` were generated using built-in OpenAI ImageGen with the existing fish atlas as reference. Each contains nine right-side-to-front perspective poses in a 3×3 layout. Runtime aligns body centers and silhouette area and interpolates neighboring views; opposing views are mirrored. Original side sprites are retained at the turn endpoints. Generated views approximate the source fish, with possible shape/fin differences; no claim of actual 3D footage or exact source identity across all poses. Prompt specification is recorded in docs/AQUARIUM_MULTIVIEW_V0156.md.

## Flow-morphed turn frames (local v0.15.8)

`gold-morph-a-v8.png`, `gold-morph-b-v8.png`, `small-morph-v8.png` are build-time renderings derived from the existing generated v0.15.6 view sheets. No new external provider/model call was made. Local OpenCV derives only bidirectional displacement vectors; the native Canvas build script renders the interpolated meshes. Each type has 129 turn frames; they are derived animation frames, not independently photographed angles or a real 3D fish. Static-site runtime loads these three sheets and the existing background, and no longer ships the original source/view sheets for playback.
