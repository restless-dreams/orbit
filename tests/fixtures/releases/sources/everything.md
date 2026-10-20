---
title: Everything a map can say
theme: night
view: focus
palette: ["#F8D978", "#F5A3A8", "#9ED5FD", "#99E0BA"]
maxDepth: 4
showRings: true
interactive: true
animation: false
speed: 120
height: 480
baseUrl: https://example.com/maps/
className: release-fixture
schemaVersion: 1
flavor: markdown
cssclasses: [wide, cards]
generator: release-fixtures
---
# 🚀 Everything a map can say
What ships this year, written by hand.
<!-- A comment Orbit hides and keeps. -->

## Research <!-- orbit status: done, priority: 1 -->
Six weeks of interviews before we commit to scope.
- [x] User interviews #ux
- [/] Survey <!-- orbit color: "#E5484D" -->
- [ ] Competitor teardown #market #q3
- Questions to answer
  > - Who buys it?
  > - Why now?
- Typo kept <!-- orbit stauts: done -->

## Build <!-- orbit id: build-phase, collapsed: false -->
<!-- orbit
type: milestone@2
owner: Ana
due: "2026-11-01"
tags: [engineering, sprint-3]
-->
### Frontend <!-- orbit paletteColor: 3, icon: "★" -->
- App shell
- Offline sync <!-- orbit status: blocked -->
  Waits on the [backend](#backend) sync API.
### Backend
<!-- orbit noteFormat: plain -->
Plain text, shown as written: *not emphasis*.

## [Launch](https://example.com/launch-plan)
![The launch poster](images/poster.png)
<!-- orbit caption: Printed for the stores -->
- Trailer
  [![A frame](images/thumbnail.jpg)](https://vimeo.com/76979871)
  <!-- orbit caption: Ninety seconds -->
- Demo page <!-- orbit embed: https://example.com/demo -->
- [Read the research](#research)
- Old poster
  ![Kept as text](images/old.png)
  <!-- orbit contentType: none -->
- Folded idea <!-- orbit collapsed: true -->
  - Hidden child
- Video file
  <!-- orbit video: { src: clips/teaser.mp4, provider: native, caption: Ten seconds } -->
