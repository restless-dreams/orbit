---
title: Everything in YAML
theme: paper
view: all
showRings: false
interactive: true
animation: true
speed: 60
palette:
  - "#F8D978"
  - "#F5A3A8"
  - "#9ED5FD"
height: 360
maxDepth: 3
className: release-fixture
baseUrl: "https://example.com/maps/"
schemaVersion: 1
generator: release-fixtures
---

# 🧭 Everything in YAML
A note in a block scalar,
over two lines.

## Research #ux #q3
<!-- orbit
status: done
priority: 2
due: "2026-11-20"
files:
  - src: media/interviews.xlsx
    name: Interviews (all 24).xlsx
    type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    size: 91200
  - src: media/consent.pdf
-->
- Interviews
- Survey

## Build
<!-- orbit
color: "#E5484D"
collapsed: true
type: "milestone@2"
id: build-phase
owner: Ana
-->
- [Frontend](#research) <!-- orbit paletteColor: 2, due: "2026-11-21 09:30" -->
- Backend <!-- orbit noteFormat: plain -->
  Plain text.

## [Launch](https://example.com/launch-plan)
<!-- orbit
image:
  src: images/poster.png
  width: 640
  alt: The launch poster
  caption: Printed for the stores
audio:
  src: memos/launch.m4a
  caption: "The launch, in a minute"
-->
[![](images/thumbnail.jpg)](https://vimeo.com/76979871)
<!-- orbit caption: Ninety seconds -->
[embed](https://example.com/demo)
<!-- orbit
contentType: embed
caption: The demo
-->
- Launch day
  <!-- orbit
  image:
    src: images/launch.jpg
    motion:
      src: images/launch.mp4
      still: 1.5
    alt: The team on the stage
  -->
