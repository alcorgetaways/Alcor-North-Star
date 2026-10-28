# Task tracker redesign (inspired by the screenshot)

Applies to the two task trackers staff use every day: **My Tasks** and the **Action Tracker**. Only the look and layout change. Nothing changes about who sees which tasks, task rules (Gate A lock, client approval, evidence before closing), or stored data.

## What we take from the screenshot
- A count strip at the top: one number per card, with a share of the total.
- A **List / Board** switch: today's table, or columns of small task cards.
- A progress bar on each task, colour-coded by status.
- Clear, consistent coloured chips for priority and status, plus a small legend.
- Owner initials in a small circle on each card.

What we leave out (it doesn't fit North Star): the big poster-style header and the "quick notes" box.

## My Tasks
1. **Count strip** (MetricCards): Total, Overdue, Due this week, Waiting on client, Done this month, each with its % of total. Clicking a card filters the list.
2. **List / Board switch** (sliding pill, remembered per person on this device).
   - **List:** today's groups (Overdue, This week, Waiting on client, Later, Done). Each row gets a status chip, a small progress bar and the hotel name.
   - **Board:** columns Overdue | This week | Waiting on client | Later | Done, each with a count badge. Each card shows the task code and name, the hotel, the due date, a "Locked: Gate A" tag when locked, and a progress bar. Clicking a card opens the existing task panel. The Done column shows the latest 5 plus "View all".
3. Recurring duties and blocked tasks move into a compact strip below the main content rather than above it. "Loading…" text becomes loading placeholders.

## Action Tracker
1. **Count strip:** Open, High priority, Overdue, Completed this month, Dropped.
2. **List / Board switch.**
   - **List:** today's table, with clearer priority chips (High red, Medium amber, Low green) and status chips.
   - **Board:** one column per priority (High / Medium / Low), plus Completed. The column header shows the count and each card shows the owner's initials. Moving a card to Completed or Dropped uses the existing dialog (evidence or reason still required). The "+ Add action" button sits at the bottom of each priority column and opens the existing form with that priority preselected.
3. Status changes use the confirm button (tick on success, message on error).

## Shared pieces
- **TaskCard:** code, title, hotel, due date, initials circle, progress bar, chips.
- **BoardColumn:** coloured header with a count badge and a scrollable list.
- **StatusChip / PriorityChip:** one colour map for the whole app, plus a small legend under the board.
- Progress per task comes from data already on the screen: done = 100%, waiting on client = 75%, in progress = 50%, not started = 0%. No new stored field is added.
- Mobile (390px): the board scrolls sideways one column at a time; the count strip becomes two cards per row.
- Navy / white / gold design tokens; status colours use the existing success, warning and destructive tokens.

## Checks
- Small tests for the progress mapping, the count strip totals and the column grouping.
- Re-run access_rls and assignments_rls to prove each person still sees only their own tasks.
- Screenshots of both pages, List and Board, at desktop and mobile.

## Technical notes
- New files: src/components/tasks/{TaskCard,BoardColumn,TaskChips}.tsx and src/lib/task-board.ts (pure grouping, progress and counts, with tests).
- Edited: src/routes/_authenticated/my-tasks.tsx and src/routes/_authenticated/actions.tsx. Same queries; no database changes.
- The List/Board choice is kept in browser storage and read after the page loads, so it never mismatches on first render.
- Board drag-and-drop is not included in this pass. Status still changes through the card menu, so all existing checks keep running.
