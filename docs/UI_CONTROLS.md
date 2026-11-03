# Drawic UI controls

Import controls from `src/renderer/ui.tsx`. The production shell and the browser preview mount the same `AppTheme` in `App.tsx`. Menus and dialogs inherit it through their Radix portals. Mount a theme around isolated component tests as well.

| Change | Where |
| --- | --- |
| Change the accent, gray palette, radius, or density of ordinary controls | Edit the props on `AppTheme` in `src/renderer/ui.tsx`. Use `scaling` for density. |
| Change the current light/dark preference | Use the title-bar toggle. `App.tsx` resolves the saved preference and system appearance with `theme.ts`. |
| Change a panel or shell surface | Use the semantic chrome variables in `appearance.css`. Paper, device art, Net colors and SVG export belong to the drawing. |
| Arrange controls or change title-bar hit targets | Use `styles.css`. Window controls share the same geometry as the theme button. `workspace.css` and `deviceCatalog.css` occupy the lower-priority workspace CSS layer. |

Use `Button` for actions and `IconButton` with an accessible name for icon-only actions. The shared button defaults to neutral and soft. Use `variant="solid"` for the primary or selected action, `color="red"` for destructive actions, and `aria-pressed` for toggles. Keep action handlers, disabled state, form submit behavior and platform window operations at the call site.

Use `TextField.Root` for text, search and numeric entry, `TextArea` for multiline text, and `Checkbox` for booleans. Put a search icon inside `TextField.Slot`. Give each field an associated label. Use `FilterSelect` for a labelled list of choices. Use the shared coordinate menu in `components/ContextMenu.tsx` for right-click actions originating in canvas hit testing or page tabs. For a DOM trigger use `ContextMenu.Root` and `ContextMenu.Trigger` directly.

Use `Dialog` for forms and settings and `AlertDialog` for confirmations. Supply a title, wire Escape to the same cancel path as the visible button, and use `AlertDialog.Cancel` for initial focus on the safe choice. Scoped tests should query the document for portal content. Full-screen device workspaces continue to expose the desktop title bar.

Keep document-painted swatches, the native system color picker, SVG handles, and in-place SVG text editing local. The inspector's continuous range control groups pointer and keyboard previews into one undo operation. Ordinary buttons next to these controls still use the shared UI.

Run `npm test` for the control inventory and behavior tests. After a visual change, run `npm run build` followed by `npm run test:theme:desktop`. Exercise both themes, keyboard dismissal, narrow windows and portalled content. Check title-bar button geometry on platforms with renderer-drawn window controls. Changes to the native-element exceptions in `tests/sharedControls.test.ts` should have a specific drawing interaction and a matching test.
