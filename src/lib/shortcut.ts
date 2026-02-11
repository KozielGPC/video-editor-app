/**
 * Convert a KeyboardEvent to Tauri accelerator format.
 * Example: CommandOrControl+Shift+R, Alt+Space, etc.
 */
export function keyEventToAccelerator(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const key = formatKey(e.key);
  if (key && !parts.includes(key)) parts.push(key);
  return parts.join("+") || "None";
}

function formatKey(key: string): string {
  const map: Record<string, string> = {
    " ": "Space",
    "ArrowUp": "Up",
    "ArrowDown": "Down",
    "ArrowLeft": "Left",
    "ArrowRight": "Right",
    "Enter": "Enter",
    "Tab": "Tab",
    "Escape": "Escape",
    "Backspace": "Backspace",
    "Delete": "Delete",
    "Insert": "Insert",
    "Home": "Home",
    "End": "End",
    "PageUp": "PageUp",
    "PageDown": "PageDown",
  };
  for (let i = 1; i <= 12; i++) {
    map[`F${i}`] = `F${i}`;
  }
  return map[key] ?? key.toLowerCase();
}

/** Human-readable label for an accelerator */
export function acceleratorToLabel(acc: string): string {
  return acc
    .replace(/CommandOrControl/g, "⌘")
    .replace(/Command/g, "⌘")
    .replace(/Control/g, "Ctrl")
    .replace(/Shift/g, "⇧")
    .replace(/Alt/g, "⌥")
    .replace(/Option/g, "⌥")
    .replace(/\+/g, " + ");
}

/** Check if a KeyboardEvent matches a Tauri accelerator string */
export function eventMatchesAccelerator(e: KeyboardEvent, acc: string): boolean {
  const parts = acc.split("+");
  const wantCmd = parts.includes("CommandOrControl") || parts.includes("Command") || parts.includes("Control");
  const wantAlt = parts.includes("Alt") || parts.includes("Option");
  const wantShift = parts.includes("Shift");
  const keyPart = parts.find((p) =>
    !["CommandOrControl", "Command", "Control", "Alt", "Option", "Shift"].includes(p),
  );

  const hasCmd = e.metaKey || e.ctrlKey;
  const hasAlt = e.altKey;
  const hasShift = e.shiftKey;
  const key = formatKey(e.key);

  if (wantCmd && !hasCmd) return false;
  if (!wantCmd && hasCmd) return false;
  if (wantAlt && !hasAlt) return false;
  if (!wantAlt && hasAlt) return false;
  if (wantShift && !hasShift) return false;
  if (!wantShift && hasShift) return false;
  if (keyPart && key.toLowerCase() !== keyPart.toLowerCase()) return false;
  return true;
}
