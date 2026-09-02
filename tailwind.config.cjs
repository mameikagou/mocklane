/** Mocklane · Arena tokens（移植自 agent-evolution-nocode 设计系统） */
module.exports = {
  content: ['./dashboard/src/**/*.{js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        grid: 'var(--grid)',
        ink: { 1: 'var(--ink-1)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        focus: 'var(--focus)',
        amber: {
          core: 'var(--amber-core)',
          strong: 'var(--amber-strong)',
          dim: 'var(--amber-dim)',
          soft: 'var(--amber-soft)',
          ink: 'var(--amber-ink)',
          glow: 'var(--amber-glow)',
          faint: 'var(--amber-faint)',
        },
        ok: 'var(--ok)',
        fail: 'var(--fail)',
        tool: 'var(--tool)',
        llm: 'var(--llm)',
        // 兼容旧的 ml-* 引用（指向同一套 arena var）
        ml: {
          bg: 'var(--surface-0)',
          surface: 'var(--surface-1)',
          raised: 'var(--surface-2)',
          line: 'var(--line)',
          ink: 'var(--ink-1)',
          muted: 'var(--ink-3)',
          accent: 'var(--amber-core)',
          info: 'var(--tool)',
          warning: 'var(--amber-dim)',
          danger: 'var(--fail)',
        },
      },
      fontFamily: {
        display: ['Tomorrow', '"PingFang SC"', 'sans-serif'],
        body: ['"IBM Plex Sans"', '"PingFang SC"', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"SF Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 12px var(--amber-glow)',
        pill: '0 12px 40px color-mix(in oklch, var(--shadow) 62%, transparent)',
      },
      transitionDuration: { micro: '120ms', short: '200ms', scene: '600ms' },
      transitionTimingFunction: { expo: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      animation: {
        'pulse-dot': 'mc-pulse 3s ease-in-out infinite',
        rise: 'mc-rise 600ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        'mc-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'mc-rise': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
