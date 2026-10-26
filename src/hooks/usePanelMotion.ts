import { useEffect, type RefObject } from 'react';

const PANELS =
  '.command-panel, .ops-card, .desk-focus, .desk-campus, .desk-next, .desk-shortcuts, .desk-numbers, .desk-response, .desk-announcement, .task-card, .tool-section, .workspace-section, .metric-card, .stat-card';

/** Observe lazy panels as well as route content. No hidden state or map transforms. */
export function usePanelMotion(root: RefObject<HTMLElement | null>, route: string) {
  useEffect(() => {
    const node = root.current;
    if (!node || !('IntersectionObserver' in window)) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) return;
    const known = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        let order = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const panel = entry.target as HTMLElement;
          panel.style.setProperty('--panel-delay', `${Math.min(order++, 5) * 40}ms`);
          panel.classList.add('radar-panel-arrive');
          observer.unobserve(panel);
        }
      },
      { threshold: 0.04 },
    );
    function register() {
      node!.querySelectorAll(PANELS).forEach((panel) => {
        if (known.has(panel)) return;
        known.add(panel);
        observer.observe(panel);
      });
    }
    register();
    const mutations = new MutationObserver(register);
    mutations.observe(node, { childList: true, subtree: true });
    const stop = () => {
      if (preference.matches) observer.disconnect();
    };
    preference.addEventListener('change', stop);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      preference.removeEventListener('change', stop);
    };
  }, [root, route]);
}
