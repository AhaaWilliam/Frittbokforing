import { crc32 } from 'node:zlib'
import * as iconv from 'iconv-lite'

/**
 * Calculate SIE KSUMMA (CRC32) over CP437-encoded file content.
 *
 * Flöde:
 * 1. Generera hela SIE4-filen UTAN #KSUMMA-raden
 * 2. Konvertera till CP437 bytes med iconv-lite
 * 3. Beräkna CRC32 med node:zlib
 * 4. Konvertera till signed 32-bit integer
 *
 * @returns Signed 32-bit integer (negativa värden är giltiga och vanliga)
 */
export function calculateKsumma(contentWithoutKsumma: string): number {
  const cp437Bytes = iconv.encode(contentWithoutKsumma, 'cp437')
  const crcValue = crc32(cp437Bytes)
  // Convert unsigned 32-bit to signed 32-bit
  return crcValue | 0
}
