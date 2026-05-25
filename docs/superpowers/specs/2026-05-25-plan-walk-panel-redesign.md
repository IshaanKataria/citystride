# Plan a Walk Panel — Redesign

**Date:** 2026-05-25  
**Status:** Implemented

## Problem

Panel at `w-72` (288px) with tight `p-4` / `space-y-2` spacing felt crowded. Inputs, tabs, and action buttons all competed for space.

## Decision

Option A (floating card) at `w-96` (384px) with generous spacing. No structural change — same search → find → tabs → actions flow.

## Changes

| Property | Before | After |
|---|---|---|
| Width | `w-72` (288px) | `w-96` (384px) |
| Padding | `p-4` | `p-5` |
| Input vertical padding | `py-1.5` | `py-2.5` |
| Vertical gap | `space-y-2` | `space-y-3` |
| Section gap | `mt-3 pt-3` | `mt-4 pt-4` |
| Tab gap | `gap-1` | `gap-1.5` |
| Tab vertical padding | `py-1` | `py-1.5` |
| Action buttons | icon-only + underline text | full-width paired buttons with icons |
| Suggestion item padding | `py-1.5 text-xs` | `py-2 text-sm` |

## Active file

`app/components/map-app.tsx` — inline `PlanWalkPanel` component (lines ~201–295).  
`app/components/planner/plan-walk-panel.tsx` is an unused duplicate.
