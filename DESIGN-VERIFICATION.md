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

Used the actual app markup, styles and modules in a disposable local fixture with separate test-user storage. Test scaffolding is excluded from Git and the production build. No production learner data was changed.

Verified at 1280px, 834px, 390px and 320px viewport widths:

- Library, subject, nested folder and set navigation.
- Sorting via arrow controls; pointer drag-and-drop; ordering retained after a new page load.
- Focus returns to the moved item. Mobile navigation is removed from the tab order when closed.
- Optional set name creates “Lernstapel 1”; empty card state and Cancel work.
- Import preview and creation of two cards including `((example sentence))`.
- Study front/back, keyboard flip, known rating, next slot, back navigation and shuffle.
- All ten theme options can be selected; original design remains available and selected by default.
- Settings previews, mobile donations and the real signed-out login presentation.
- No document-width overflow in the checked library layouts at 320px and 834px.

## External verification and limits

The deployed database's `subjects`, `folders` and `sets` tables have RLS enabled with `auth.uid() = user_id` in both USING and WITH CHECK. This was a read-only inspection; no production schema or payment data was modified.

Full Google OAuth login/logout, two real user accounts performing remote writes, real-device touch hardware, and Stripe Checkout/webhook end-to-end payments were not exercised. The donation backend was already unavailable in production; this redesign does not configure payment credentials. The existing library repository saves a snapshot across several table requests, not a single database transaction. Failed saves show an error; no atomic database rollback is claimed.

Reference reviewed: https://www.apple.com — restrained navigation, clear hierarchy, focused actions and controlled spacing, translated to a learning workspace rather than a storefront.
