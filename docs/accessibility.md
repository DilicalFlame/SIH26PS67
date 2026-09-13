# Thalassa — Accessibility Statement

## Overview
Thalassa aims to meet WCAG 2.1 Level AA for all
interactive panels and controls. This document
describes what is accessible and what is not.

## Accessible components

### Projection selector (Globe / Map bar)
- Fully keyboard navigable via Tab and Enter
- Each button has aria-pressed indicating active state
- Labels visible at all viewport sizes above 480px

### Heading control (compass rose)
- Focusable via Tab (tabindex="0")
- role="slider" with aria-label
- Keyboard support: Arrow keys rotate the globe
- Right-click context menu closable with Escape

### Status bar
- Location, altitude, and scale bar have title attributes
- Screen reader can access static values

### Data table alternative
- GlobeDataTable component provides tabular access
  to all active data layers
- Uses proper table semantics with scope, caption,
  and describedby attributes

## Known limitations

### WebGL Globe canvas
The 3D globe is rendered entirely in WebGL. It cannot
be meaningfully navigated by screen reader. This is a
fundamental technical constraint of 3D canvas rendering.

**Mitigation:** The GlobeDataTable component provides
an accessible alternative showing all active data layers
in a structured HTML table.

### Dynamic data updates
Real-time coordinate and altitude updates in the status
bar are written imperatively to the DOM and may not be
announced by all screen readers.

## Contrast
All text elements meet WCAG AA minimum contrast ratio
of 4.5:1 against their backgrounds.

## Keyboard navigation summary

| Component | Keys |
|-----------|------|
| Projection buttons | Tab, Enter, Space |
| Heading control | Tab to focus, Arrow keys to rotate |
| Context menu | Escape to close |

## Scope statement
The following are outside accessibility scope
of this release, as documented in issue #240:

- WebGL globe canvas (mitigated by data table)
- Paper authoring editor (not yet implemented)
- Plugin-contributed UI (not yet implemented)