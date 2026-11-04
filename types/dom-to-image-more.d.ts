/** Minimal ambient types for dom-to-image-more (ships without .d.ts). */
declare module 'dom-to-image-more' {
  interface DomToImageOptions {
    [key: string]: unknown
  }

  const domtoimage: {
    toPng(node: HTMLElement, options?: DomToImageOptions): Promise<string>
    toSvg(node: HTMLElement, options?: DomToImageOptions): Promise<string>
  }

  export default domtoimage
}
