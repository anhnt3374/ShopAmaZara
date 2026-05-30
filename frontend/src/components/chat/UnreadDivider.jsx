/**
 * Index of the first *unseen* message — the first incoming message created
 * after the viewer's read boundary. `boundary` is the viewer's lastReadAt
 * (ISO string or Date) snapshotted when the conversation was opened, or null
 * when the conversation has never been read. Returns -1 when nothing is unseen.
 */
export function firstUnseenIndex(messages, boundary, ownKind = 'buyer') {
  if (!messages || messages.length === 0) return -1;
  const cutoff = boundary ? new Date(boundary).getTime() : null;
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    if (m.senderKind === ownKind) continue; // your own messages are always seen
    if (cutoff === null || new Date(m.createdAt).getTime() > cutoff) return i;
  }
  return -1;
}

/** Centered "New messages" separator placed above the first unseen message. */
export default function UnreadDivider() {
  return (
    <div className="flex items-center gap-2 my-1" role="separator" aria-label="New messages">
      <span className="flex-1 h-px bg-primary/40" />
      <span className="text-[11px] font-medium text-primary px-2 py-0.5 rounded-full bg-primary/10 whitespace-nowrap">
        New messages
      </span>
      <span className="flex-1 h-px bg-primary/40" />
    </div>
  );
}
