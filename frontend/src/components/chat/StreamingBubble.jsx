export function StreamingBubble({ text }) {
  return (
    <div className="flex justify-start" aria-live="polite">
      <div className="max-w-[80%] sm:max-w-[60%] px-4 py-2 rounded-2xl rounded-bl-md text-body-sm bg-surface text-on-surface border border-outline-variant">
        {text}
        <span className="inline-block w-1.5 ml-0.5 animate-pulse">▍</span>
      </div>
    </div>
  );
}
