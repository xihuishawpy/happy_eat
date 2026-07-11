# Tickets: Mobile product design improvements

These tickets turn the mobile design audit into independently verifiable improvements while preserving the single-family, single-server MVP decisions.

Work the **frontier**: a ticket can start when every ticket listed under **Blocked by** is complete.

## Remove quantity tracking from the available ingredient list

**Status:** `completed`

**What to build:** Make the available ingredient list express presence, category, and cooking status only. Recipe ingredient quantities remain available as cooking references.

**Blocked by:** None - can start immediately.

- [x] Available ingredient responses, editing, and display no longer expose or update quantity values.
- [x] Recipe details and recipe drafts continue to show ingredient quantities.
- [x] Existing SQLite data is preserved without a destructive migration.
- [x] API and mobile browser tests cover the domain boundary.

## Make Today answer what the family can cook

**Status:** `completed`

**What to build:** Put the most useful ready and nearly-ready recipes first on Today, while keeping ingredient updates available through a compact entry point.

**Blocked by:** None - can start immediately.

- [x] A 390px-wide first viewport shows the recipe decision before the full ingredient maintenance form.
- [x] The family can still reach natural-language ingredient updates without leaving Today.
- [x] Full ingredient maintenance remains available from the Ingredients tab.
- [x] The flow works without horizontal overflow at 390px and 320px.

## Improve mobile browsing of the available ingredient list

**Status:** `completed`

**What to build:** Let the family quickly find, filter, and add available ingredients on a phone without scrolling through the full list.

**Blocked by:** Remove quantity tracking from the available ingredient list.

- [x] Ingredient search filters by the normalized ingredient name.
- [x] Ingredient categories remain reachable while scrolling and clearly show the active category.
- [x] Manual add remains easy to reach regardless of list length.
- [x] Search, filtering, editing, and adding work at 390px and 320px with keyboard-visible focus.

## Make recipe import a reviewable draft flow

**Status:** `completed`

**What to build:** Provide one clear import path from source selection through AI extraction, editable draft review, and explicit confirmation into the recipe library.

**Blocked by:** None - can start immediately.

- [x] The import screen has one primary entry point and starts with empty source input.
- [x] Model identifiers and duplicate import actions are not shown to family members.
- [x] Extracted title, ingredients, cooking method, time, and steps can be edited before confirmation.
- [x] Drafts do not participate in recipe matching until confirmed.
- [x] Source tabs expose correct selected state to assistive technology.

## Add search and filters to the recipe library

**Status:** `completed`

**What to build:** Help the family narrow formal recipes by name, ingredient, cooking method, and cooking time while preserving ready and missing-ingredient groupings.

**Blocked by:** Make Today answer what the family can cook.

- [x] Search matches recipe titles and normalized ingredient names.
- [x] Cooking method and time filters can be combined and cleared.
- [x] Ready and missing-ingredient result counts update with the active filters.
- [x] Priority-use messaging remains visible without repeating the same badge on most rows.
- [x] Filter controls reflow without clipping at 390px and 320px.

## Compact the mobile app chrome

**Status:** `completed`

**What to build:** Reduce the vertical space used by family and sync information while keeping navigation state and draft count clear.

**Blocked by:** None - can start immediately.

- [x] Family and sync information fit predictably in the mobile header.
- [x] Sync success, progress, and failure states are truthful and distinguishable.
- [x] Bottom navigation icons, labels, active state, and draft badge stay aligned at 390px and 320px.
- [x] Interactive targets remain at least 40px in both dimensions.

## Add a focused cooking mode

**Status:** `completed`

**What to build:** Let a family member start cooking from a formal recipe and track ingredients and ordered cooking steps without changing shared recipe or ingredient data.

**Blocked by:** Add search and filters to the recipe library.

- [x] A formal recipe detail has a clear start-cooking action.
- [x] Required ingredients and cooking steps can be checked independently during the cooking session.
- [x] Session progress survives closing and reopening the same recipe during the current browser session.
- [x] Cooking progress does not alter the formal recipe or available ingredient list.
- [x] The mode supports keyboard navigation and a 320px viewport without clipped actions.
