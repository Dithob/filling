import { describe, expect, it } from 'vitest';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64ToUint8Array,
} from '../../../shared/util/base64';

describe('base64 helpers', () => {
  it('往返一致（含大 buffer，验证分块不爆栈）', () => {
    const bytes = new Uint8Array(200_000);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index % 256;
    }
    const encoded = arrayBufferToBase64(bytes.buffer);
    const decoded = base64ToUint8Array(encoded);
    expect(decoded.length).toBe(bytes.length);
    expect(decoded[0]).toBe(0);
    expect(decoded[255]).toBe(255);
    expect(decoded[100_000]).toBe(bytes[100_000]);
    expect(Array.from(decoded.subarray(0, 8))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('小 buffer 往返一致', () => {
    const buffer = new TextEncoder().encode('PDF-1.4 test').buffer;
    expect(new TextDecoder().decode(base64ToArrayBuffer(arrayBufferToBase64(buffer)))).toBe('PDF-1.4 test');
  });

  it('空 buffer', () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('');
    expect(base64ToUint8Array('').length).toBe(0);
  });
});
