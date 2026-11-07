/**
 * Background paint resolution (PRD F5). One parametric source of truth:
 * the DOM preview turns it into CSS strings, the canvas and (M2) SVG
 * exporters draw from the same numbers, so all paths stay identical.
 * Pure TS — unit-tested in tests/background.test.ts.
 */
import type { StyleConfig } from './protocol'

export type BackgroundPaint =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; colorA: string; colorB: string; angle: number }
  | { type: 'grid'; color: string; lineColor: string; spacing: number; thickness: number }
  | { type: 'dots'; color: string; dotColor: string; spacing: number; radius: number }

/** v1 constants — deliberately fixed to avoid config explosion (plan §二). */
export const GRID_SPACING = 24
export const GRID_THICKNESS = 1
export const DOTS_SPACING = 24
export const DOTS_RADIUS = 1.5
/** Alpha of the auto-derived grid/dot/watermark overlay color. */
export const OVERLAY_ALPHA = 0.14

/**
 * Perceived luminance 0..1 of a CSS color; null when the format is not
 * understood (named colors etc.). Supports #rgb / #rrggbb and rgb()/rgba().
 */
export function colorLuminance(color: string): number | null {
  const c = color.trim().toLowerCase()
  let r: number, g: number, b: number
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c)
  if (hex) {
    const h = hex[1]
    if (h.length === 3) {
      r = parseInt(h[0] + h[0], 16)
      g = parseInt(h[1] + h[1], 16)
      b = parseInt(h[2] + h[2], 16)
    } else {
      r = parseInt(h.slice(0, 2), 16)
      g = parseInt(h.slice(2, 4), 16)
      b = parseInt(h.slice(4, 6), 16)
    }
  } else {
    const fn = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(c)
    if (!fn) return null
    r = Number(fn[1])
    g = Number(fn[2])
    b = Number(fn[3])
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * Subtle overlay that stays visible on the given background: dark text-tone
 * on light backgrounds, light on dark. Unparseable colors are treated as
 * dark (developer palettes skew dark, and the default editor bg is #1e1e1e).
 */
export function contrastOverlay(bg: string): string {
  const lum = colorLuminance(bg)
  const light = lum === null ? false : lum >= 0.5
  return light
    ? `rgba(0, 0, 0, ${OVERLAY_ALPHA})`
    : `rgba(255, 255, 255, ${OVERLAY_ALPHA})`
}

/** Resolve the active paint from style knobs. Transparent handling stays
 *  with the renderers: they skip painting entirely when the user asked for
 *  a transparent background. */
export function resolveBackgroundPaint(style: StyleConfig): BackgroundPaint {
  switch (style.backgroundType) {
    case 'gradient':
      return {
        type: 'gradient',
        colorA: style.gradientColorA,
        colorB: style.gradientColorB,
        angle: style.gradientAngle,
      }
    case 'grid':
      return {
        type: 'grid',
        color: style.backgroundColor,
        lineColor: contrastOverlay(style.backgroundColor),
        spacing: GRID_SPACING,
        thickness: GRID_THICKNESS,
      }
    case 'dots':
      return {
        type: 'dots',
        color: style.backgroundColor,
        dotColor: contrastOverlay(style.backgroundColor),
        spacing: DOTS_SPACING,
        radius: DOTS_RADIUS,
      }
    default:
      return { type: 'solid', color: style.backgroundColor }
  }
}

/** CSS background shorthand for the DOM preview stage. */
export function cssPaintString(paint: BackgroundPaint): string {
  switch (paint.type) {
    case 'solid':
      return paint.color
    case 'gradient':
      return `linear-gradient(${paint.angle}deg, ${paint.colorA}, ${paint.colorB})`
    case 'grid': {
      const line = `linear-gradient(to right, ${paint.lineColor} ${paint.thickness}px, transparent ${paint.thickness}px), linear-gradient(to bottom, ${paint.lineColor} ${paint.thickness}px, transparent ${paint.thickness}px)`
      return `${line}`
    }
    case 'dots':
      return `radial-gradient(circle, ${paint.dotColor} ${paint.radius}px, transparent ${paint.radius}px)`
  }
}

/**
 * CSS-compatible background-size values (per layer) for tiled paints.
 * Order matches cssPaintString's layers; solid/gradient return [] (no tiling).
 */
export function cssPaintSizes(paint: BackgroundPaint): string[] {
  switch (paint.type) {
    case 'grid':
      return [`${paint.spacing}px ${paint.spacing}px`, `${paint.spacing}px ${paint.spacing}px`]
    case 'dots':
      return [`${paint.spacing}px ${paint.spacing}px`]
    default:
      return []
  }
}

/**
 * Gradient endpoints for Canvas createLinearGradient / SVG linearGradient
 * (userSpaceOnUse) over a rect of the given size, with CSS angle semantics:
 * 0deg points up, 90deg points right, growing clockwise.
 */
export function gradientEndpoints(
  angle: number,
  width: number,
  height: number
): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (angle * Math.PI) / 180
  // Direction of the gradient line, screen coords (y grows downward).
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  // Gradient line length that covers the whole rect (CSS spec formula).
  const len = Math.abs(width * dx) + Math.abs(height * dy)
  const cx = width / 2
  const cy = height / 2
  const half = len / 2
  return {
    x1: cx - dx * half,
    y1: cy - dy * half,
    x2: cx + dx * half,
    y2: cy + dy * half,
  }
}
