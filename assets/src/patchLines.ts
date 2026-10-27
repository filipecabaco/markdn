/**
 * Brings `container`'s children in line with `next`, one element per entry,
 * touching only the run that changed. A keystroke changes one line; Enter adds
 * one; a paste replaces a block — in every case the lines before and after the
 * edit keep their elements, so the browser re-lays out the edit, not the file.
 */
export function patchLines(
  container: HTMLElement,
  previous: readonly string[],
  next: readonly string[],
  write: (element: HTMLElement, line: string) => void,
) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) {
    start += 1;
  }

  let endPrevious = previous.length;
  let endNext = next.length;
  while (
    endPrevious > start &&
    endNext > start &&
    previous[endPrevious - 1] === next[endNext - 1]
  ) {
    endPrevious -= 1;
    endNext -= 1;
  }

  const removed = endPrevious - start;
  const added = endNext - start;
  const shared = Math.min(removed, added);

  for (let index = 0; index < shared; index += 1) {
    write(container.children[start + index] as HTMLElement, next[start + index]);
  }

  if (added > shared) {
    const before = container.children[start + shared] ?? null;
    const fragment = document.createDocumentFragment();
    for (let index = shared; index < added; index += 1) {
      const element = document.createElement("div");
      element.className = "source__line";
      write(element, next[start + index]);
      fragment.appendChild(element);
    }
    container.insertBefore(fragment, before);
  } else {
    for (let index = removed - 1; index >= shared; index -= 1) {
      container.children[start + index]?.remove();
    }
  }
}
