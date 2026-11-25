import { RuntimeError } from '@application/runtime/runtime.error';

export const MAX_RUNTIME_ARTIFACT_BYTES = 16 * 1024 * 1024;
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_AXIS = 4_096;
const MAX_PNG_PIXELS = 12_000_000;

function invalidPng(message: string) {
  return new RuntimeError('RUNTIME_INVALID_RESPONSE', message, false);
}

export function validateRuntimePng(bytes: Uint8Array) {
  if (bytes.byteLength < 33) throw invalidPng('The Runtime artifact is a truncated PNG.');
  if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    throw invalidPng('The Runtime artifact has an invalid PNG signature.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(8, false) !== 13 ||
    String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR'
  ) {
    throw invalidPng('The Runtime artifact is missing a valid PNG IHDR chunk.');
  }
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (
    width === 0 ||
    height === 0 ||
    width > MAX_PNG_AXIS ||
    height > MAX_PNG_AXIS ||
    width * height > MAX_PNG_PIXELS
  ) {
    throw invalidPng('The Runtime artifact dimensions exceed the preview limits.');
  }
  return { height, width };
}
