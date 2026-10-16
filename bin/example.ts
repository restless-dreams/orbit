/**
 * The map `orbit example` prints: every feature of the format in one
 * small roadmap, to copy and change. Tests keep it free of problems.
 */
export const EXAMPLE_MAP = `---
title: Product roadmap
theme: paper
---
# 🚀 Product roadmap
What ships this year. Click a planet to fly into it; flick the orbit to spin it.

## 🔭 Discovery <!-- orbit status: done -->
Six weeks of research before we commit to scope.
- [x] User interviews
- [x] Pricing survey
- Competitor teardown #research

## 🎨 Design
<!-- orbit
status: active
color: "#C6B4F2"
-->
![Color tokens of the design system](images/tokens.png)

- [/] Design system refresh
- Onboarding flow
  Three screens, one decision each.
- Dark mode

## 🛠 Build <!-- orbit status: active -->
### Frontend
- App shell
- Offline sync <!-- orbit status: blocked -->
  Waits on the [search index](#search-index).
### Backend
- Auth service <!-- orbit priority: 1, status: active -->
- Search index

## 📈 [Growth](https://example.com/growth-plan)
- SEO content #marketing
- Referral program <!-- orbit owner: Ana -->

## 🎬 Launch
[Launch trailer](https://www.youtube.com/watch?v=aqz-KE-bpKQ)

- [ ] Launch event
- [ ] Press kit
`;
