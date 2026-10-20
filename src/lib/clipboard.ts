/**
 * Copies text to the clipboard. The Clipboard API only exists on secure pages (https:// or
 * localhost), so on a plain http://<lan-ip> address this falls back to selecting the text in a
 * temporary field and using the older copy command, which still works there (including iOS).
 */
export async function copyText(text: string): Promise<boolean> {
	if (window.isSecureContext && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Permission denied or not focused: try the fallback.
		}
	}

	const field = document.createElement('textarea');
	field.value = text;
	field.setAttribute('readonly', '');
	// Keep it out of view without display:none (hidden fields can't be selected), and at 16px so
	// iOS doesn't zoom in.
	Object.assign(field.style, { position: 'fixed', top: '0', left: '-9999px', fontSize: '16px' });
	document.body.append(field);
	try {
		field.focus();
		field.select();
		field.setSelectionRange(0, text.length); // iOS ignores select()
		return document.execCommand('copy');
	} catch {
		return false;
	} finally {
		field.remove();
	}
}
