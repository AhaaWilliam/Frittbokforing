// VS-105: detektera om Radix Dialog/AlertDialog är öppen i DOM:en, så
// global keyboard-shortcuts (mod+k, GlobalSearch-fokus) inte stjäl
// fokus från en aktiv modal. Radix sätter [data-state="open"] på
// Dialog.Content och AlertDialog.Content med role="dialog" resp.
// role="alertdialog".
export function isAnyModalOpen(): boolean {
  if (typeof document === 'undefined') return false
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ) !== null
  )
}
