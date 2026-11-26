/** `android.widget.Button` → `Button`. */
export function shortClassName(className: string) {
  return className.split('.').at(-1) ?? className;
}
