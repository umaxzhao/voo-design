import { describe, expect, it } from 'vitest';
import { DESIGN_BENCH_TASKS } from '../../scripts/design-bench/tasks.mjs';

describe('design benchmark task contract', () => {
  it('covers the original twenty scenarios and ten new scenarios with unique portable IDs', () => {
    const ids = DESIGN_BENCH_TASKS.map(task => task.id);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
    expect(ids.slice(0, 20)).toEqual(['product-card', 'login-form', 'signup', 'landing-hero', 'saas-dashboard', 'analytics-dashboard', 'settings-page', 'pricing-table', 'mobile-home', 'mobile-onboarding', 'mobile-profile', 'checkout-form', 'email-newsletter', 'blog-article', 'empty-state', 'notification-panel', 'file-upload-modal', 'kanban-board', 'chat-app-screen', 'music-player']);
    expect(ids.slice(20)).toEqual(['saas-landing', 'hospitality-landing', 'meditation-home', 'food-menu', 'travel-results', 'crypto-portfolio', 'people-directory', 'portfolio-home', 'conference-page', 'form-wizard']);
    for (const task of DESIGN_BENCH_TASKS) {
      expect(task.id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(task.kind.length).toBeGreaterThan(3);
      expect(task.prompt.length).toBeGreaterThan(80);
      expect(task.prompt).not.toMatch(/https?:\/\//);
      for (const value of Object.values(task.frame)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });
  it('uses the requested mobile viewport consistently', () => {
    for (const task of DESIGN_BENCH_TASKS.filter(task => task.id.startsWith('mobile-'))) {
      expect(task.frame).toEqual({ w: 390, h: 844 });
    }
  });
});
