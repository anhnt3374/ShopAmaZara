export function ToastBlock({ block }) {
  const palette =
    block.kind === 'success'
      ? 'bg-tertiary-container text-on-tertiary-container'
      : block.kind === 'warn'
        ? 'bg-error-container text-on-error-container'
        : 'bg-surface-container text-on-surface';
  return (
    <div
      className={`mt-2 px-3 py-1.5 rounded-md text-body-xs border border-outline-variant ${palette}`}
    >
      {block.text}
    </div>
  );
}
