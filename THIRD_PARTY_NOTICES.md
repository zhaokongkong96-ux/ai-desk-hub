# Third-party components and references

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

## MediaPipe Tasks Vision / BlazeFace

- MediaPipe Tasks Vision 0.10.21: pinned npm distribution `https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.21.tgz`, Apache-2.0. Local runtime and WASM files under `vendor/mediapipe-0.10.21/`; full license included there.
- BlazeFace short-range float16 model v1: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`, Apache-2.0 per its model card https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf, linked from Google's official MediaPipe Face Detector model documentation. Detects face presence, not identity or liveness. Loaded locally only when the user enables camera detection.
- Documentation: https://developers.google.com/edge/mediapipe/solutions/vision/face_detector
- Public sample used for development QA only, not shipped: https://storage.googleapis.com/mediapipe-assets/portrait.jpg . No user camera image or face template is included in the app or tests.
