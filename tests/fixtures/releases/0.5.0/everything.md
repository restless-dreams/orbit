---
title: Everything a map can say
theme: night
view: focus
showRings: true
interactive: true
animation: false
speed: 120
palette:
  - "#F8D978"
  - "#F5A3A8"
  - "#9ED5FD"
  - "#99E0BA"
height: 480
maxDepth: 4
className: release-fixture
baseUrl: "https://example.com/maps/"
schemaVersion: 1
cssclasses: [wide, cards]
generator: release-fixtures
---

# 🚀 Everything a map can say
What ships this year, written by hand.

## Research <!-- orbit status: done, priority: 1 -->
Six weeks of interviews before we commit to scope.
- [x] User interviews #ux
- [/] Survey <!-- orbit color: "#E5484D" -->
- [ ] Competitor teardown #market #q3 <!-- orbit due: "2026-12-04 17:00" -->
- Questions to answer
  > - Who buys it?
  > - Why now?
- Typo kept <!-- orbit stauts: done -->

## Build #engineering #sprint-3
<!-- orbit
collapsed: false
type: "milestone@2"
id: build-phase
due: "2026-11-01"
owner: Ana
-->
- Frontend <!-- orbit icon: ★, paletteColor: 3 -->
  - App shell
  - Offline sync
    <!-- orbit
    status: blocked
    files:
      - src: media/sync-protocol.pdf
        name: "Sync protocol, v2.pdf"
        type: application/pdf
        size: 482133
        pages: 12
      - src: media/sync-notes.txt
    -->
    Waits on the [backend](#backend) sync API.
- Backend <!-- orbit noteFormat: plain -->
  Plain text, shown as written: *not emphasis*.

## [Launch](https://example.com/launch-plan)
![The launch poster](images/poster.png)
<!-- orbit caption: Printed for the stores -->
- Trailer
  [![](images/thumbnail.jpg)](https://vimeo.com/76979871)
  <!-- orbit caption: Ninety seconds -->
- Demo page
  [embed](https://example.com/demo)
  <!-- orbit contentType: embed -->
- Press kit
  <!-- orbit
  files:
    - src: media/press-kit.zip
  -->
- [Read the research](#research)
- Old poster
  > ![Kept as text](images/old.png)
- Folded idea <!-- orbit collapsed: true -->
  - Hidden child
- Video file
  [video](clips/teaser.mp4)
  <!-- orbit caption: Ten seconds -->
- Voice memo <!-- orbit audio: memos/kickoff.m4a -->
- Interview
  <!-- orbit
  audio:
    src: "https://example.com/interview.mp3"
    caption: The first interview
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
- Crowd
  <!-- orbit
  image:
    src: images/crowd.jpg
    motion: images/crowd.mp4
  -->
