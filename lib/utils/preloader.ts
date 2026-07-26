type PreloadTask = () => void | Promise<void>;

const queue: PreloadTask[] = [];
let flushing = false;

function flush() {
  if (flushing) return;
  flushing = true;
  const run = () => {
    const task = queue.shift();
    if (task) {
      Promise.resolve(task()).finally(() => {
        if (queue.length > 0) {
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            window.requestIdleCallback(run, { timeout: 2000 });
          } else {
            setTimeout(run, 200);
          }
        } else {
          flushing = false;
        }
      });
    } else {
      flushing = false;
    }
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 200);
  }
}

export function preload(task: PreloadTask): void {
  queue.push(task);
  if (!flushing) flush();
}

export function preloadData<T>(fetcher: () => Promise<T>): void {
  preload(() => fetcher().then(() => {}));
}
