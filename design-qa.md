# Design QA

## Evidence

- Reference viewport: `2400 x 1080`, density normalization `1:1`.
- Reference home: `C:/Users/Administrator/AppData/Local/Temp/codex-clipboard-8aa6689b-ae24-450f-87ff-865a4996ba75.jpg`.
- Reference diplomacy: `C:/Users/Administrator/AppData/Local/Temp/codex-clipboard-f33ac164-a507-4952-9374-878d1c7752cb.jpg`.
- Final home: `D:/Github/TangWar/temp/design-qa-home-final-2400x1080.png`.
- Final home (strategy idle): `D:/Github/TangWar/temp/design-qa-home-fix-final-2400x1080.png`.
- Final home (strategy selected): `D:/Github/TangWar/temp/design-qa-home-strategy-final-2400x1080.png`.
- Final diplomacy: `D:/Github/TangWar/temp/design-qa-diplomacy-2400x1080.png`.
- Additional verified states: city administration, intelligence, settings, and the home battle-command panel.

## Comparison history

### Iteration 1 findings

- P1: system pages were translucent enough for map routes, labels, and report badges to compete with page content.
- P1: the top status area and device status-bar area could collide on wide notched devices.
- P2: ornate full-page frames and repeated heavy card borders produced excessive visual weight.
- P2: the home screen had overlapping city labels/cards and a crowded bottom process strip.
- P2: diplomacy, administration, intelligence, and settings lacked consistent information hierarchy and state cues.

### Applied fixes

- Added safe-area-aware top/bottom layout and kept the right command rail flush to the playable edge.
- Made system pages opaque, introduced a true modal mask, and temporarily hid map-stage elements behind them.
- Replaced oversized ornamental frames with restrained dark panels, thin rules, semantic red/green accents, and clearer spacing.
- Removed the redundant Pingyang map marker, simplified the Taiyuan summary card, and condensed campaign progress to five milestones.
- Rebuilt diplomacy cards with status badges and relationship bars; split city administration into city/policy zones; added report types/unread states; rebuilt settings switches and save affordance.
- Retained the existing historical-map art direction while improving contrast, tap-target grouping, and feedback states.

### Iteration 2 result

- Full-page and focused comparisons at `2400 x 1080` show no actionable P0, P1, or P2 visual defect.
- Release preview contains no debug overlay and produced no browser console errors or warnings.
- The only device-dependent P3 check is the exact appearance of transient OEM status icons; native immersive landscape and safe-area offsets are already enabled.

### Iteration 3 findings and result

- P1: the command affordance was visually prominent before a strategy was chosen, while the actual action was unavailable.
- P1: city-policy and diplomacy cards could imply immediate execution without an explicit confirmation step.
- P2: intelligence reports had no compact filter for mixed report types, and transient feedback could sit too close to the campaign timeline.
- Gated long-press command input until a strategy is selected, with a disabled label and visible guidance; selecting a strategy now updates the route, timeline, and order state together.
- Added explicit policy and tribute confirmation affordances, affordability states, and selection summaries so resource-changing actions are intentional.
- Added intelligence filters, unread overflow guidance, and row affordances; moved toast feedback above the timeline to avoid visual collision.
- Rebuilt web preview at `2400 x 1080`, verified idle and selected-strategy states, and observed no browser console errors or warnings.

### Iteration 4 findings and result

- P2: the selected 地形 tool used a high-saturation red fill that visually competed with its icon and could be perceived as covering the control.
- P2: the three 军议策略 cards had icons too close to the card edge, making the circular artwork appear clipped on some render scales.
- Reduced the selected tool to a dark cinnabar surface with a dedicated red accent rail and raised the icon content layer above the button surface.
- Added a 32px icon base, 28px inner artwork, and explicit high z-order to each strategy card; the circular icons now retain a safe inset at the card edges.
- Rebuilt and checked the `2400 x 1080` preview; terrain icon and all three strategy icons are fully visible, and browser console health remains clean.

### Iteration 5 findings and result

- P2: the 部队与将领 page placed the city recruitment summary on the same vertical band as the troop cards, so the summary could be visually covered by card tops.
- P3: settings switches used the uncommon “启/止” labels and a tight knob, reducing scanability at landscape scale.
- Moved the army summary, general heading, and assigned-general status into a dedicated header row; shifted troop cards and general rows down with preserved bottom clearance.
- Refined settings switches with a larger touch target and natural “开/关” labels while keeping the existing immediate-apply behavior.
- Rebuilt and checked army, strategy, and settings pages at `2400 x 1080`; no clipping or overlap remained and browser console health stayed clean.

### Iteration 6 findings and result

- P2: the map route used a thick red curve with rectangular dash segments that did not follow the curve, creating a harsh and imprecise selection effect.
- P2: city selection used a single oversized pulsing circle, while the danger area used a high-saturation breathing fill.
- Reworked routes into layered dark-underlay, glow, and rounded main strokes; marching particles now sample the Bézier curve and an arrowhead clarifies the destination.
- Replaced single-circle selection pulses with restrained double-ring reticles and four-corner registration marks; softened the danger-area fill and added a fine outline.
- Rebuilt and checked idle/selected map states at `2400 x 1080`; route animation, target reticles, and strategy interaction render cleanly with no browser console errors.

### Iteration 7 findings and result

- P2: the war transition relied on a single moving unit and one flash, so command execution felt static outside the map route.
- Added strategy-specific battlefield motion: escort formation, swaying banners, arrow volleys, impact sparks, expanding dust, and layered road treatment.
- Raid, defense, and pacify commands now use distinct visual feedback while preserving skip/reveal controls.
- Rebuilt and checked the animation preview at `2400 x 1080`; no browser console errors.

## Fidelity surfaces

- Typography: consistent hierarchy for page title, card title, data, and helper copy; no clipped text in verified states.
- Spacing: aligned grids, predictable gutters, edge-safe header/rail, and unobstructed bottom controls.
- Color: gold is reserved for hierarchy/actions, red for selection/threat, green for positive status; backgrounds remain high-contrast.
- Imagery: historical map and commander portrait remain focal assets without interfering with system pages.
- Copy and icons: all actions retain clear labels and directional affordances; state changes have visible feedback.
- Interaction: home commands, page navigation, settings toggles, save, reports, city policies, and diplomacy actions were exercised in preview.
- Responsiveness: verified at default desktop preview and the target `2400 x 1080` landscape reference.

final result: passed
