---
title: Two Sum
description: Fixture problem chapter.
tags: [hash-map]
type: problem
difficulty: easy
companies: [Acme Corp, Globex]
topic: Hashing
updated: 2026-03-05
---

## Problem

Given a list of numbers and a target, return the indices of the two numbers that add up to the target.

## Approach

Store each number's index in a dictionary and look up the complement.

## Solution

```python
def two_sum(nums: list[int], target: int) -> list[int]:
    seen: dict[int, int] = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []
```

## Complexity

- Time: O(n)
- Space: O(n)
