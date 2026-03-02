declare module 'qrcode' {
  export function toDataURL(
    data: string | Buffer,
    options?: { width?: number; margin?: number }
  ): Promise<string>;
}
