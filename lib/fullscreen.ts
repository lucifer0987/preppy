/**
 * Whether full screen applies at all, which is not the same as whether we are
 * in it.
 *
 * A paper asks for full screen and a browser that refuses is refusing
 * (FR-6.5.1). But iPhone Safari has no Element.requestFullscreen -- only a
 * video can go full screen there -- so the call threw, the throw was read as a
 * refusal, and Begin never submitted: on an iPhone no attempt row was ever
 * written, and the student was told their browser had denied a permission it
 * was never asked for.
 *
 * So the question has three answers, and both the Begin button and the engine
 * need the same one. Kept here, as two plain functions over a document-shaped
 * object, so the rule is checked rather than written twice.
 */

/** Just enough of `document` to decide, so a test can pass a plain object. */
export interface FullscreenDoc {
  documentElement: { requestFullscreen?: unknown }
  fullscreenElement?: unknown
}

/** Can this browser put an element full screen at all? */
export function fullscreenSupported(doc: FullscreenDoc): boolean {
  return typeof doc.documentElement.requestFullscreen === 'function'
}

/**
 * true in full screen, false outside it, and **null when the browser has no
 * full screen to be outside of**.
 *
 * The engine raises its "Return to full screen" wall on false and counts an
 * exit on every fall to false. null is what keeps a phone from meeting a wall
 * it could never dismiss, over a button that could do nothing.
 */
export function fullscreenState(doc: FullscreenDoc): boolean | null {
  if (!fullscreenSupported(doc)) return null
  return Boolean(doc.fullscreenElement)
}
