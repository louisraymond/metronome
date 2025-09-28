# Practice Plan Scheduling Feature

## User Stories

- As a pianist, I want to assemble a practice plan containing multiple exercises so I can move through them without reconfiguring the metronome manually.
- As a pianist, I want each exercise to store tempo targets (start, goal, increment) and loop settings (bars or time) so the speed trainer can configure itself automatically when the exercise begins.
- As a pianist, I want to include "text-only" exercises that simply instruct me what to practice without loading any MIDI so that custom drills are supported.
- As a pianist, I want to optionally associate a built-in MIDI track with an exercise so that accompaniment switches automatically when I change exercises.
- As a pianist, I want to mark exercises as complete or skipped to track progress within a session.
- As a pianist, I want to reorder exercises and save/load practice plans so I can reuse them across sessions.
- As a pianist, I want an easy way to navigate between the main metronome screen and my plans without cluttering the interface, so a hamburger menu or navigation drawer would be helpful.

## High-Level Flow

1. **Navigation UI**
   - Introduce a hamburger/menu icon on the existing UI.
   - Clicking opens a drawer with links: "Metronome" (current view) and "Practice Plans".
2. **Practice Plans Page**
   - List saved plans; allow creating a new plan.
   - Each plan consists of ordered exercises.
   - Selecting a plan shows exercises with edit/delete/duplicate controls.
   - "Launch" button pushes the plan to the metronome view and queues the exercises.
3. **Exercise Schema**
   - `type`: `midi` or `note`.
   - `label`, `notes` (rich text or simple string).
   - `tempo`: `start`, `target`, `increment` (BPM), `loopMode` (`bars|time`), `stepBars`, `stepDurationSec`.
   - Optional `midiReference` referencing existing built-in library ID or uploaded file.
   - Optional `durationGoal` (minutes) for note-only exercises.
4. **Runtime Behaviour**
   - When a plan is launched, the first exercise loads and the metronome view reflects its settings.
   - A queue controller exposes `next`, `previous`, `complete`, `skip`.
   - Completing an exercise moves to the next; reaching the end loops or stops based on user setting.
   - State stores progress for current session; optionally persist between visits.

## Implementation Plan (Test-Driven Phases)

### Phase 1: Plan Data Schema & Loader
1. **Tests**
   - `practicePlans.test.js`: verify we can load predefined plan JSON files from `assets/plans/`, parse them into exercises, and export them back to JSON.
   - Ensure exercises capture tempo settings, optional MIDI references, and arbitrary notes.
2. **Implementation**
   - ✅ `app/practicePlans.js` handles parsing, loading via manifest (with tests for these paths), and exporting JSON.

### Phase 2: Plan Navigation Shell
1. **Tests**
   - Unit tests verifying the menu toggles visibility and navigation state persists (mock DOM or view controller).
   - If UI testing is heavy, at least ensure router/view controller exposes required methods.
2. **Implementation**
   - Add a lightweight view controller (`app/router.js`) toggling between `metronome` and `practicePlans` views.
   - Update main entry to render/hide appropriate sections based on route.

### Phase 3: Practice Plans Page Components (Read-only)
1. **Tests**
   - Verify plan list renders entries from store and selecting a plan loads exercises.
   - Test that exporting a loaded plan returns the same JSON structure.
2. **Implementation**
   - Build `practicePlansView.js` to render plan list, detail view, and exercise summaries (no editing yet).
   - Provide buttons to load a plan into the queue and to download/export a JSON copy.
   - Integrate built-in MIDI library for display only.

### Phase 4: Integration with Metronome Engine
1. **Tests**
   - `practiceQueue.test.js`: ensure queue transitions call injected callbacks (`loadMidi`, `configureSpeedTrainer`, etc.).
   - Simulate completion/skip events verifying state moves to next exercise and loop settings applied.
2. **Implementation**
   - Create `app/practiceQueue.js` managing active exercise index and applying settings via existing API hooks (`setTempo`, `setMidiTrack`, `setMidiEnabled`, etc.).
   - Add controls in the metronome view (next/previous/complete buttons) that interact with the queue.
   - Ensure exercises with no MIDI disable accompaniment and just configure tempo/loop.

### Phase 5: UX Polish & Persistence
1. **Tests**
   - Verify queue progress persists between reloads if desired (optional).
   - Test completion flags update store correctly.
2. **Implementation**
   - Add progress indicators, done checkboxes, and optional timers.
   - Provide export/import (JSON) for sharing practice plans.

### Stretch Goals
- Allow nested sections or superset workouts.
- Attach external resources (links, PDFs) to exercises.
- Provide analytics (time spent per exercise, tempo attainment).

## Dependencies & Considerations
- Keep new modules in `app/` with ES module exports (aligned with existing structure).
- Avoid large libraries; use vanilla JS for forms, or evaluate a minimal state manager if complexity grows.
- Ensure new CSS respects existing design tokens.
- Update documentation (`notes.md` or new `docs/`) with plan usage instructions once implemented.
- Consider feature flags to hide unfinished UI during development.

## Next Steps
1. Implement Phase 1 tests and store.
2. Build navigation shell & placeholder plan view.
3. Iterate through phases, keeping tests green after each.
