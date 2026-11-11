// Vendored from betterfanslink lib/clipboard.ts (main d4138f9), unchanged.

/** Copy the full value, keeping the fallback inside the initiating dialog. */
export async function copyText(value: string, source?: HTMLElement): Promise<boolean> {
  const doc = source?.ownerDocument ?? document;
  const previousFocus = doc.activeElement as HTMLElement | null;
  const container = (source ?? previousFocus)?.closest<HTMLElement>('[role="dialog"], [role="alertdialog"], dialog') ?? doc.body;

  try {
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (clipboard) {
      await clipboard.writeText(value);
      return true;
    }
  } catch {
    // Permission can be denied even when the Clipboard API is available.
  }

  const field = doc.createElement('textarea');
  field.value = value;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
  try {
    container.appendChild(field);
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, value.length);
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }
}
