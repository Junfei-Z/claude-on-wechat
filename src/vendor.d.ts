declare module "silk-wasm" {
  export function decode(
    silk: Buffer,
    sampleRate: number,
  ): Promise<{ data: Uint8Array; duration: number }>;
}
