/** The library sample's areas: icon, name, and how many tables each has (a planet shows six as moons). */
const LIBRARY_AREAS = [
  ['📚', 'Catalog', 10],
  ['🧑‍🤝‍🧑', 'Members', 9],
  ['🔁', 'Loans & Returns', 9],
  ['🏛️', 'Branches', 10],
  ['🗓️', 'Events', 10],
  ['💳', 'Fees & Payments', 13],
  ['📦', 'Acquisitions', 9],
  ['🧾', 'Reports', 18],
  ['🔐', 'Staff & Access', 12],
  ['📨', 'Notices', 10],
  ['🌐', 'Digital Lending', 10],
  ['🧰', 'Maintenance', 10],
];

/**
 * Sample maps for the browser tests. `image(name)` turns a file name from
 * `img/` beside this file (a picture, or the trip's video) into a URL.
 */
export const createSamples = (image) => {
  return {
    roadmap: {
      title: 'Product roadmap',
      source: `---
title: Product roadmap 2027
---
# 🪐 Product Roadmap 2027

## 🔭 Discovery
> Six weeks of research before we commit to scope.
> Interviews are booked through the research ops calendar.

- User interviews <!-- orbit status: active -->
- Competitor teardown
- Pricing survey
- Analytics audit

## 🎨 Design
![Moodboard](${image('sunset.jpg')})

- Design system refresh
- Onboarding flow
- Empty states
- Dark mode

## 🛠 Build
<!-- orbit status: active -->

### Frontend
- App shell
- Editor
- Offline sync

### Backend
- Auth service
- Billing
- Search index

### Infrastructure
- CI pipeline
- Observability

## 🚀 Launch
- [Press kit](https://example.com/press)
- Beta waitlist
- Launch event

## 📈 Growth
- Referral program
- SEO content
- Partnerships

## 🧪 Quality
- E2E test suite
- Accessibility audit
- Performance budget`,
    },
    format: {
      title: 'Writing a map (the format, explained)',
      source: `---
title: Writing a map
---
# ✍️ Writing a map
Every heading and every list item is a planet. Text under them is their note: click a planet, then read it.

## Headings nest
A heading's children are the headings and the lists under it.

- An item under the heading
  - Indent an item to nest it

### A deeper heading
- Its own items

## Lists
- [x] Checkboxes set a status
- [/] This one is in progress
- Hashtags at the end are tags #format #tags
- **Bold**, *italics* and \`code\` read as plain text
- Details go under the item
  Indented lines are this item's note.
  > - Quote a list
  > - to keep it in the note

## Media
- A picture
  ![Sunset over the hills](${image('sunset.jpg')})
- A video
  [A walkthrough](https://www.youtube.com/watch?v=aqz-KE-bpKQ)

## Links
- [A page](https://example.com)
- [Another planet](#headings-nest)
  A link to #id flies to that planet. Links in notes do too: [Lists](#lists).

## Attributes <!-- orbit color: "#C6B4F2" -->
- Comments set anything else <!-- orbit status: blocked, priority: 1 -->`,
    },
    types: {
      title: 'Team and milestones (your own node types)',
      source: `---
title: Launch team
---
# 🚀 Launch
This map defines two node types: people show their initials, and milestones get a flag, a due date and a Celebrate button. Pick a planet, then its buttons.

## Team
- Ana Torres <!-- orbit type: person, role: Design, email: ana@example.com -->
- Kai Moreno <!-- orbit type: person, role: Engineering, email: kai@example.com -->
- Lea Chen <!-- orbit type: person, role: Research, status: on hold -->

## Milestones
- Beta <!-- orbit type: milestone, due: May 2, status: done -->
- Launch <!-- orbit type: milestone, due: June 6, status: review -->
- Party <!-- orbit type: milestone, due: June 7 -->`,
    },
    trip: {
      title: 'Mountain trip (pictures, videos and notes)',
      source: `# 🏔 Mountain Trip

![Sunrise from the summit](${image('mountain.jpg')})

> We left at **5am** to catch the sunrise.
>
> - Bring a headlamp
> - Pack warm layers
>
> The trail is steep after the second refuge, so plan for *two hours* of switchbacks.
> Read the [park guide](https://example.com/guide) before going.

## Gear
- Boots
- Jacket <!-- orbit note: "Waterproof, with a hood." -->
- Stove

## Trail
[Trail walkthrough](https://www.youtube.com/watch?v=aqz-KE-bpKQ)

## Camp
![Sunset at camp](${image('sunset.jpg')})
<!-- orbit caption: The tents went up just before the light went. -->

### Night sky
[![The sky turning over the tent](${image('night-sky.jpg')})](${image('night-sky.webm')})
<!-- orbit caption: Four seconds of stars turning over the tent. -->`,
    },
    team: {
      title: 'Team and tasks (status and checklists)',
      source: `# 👥 Platform team

## Q3 goals
- [x] Ship the new editor
- [x] Cut build times in half
- [ ] Launch the public API
- [ ] Hire two engineers

## On call
- Ana <!-- orbit status: active -->
- Bo
- Chen

## Blocked
- Billing migration <!-- orbit status: blocked -->
- SSO for enterprise <!-- orbit status: blocked -->

## Done this week
- Search ranking <!-- orbit status: done -->
- Dark mode <!-- orbit status: done -->`,
    },
    many: {
      title: 'Eighteen planets',
      source: `# 🌌 Eighteen planets

${['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo'].map((name) => `- ${name}`).join('\n')}`,
    },
    library: {
      title: 'A city library',
      // The areas of the large map (scripts/large-map.js): each has more tables than a planet shows as moons, so each counts the rest.
      source: `# City library

${LIBRARY_AREAS.map(([icon, name, tables]) => `## ${icon} ${name}\n${Array.from({ length: tables }, (_, index) => `- ${name.toLowerCase().replace(/[^a-z]+/g, '_')}_${index + 1}`).join('\n')}`).join('\n\n')}`,
    },
    languages: {
      title: 'Long and non-Latin labels',
      source: `# Planificación estratégica de la organización para el año fiscal

## Investigación de mercado y análisis de la competencia regional
## 研究开发与市场调研
## Internationalization and localization infrastructure overhaul
## 🧭 Navegación
## OK`,
    },
    deep: {
      title: 'A deep outline',
      source: `# Root

## A
### A1
#### A1a
##### A1a-i
###### A1a-i-x
- deeper 1
  - deeper 2
    - deeper 3

## B
### B1
### B2

## C`,
    },
  };
};

/**
 * The node types and status words for the "your own node types" sample:
 * people drawn as their initials, with their role in the
 * detail sheet and an Email button, and milestones with a flag, a due date
 * and a Celebrate button that calls `onCelebrate`.
 */
export const createDemoExtensions = (onCelebrate = () => {}) => {
  const paragraph = (text) => {
    const element = document.createElement('p');
    element.textContent = text;
    return element;
  };

  return {
    nodeTypes: {
      person: {
        label: 'Person',
        render(node, element) {
          element.textContent = node.text.split(/\s+/).map((word) => word[0] ?? '').join('').slice(0, 2).toUpperCase();
          element.style.fontSize = '38px';
          element.style.fontWeight = '700';
          element.style.letterSpacing = '0.02em';
        },
        details(node, element) {
          element.append(paragraph(node.attrs?.role ? `Role: ${node.attrs.role}` : 'No role yet'));

          if (node.attrs?.email) {
            element.append(paragraph(String(node.attrs.email)));
          }
        },
        actions: [
          {
            id: 'email',
            label: (node) => `Email ${node.text}`,
            icon: '✉️',
            when: (node) => Boolean(node.attrs?.email),
            run: (node) => window.open(`mailto:${node.attrs.email}`),
          },
        ],
      },
      milestone: {
        label: 'Milestone',
        icon: '🏁',
        color: '#F5C46B',
        tokens: { 'node-stroke': '#B7791F', 'node-stroke-width': '3' },
        details(node, element) {
          element.append(paragraph(node.attrs?.due ? `Due ${node.attrs.due}` : 'No date yet'));
        },
        actions: [{ id: 'celebrate', label: 'Celebrate', icon: '🎉', run: (node) => onCelebrate(node) }],
      },
    },
    statuses: { review: 'active', 'on hold': '#A855F7' },
  };
};
