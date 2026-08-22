// Minimal ambient types for dependencies that ship no declarations of their own.

declare module 'bmp-js' {
  export interface BmpDecodeResult {
    width: number;
    height: number;
    /** ABGR-ordered bytes, four per pixel. */
    data: Buffer;
  }
  export function decode(buffer: Buffer): BmpDecodeResult;
  const bmp: { decode: typeof decode };
  export default bmp;
}

declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: ArrayBufferLike;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }
  function heicConvert(options: HeicConvertOptions): Promise<ArrayBuffer>;
  export default heicConvert;
}

declare module 'ffprobe-static' {
  const ffprobe: { path: string };
  export default ffprobe;
}
