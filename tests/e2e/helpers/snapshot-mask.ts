/**
 * Snapshot-masking för export-tester (M151).
 *
 * Exportformat (SIE4, SIE5, pain.001) innehåller tid-beroende fält som
 * inte kan snapshot:as direkt:
 * - SIE4: #GEN YYYYMMDD signatur
 * - SIE5: Date="..." attribut
 * - pain.001: <CreDtTm> + <MsgId> (UUID)
 * - Generella ISO-timestamps
 * - UUID:er från randomUUID()
 *
 * Alla maskers ersätter värdena med deterministiska placeholders så att
 * toMatchSnapshot() är stabil mellan körningar. Om ett exportformat
 * introducerar nya volatila fält — lägg till en masker här och testa
 * den i maskern:s egen unit-test.
 */

const ISO_DATETIME_RE =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g

const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g

/**
 * Mask SIE4 content. Pass the decoded (latin1) text; not the raw buffer.
 * Replaces:
 * - `#GEN YYYYMMDD [sig]` → `#GEN <DATE> <SIG>`
 * - `#PROGRAM "name" "version"` → normalized to `<PROGRAM>`
 * - `#KSUMMA 123456` → `#KSUMMA <CHECKSUM>` (depends on #GEN — must mask)
 */
export function maskSie4(text: string): string {
  return text
    .replace(/#GEN \d{8}(\s+[^\n\r]+)?/g, '#GEN <DATE>')
    .replace(/#PROGRAM[^\n\r]*/g, '#PROGRAM <PROGRAM>')
    .replace(/#KSUMMA \d+/g, '#KSUMMA <CHECKSUM>')
}

/**
 * Mask SIE5 XML content. Replaces Date="..." and FileCreated timestamps.
 */
export function maskSie5(xml: string): string {
  return xml
    .replace(/Date="[^"]+"/g, 'Date="<DATE>"')
    .replace(/FileCreated="[^"]+"/g, 'FileCreated="<DATE>"')
    .replace(ISO_DATETIME_RE, '<DATETIME>')
}

/**
 * Mask pain.001 XML content. Replaces CreDtTm, MsgId, and UUID-looking ids.
 */
export function maskPain001(xml: string): string {
  return xml
    .replace(/<CreDtTm>[^<]+<\/CreDtTm>/g, '<CreDtTm><DATETIME></CreDtTm>')
    .replace(/<MsgId>[^<]+<\/MsgId>/g, '<MsgId><MSGID></MsgId>')
    .replace(UUID_RE, '<UUID>')
    .replace(ISO_DATETIME_RE, '<DATETIME>')
}

/**
 * Generic: mask ISO timestamps and UUIDs. Useful for ad-hoc snapshot tests.
 */
export function maskGeneric(text: string): string {
  return text.replace(ISO_DATETIME_RE, '<DATETIME>').replace(UUID_RE, '<UUID>')
}
