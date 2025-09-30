# Practice Plan Scheduling Feature

## User Stories

- As a pianist, I want to assemble a practice plan containing multiple exercises so I can move through them without reconfiguring the metronome manually.
- As a pianist, I want each exercise to store tempo targets (start, goal, increment) and loop settings (bars or time) so the speed trainer can configure itself automatically when the exercise begins.
- As a pianist, I want to include "text-only" exercises that simply instruct me what to practice without loading any MIDI so that custom drills are supported.
- As a pianist, I want to optionally associate a built-in MIDI track with an exercise so that accompaniment switches automatically when I change exercises.
- As a pianist, I want to create, duplicate, edit, and delete practice plans so the library stays aligned with my goals (even if persistence is mocked locally for now).
- As a pianist, I want every practice plan to surface its four sections (Fundamentals, Out of Context, Tunes, Interacting With History) so I can balance the session intentionally.
- As a pianist, I want to mark exercises as complete or skipped to track progress within a session.
- As a pianist, I want an "In Session" view that keeps the metronome visible while showing my current exercise, overall progress, and upcoming items once I start a plan.
- As a pianist, I want each exercise – and the entire session – to display clear time estimates so I can budget my practice window.
- As a pianist, I want the tempo tools to support both ranges (start/target/increment) and fixed BPM presets per exercise.
- As a pianist, I want to adjust or override tempo settings on the fly during a practice session without permanently altering the saved plan.
- As a pianist, I want to reorder exercises and save/load practice plans so I can reuse them across sessions.
- As a pianist, I want an easy way to navigate between the main metronome screen and my plans without cluttering the interface, so a hamburger menu or navigation drawer would be helpful.

## High-Level Flow

1. **Navigation UI**
   - Introduce a hamburger/menu icon on the existing UI.
   - Clicking opens a drawer with links: "Metronome" (current view) and "Practice Plans".
2. **Practice Plans Page**
   - List saved plans; allow creating a new plan.
   - Each plan consists of ordered exercises grouped beneath the four fixed sections.
   - Selecting a plan shows section headers, exercise summaries, per-activity duration estimates, and totals.
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
   - While a plan is running, the metronome screen renders a progress rail showing completed exercises, the active item (with remaining estimate), and the upcoming queue.
   - State stores progress for the current session; optionally persist between visits.

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
   - Verify plan list renders entries grouped under the four section headers and selecting a plan updates the detail panel.
   - Test that exporting a loaded plan returns the same JSON structure and that per-section + total time estimates are computed correctly.
2. **Implementation**
   - Build `practicePlansView.js` to render section headers, exercise summaries, and per-plan totals (no editing yet).
   - Provide buttons to load a plan into the queue and to download/export a JSON copy.
   - Integrate built-in MIDI library for display only and surface time estimates beside each activity.

### Phase 4: Practice Plan Management (CRUD)
1. **Tests**
   - Editor tests covering creation of new plans, duplication of existing ones, editing/deleting (mocked via local storage), and validation of tempo fields (range vs. fixed BPM).
   - Ensure plan mutations trigger re-render of section summaries and totals without losing grouping.
2. **Implementation**
   - Extend `practicePlansView.js` with an inline editor, leveraging mocked persistence helpers in `practicePlans.js` (local storage shim for now).
   - Support fixed-BPM toggles, range inputs, MIDI selection, and per-section activity management (add/remove/reorder minimal functionality).
   - Wire new callbacks in `app/main.js` to refresh the plan list and keep the metronome library in sync after CRUD operations.

### Phase 5: Session Queue & Metronome Integration
1. **Tests**
   - `practiceQueue.test.js`: ensure queue transitions call injected callbacks (`loadMidi`, `configureSpeedTrainer`, etc.) and maintain section-aware progress metadata.
   - Simulate completion/skip events verifying state moves to next exercise, updates elapsed time, and handles empty sections gracefully.
   - UI tests (DOM-oriented) verifying the "In Session" overlay shows metronome controls, current exercise, remaining/elapsed time, and the progress rail.
2. **Implementation**
   - Create `app/practiceQueue.js` managing active exercise index, section metadata, and applying settings via existing API hooks (`setTempo`, `setMidiTrack`, `setMidiEnabled`, etc.).
   - Add controls in the metronome view (next/previous/complete buttons) plus a collapsible progress panel that co-exists with the existing metronome + speed trainer cards.
   - Ensure exercises with no MIDI disable accompaniment and just configure tempo/loop while still reporting realistic time estimates.
   - Provide computed per-exercise and overall time estimates based on stored durations and loop rules.

### Phase 6: UX Polish & Persistence
1. **Tests**
   - Verify queue progress persists between reloads if desired (optional).
   - Test completion flags update store correctly.
2. **Implementation**
   - Persist plan progress, including the last completed section and elapsed time, between reloads.
   - Add richer analytics (e.g., actual vs. estimated time) once the session queue is stable.
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
