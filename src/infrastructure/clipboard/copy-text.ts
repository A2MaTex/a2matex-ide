export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the DOM and Electron clipboard implementations.
    }
  }

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    if (copied) return true;
  } catch {
    // Fall through to the Electron bridge.
  } finally {
    textarea?.remove();
  }

  try {
    return (await window.studioHost?.system?.writeClipboardText?.(text)) ?? false;
  } catch {
    return false;
  }
}
