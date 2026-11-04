/**
 * Fallback exporter: capture the live preview DOM via dom-to-image-more.
 * Kept as the reference path for M0 comparison; canvas is the mainline.
 */
import domtoimage from 'dom-to-image-more'
import type { StyleConfig } from '../../src/core/protocol'

export async function exportDomPng(stageNode: HTMLElement, style: StyleConfig): Promise<string> {
  return domtoimage.toPng(stageNode, {
    pixelRatio: style.exportScale,
    bgcolor: style.transparentBackground ? 'transparent' : style.backgroundColor,
    // DOM preview uses inline styles only, so no stylesheet inlining is needed;
    // fonts come from the system so no font embedding is required either.
    style: { margin: '0' },
  })
}
