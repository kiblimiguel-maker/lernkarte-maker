# wortwerk workspace redesign — verification

## Structure and interaction

- Persistent desktop navigation: library, recent learning, subjects, donations and settings.
- Compact mobile navigation drawer with focus containment, Escape/backdrop close, inert background and a labelled account disclosure.
- Contextual creation/import actions and management disclosures in subjects, folders and sets.
- Nested folders use `parentId`; complete ID-based breadcrumb paths and parent-aware back navigation.
- Sorting mode exposes pointer drag handles, insertion markers and labelled earlier/later buttons. Drag handles support pointer events; arrow buttons also support touch and keyboard.
- Positions are stored per sibling scope in the existing `data` JSON records. Existing Supabase tables, composite user keys and RLS are retained. No migration or permission expansion is needed.
- Loading assigns stable positions to legacy data. New/reparented content appends to its destination. Reordering never changes subject/folder assignments, card IDs, card contents or learning records.
- The card palette catalogue, gender tokens, flip and two-slot swipe timing remain separate from the workspace visual system.

## Defects corrected during verification

- Valid import previews threw when no error rows existed (`querySelector(...).length`). The action now switches to “Lernkarten erstellen”.
- Recent-learning list buttons were rejected by the nested-button click guard.
- The entity form's secondary Cancel button lacked its click handler.
- New ordering positions are assigned on creation and folder reparenting; changing views exits sorting safely.
- Disabled primary controls no longer inherit enabled hover styling.

## Automated checks

Passed `npm test`, `npm run build`, `git diff --check`, and `npm audit --omit=dev` (zero reported production dependency vulnerabilities).

New model/repository cases cover subject/folder/subfolder/set sorting, repeated reorder operations, rejected cross-scope moves, legacy positions, destination append, JSON and database-row roundtrips, user-scoped records, unchanged IDs/content/progress, invalid folder parents and cycles. Existing parser, learning-session, presentation, card-theme and donation tests also pass, including large import batches.

## Browser verification

Used the actual app markup, styles and modules in a disposable local fixture with separate test-user storage. Test scaffolding is excluded from Git and the production build. Creation, import and learning interactions used only disposable data. A separate production sorting smoke test is recorded below.

Layouts were inspected at 1280px, 834px, 390px and 320px viewport widths. The following flows were exercised on desktop or the 390px viewport:

- Library, subject, nested folder and set navigation.
- Sorting via arrow controls; pointer drag-and-drop; ordering retained after a new page load.
- Focus returns to the moved item. Mobile navigation is removed from the tab order when closed.
- Optional set name creates “Lernstapel 1”; empty card state and Cancel work.
- Import preview and creation of two cards including `((example sentence))`.
- Study front/back, keyboard flip, known rating, next slot, back navigation and shuffle.
- All ten theme options can be selected; original design remains available and selected by default.
- Settings previews, mobile donations and the real signed-out login presentation.
- No document-width overflow in the checked library layouts at 320px and 834px.

## Production smoke test

Production deployment of implementation commit `5d823b1` reached READY. The actual signed-in library loaded successfully with its 3 sets and 400 cards. One set was moved one place, the successful save was awaited, and the changed order survived a complete reload from Supabase. The original order was then restored and confirmed after another full reload. No cards were created, edited, rated or removed in production. Browser error logs for this live test were empty; the initial deployment runtime error scan returned no errors.

## External verification and limits

The deployed database's `subjects`, `folders` and `sets` tables have RLS enabled with `auth.uid() = user_id` in both USING and WITH CHECK. This was a read-only inspection; no production schema or payment data was modified.

Full Google OAuth login/logout, two real user accounts performing remote writes, real-device touch hardware, and Stripe Checkout/webhook end-to-end payments were not exercised. The donation backend was already unavailable in production; this redesign does not configure payment credentials. The existing library repository saves a snapshot across several table requests, not a single database transaction. Failed saves show an error; no atomic database rollback is claimed.

Reference reviewed: https://www.apple.com — restrained navigation, clear hierarchy, focused actions and controlled spacing, translated to a learning workspace rather than a storefront.

## Library organisation and colour update — 2026-11-04

Subject tiles now use the saved colour at full strength, with black or white text selected by relative luminance. The French subject icon uses a crisp rounded tricolour, while custom emoji selections remain available. Folder symbols are scalable vector silhouettes, coloured independently from subjects. Twelve saturated presets and a native colour picker plus validated hex field are shared between subject and folder forms.

Sets optionally store `cardThemeId` in their existing JSON record. Missing or invalid overrides use the global setting. Covers preview the set palette; starting study applies that set's palette, and ending restores the global palette. Moving never changes the palette or gender highlighting.

`canMoveLibraryItem` and `moveLibraryItem` separate membership changes from sibling reordering. Shared validation rejects missing targets, cross-subject moves, self moves and folder cycles. Drop feedback and committed moves use the same guard. Moves append to the target's saved ordering and retain card/session references. No database migration, authentication change, dependency or permission expansion was required.

The UI supports dedicated drag symbols, destination outlines, a drag label, Escape/pointer-cancel cleanup, edge scrolling and drop targets in folder tiles, the sidebar tree and the location path. The same operations are available through each item's actions menu and an accessible native destination selector. Existing sibling ordering still has its own grips and arrow controls.

Browser checks on disposable local data passed:

- Set dragged from subject root into a folder; order and location preserved after reload.
- Set moved between folders through its menu, then dragged back to the subject-level path.
- Folder moved into another folder through the mobile dialog; child counts updated.
- Native colour input and custom hex synchronized; folder colour survived save/reload.
- Set-specific Sky Mint design applied in study; global Original restored on exit.
- Deliberately failed move restored membership; deliberately failed colour save kept entered values open with an inline error and retained the original record colour.
- Desktop and 390px mobile layouts visually inspected; independent model/repository/theme/contrast tests cover ID, content, progress and user-namespace preservation.

No real payment, learner content deletion or production reorganisation was used for these tests. Physical iPhone touch hardware and two simultaneous authenticated accounts were not tested. The repository's existing multi-request snapshot save is retained; failures do not claim an atomic database rollback.

## Library polish and subject disclosure — 2026-11-04

Large subject surfaces now use a restrained 80% blend of the saved colour with a dark neutral. This keeps the full-colour identity without the previous luminous green. The stored colour and small sidebar markers stay unchanged. Black or white ink is calculated against the actual rendered surface; contrast checks cover all presets and custom light/dark values.

The sorting footer's `flex-basis: 100%` was incorrectly reserving a whole card height in the vertical set layout. It now has intrinsic, non-growing height, while full-width wrapping is scoped to folder rows. Handles and arrow targets are 44px, decorative move handles leave the tab/accessibility order during sorting, and the subject navigation arrow remains hidden in sorting mode.

Sidebar subjects now have independent disclosure state. Initially only subjects appear. Opening a subject reveals its folder hierarchy; clicking the selected subject again collapses it. A labelled chevron can expand/collapse any subject without navigating. Hidden folder lists leave the keyboard and accessibility tree. Mobile chevron actions keep the navigation drawer open; selecting a folder closes it.

Local browser checks used disposable data and the real app modules/styles:
- Opening, collapsing and independently expanding another subject via keyboard, without changing the current page.
- Nested-folder navigation and mobile drawer behaviour.
- Sorting a set, reloading, and confirming the saved order and unchanged card counts.
- Folder, subject and set sorting footer containment; 44px targets; no horizontal overflow at 390px and 320px.
- Desktop, 834px tablet and 390px smartphone screenshots inspected; no browser console errors observed. Subject navigation arrows are confirmed hidden in sorting mode, with controls inside the tiles. The 320px layout also has no document overflow.

Automated tests, Production build, `git diff --check`, and production dependency audit passed (zero vulnerabilities). No database schema, authentication, payments, study timing or card data changes were required. Real-device touch hardware was not tested.

## Lernkarten Maker branding and card-design selection — 2026-11-04

- The public product name is now **Lernkarten Maker** in the browser title, navigation, sign-in view, donation copy and Stripe Checkout product text. Technical theme IDs, storage keys, Stripe metadata and database table names remain stable for existing data and payment events.
- The redundant location and drop-target bar is removed from subject and folder pages. Folder tiles, the sidebar tree, breadcrumbs and the existing Move menu/dialog still provide navigation and valid drop targets.
- Subject tiles retain the saved colour and accessible computed ink, with more restrained proportions, a plain icon treatment and a quieter arrow. No subject colour or card data is rewritten.
- Set creation and editing use a native radio grid with the global-inheritance option and all ten existing card designs. Each option previews both card faces using the existing theme tokens and French gender highlighting. Selection is a draft until Save; Cancel discards it. The chosen set override survives reload, and selecting inheritance clears the override.
- Desktop and local browser checks at 390px and 320px confirmed no dialog or document horizontal overflow, accessible keyboard radio selection, visible Save/Cancel controls, and correct persistence after Save and reload. A signed-out browser view confirmed the new name on the real login screen. Dragging a set to a sidebar folder and back to its subject root still worked with the removed bar.
- `npm test`, `npm run build`, `git diff --check` and `npm audit --omit=dev` passed; the production dependency audit reported zero vulnerabilities. The browser checks used disposable local data. Stripe payments, Google sign-in and physical touch hardware were not exercised for this design change.
