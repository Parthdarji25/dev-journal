/**
 * Starter text for a new item (front-matter without the title, then the
 * body), per section and, for notes, per track. These are editor
 * scaffolding only: nothing is written to the repository until the author
 * commits.
 */
import type { SectionSlug } from '@/lib/schema/meta';

const NOTE = `---
description: ''
tags: []
---

Introduce the topic in a sentence or two.

## Key ideas

- First idea
`;

const PROBLEM = `---
type: problem
difficulty: easy
companies: []
topic: ''
tags: []
---

## Problem

Describe the problem and its input and output.

## Approach

Explain the idea behind the solution.

## Solution

\`\`\`python
def solve():
    pass
\`\`\`

## Complexity

- Time: O(n)
- Space: O(1)
`;

const CASE_STUDY = `---
type: case-study
description: ''
tags: []
---

What this case study designs, in one paragraph. Every H2 section below is one step.

## Requirements

Functional and non-functional requirements.

## High-level design

The main components and how they talk to each other.

## Deep dive

The interesting parts in detail.

## Trade-offs

What was chosen, and what it costs.
`;

const MIND_MAP = `# Root topic

## Branch

- Leaf
- Another leaf
`;

const QUESTION = `---
difficulty: medium
companies: []
tags: []
---

Write the answer here.
`;

const CHEAT_SHEET = `---
description: ''
---

## Group name

| Code | What it does |
| --- | --- |
| \`example()\` | What it does |
`;

const ROADMAP = `1. **First step** - One-line description.
2. **Second step** - One-line description.
`;

const RESOURCES = `- [Official documentation](https://example.com) - type: docs - Why it is worth reading.
`;

/** The starter text for a new item in `section` (and `track`, for notes). */
export function templateFor(section: SectionSlug, track: string): string {
  switch (section) {
    case 'learning-notes':
      if (track === 'dsa-python') return PROBLEM;
      if (track === 'system-design') return CASE_STUDY;
      return NOTE;
    case 'mind-maps':
      return MIND_MAP;
    case 'interview-questions':
      return QUESTION;
    case 'cheat-sheets':
      return CHEAT_SHEET;
    case 'roadmaps':
      return ROADMAP;
    case 'resources':
      return RESOURCES;
  }
}
