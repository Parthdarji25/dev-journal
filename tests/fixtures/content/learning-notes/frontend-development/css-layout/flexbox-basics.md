---
title: Flexbox basics
description: Fixture note chapter covering every markdown feature.
tags: [css, layout]
updated: 2026-03-02
---

Flexbox lays items out along one axis.

![Main and cross axis](assets/flex-axis.svg '640x320')

## Main axis

The main axis follows `flex-direction`.

```css
.row {
  display: flex;
  gap: 8px;
}
```

> [!TIP]
> Use `gap` instead of margins between items.

### Alignment

| Property        | Axis  |
| --------------- | ----- |
| justify-content | main  |
| align-items     | cross |

## Cross axis

> [!WARNING]
> `align-content` only applies when items wrap.

<script>alert('raw html is never rendered')</script>

Read the [grid playground](/learning-notes/frontend-development/css-layout/grid-playground) next, or see the [roadmap](/roadmap/frontend-development).
