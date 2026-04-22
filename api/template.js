// api/template.js — serves the built-in T3 stack template as a file manifest
// that the builder can push directly into a customer's empty GitHub repo.
//
// Rationale: the existing path forks a Dynasty-owned GitHub template repo
// (dynasty-saas-template, etc.), which ships with vendor branding that the
// post-generation gate then has to strip (SaaS Template, Ixartz, etc.).
// That's the #1 cause of the "template branding leaked" class of build
// failures surfaced by `verify_live`.
//
// This endpoint eliminates the fork step for the T3 opt-in path: we ship
// a minimal but production-grade T3 stack (Next.js + TypeScript + Tailwind +
// shadcn peers + tRPC-ready lib) directly in this codebase. When the client
// selects `?tmpl=t3`, it:
//   1. Creates an empty repo (no template fork).
//   2. Pulls the file manifest from /api/template?tmpl=t3.
//   3. Pushes each file to the new repo.
//   4. Overlays Dynasty-generated strategy docs + per-project overrides.
//
// No branding to strip, no forked history, no "SaaS Template" leaking.
export const maxDuration = 30;

const T3_TEMPLATE = /** @type {const} */ ({
  'package.json': JSON.stringify({
    name: 'dynasty-t3-app',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'biome check .',
      'lint:fix': 'biome check --write .',
      format: 'biome format --write .',
      'db:generate': 'prisma generate',
      'db:push': 'prisma db push',
      'db:studio': 'prisma studio',
    },
    dependencies: {
      '@prisma/client': '^5.22.0',
      '@tanstack/react-query': '^5.62.2',
      '@trpc/client': '^11.0.0-rc.660',
      '@trpc/react-query': '^11.0.0-rc.660',
      '@trpc/server': '^11.0.0-rc.660',
      'class-variance-authority': '^0.7.0',
      clsx: '^2.1.1',
      'lucide-react': '^0.468.0',
      next: '14.2.35',
      'next-auth': '4.24.11',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      'server-only': '^0.0.1',
      superjson: '^2.2.2',
      'tailwind-merge': '^2.5.4',
      'tailwindcss-animate': '^1.0.7',
      zod: '^3.23.8',
    },
    devDependencies: {
      '@biomejs/biome': '^1.9.4',
      '@types/node': '^20.11.0',
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      autoprefixer: '^10.4.17',
      postcss: '^8.4.33',
      prisma: '^5.22.0',
      tailwindcss: '^3.4.1',
      typescript: '^5.3.3',
    },
  }, null, 2) + '\n',

  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'es2022',
      lib: ['dom', 'dom.iterable', 'esnext'],
      module: 'esnext',
      moduleResolution: 'bundler',
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      incremental: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./src/*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2) + '\n',

  'next.config.mjs': `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};
export default nextConfig;
`,

  'postcss.config.mjs': `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`,

  'tailwind.config.ts': `import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    },
  },
  plugins: [animate],
} satisfies Config;
`,

  'components.json': JSON.stringify({
    $schema: 'https://ui.shadcn.com/schema.json',
    style: 'new-york',
    rsc: true,
    tsx: true,
    tailwind: { config: 'tailwind.config.ts', css: 'src/app/globals.css', baseColor: 'slate', cssVariables: true, prefix: '' },
    aliases: { components: '@/components', utils: '@/lib/utils', ui: '@/components/ui', lib: '@/lib', hooks: '@/hooks' },
    iconLibrary: 'lucide',
  }, null, 2) + '\n',

  'biome.json': JSON.stringify({
    $schema: 'https://biomejs.dev/schemas/1.9.4/schema.json',
    files: { ignore: ['node_modules', '.next', 'public', 'dist', 'prisma/migrations'] },
    formatter: { enabled: true, indentStyle: 'space', indentWidth: 2, lineWidth: 100 },
    linter: { enabled: true, rules: { recommended: true } },
    javascript: { formatter: { quoteStyle: 'single', trailingCommas: 'all', semicolons: 'always' } },
  }, null, 2) + '\n',

  '.env.example': `# Customer sets these in their own Vercel env — launcher never holds them.
DATABASE_URL=postgresql://user:pass@host/db
NEXTAUTH_SECRET=replace-me-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

# Optional — enables live chat at /api/chat (scaffolded dormant).
GOOGLE_API_KEY=
OPENAI_API_KEY=
`,

  '.gitignore': `node_modules\n.next\nout\n.env*.local\n.vercel\nprisma/dev.db*\n.DS_Store\n`,

  'README.md': `# Dynasty T3 App\n\nGenerated by [Your Deputy](https://yourdeputy.com). Built on the T3 stack:\n- Next.js 14 (App Router)\n- TypeScript + strict mode\n- Tailwind CSS + shadcn/ui\n- Prisma + NextAuth scaffolding\n- tRPC-ready\n- Biome for lint/format\n\n## Get started\n\n\`\`\`bash\nnpm install\ncp .env.example .env.local    # fill in DATABASE_URL etc.\nnpm run dev\n\`\`\`\n\n## Add shadcn components\n\n\`\`\`bash\nnpx shadcn@latest add button card input dialog\n\`\`\`\n`,

  'src/lib/utils.ts': `import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,

  'src/app/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground antialiased; font-feature-settings: 'rlig' 1, 'calt' 1; }
  h1, h2, h3, h4, h5, h6 { @apply font-semibold tracking-tight; }
}
`,

  'src/app/layout.tsx': `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dynasty T3 App',
  description: 'Generated by Your Deputy',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
`,

  'src/app/page.tsx': `export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">Dynasty T3 App</h1>
      <p className="max-w-xl text-center text-muted-foreground">
        This is the T3 scaffold. Your Deputy will overlay your project pages on top of this
        during generation — no template branding to strip, no forked history.
      </p>
      <code className="rounded-md bg-muted px-3 py-2 text-sm">
        npx shadcn@latest add button card input dialog
      </code>
    </main>
  );
}
`,

  'src/app/api/chat/route.ts': `// Streaming chat route — activates when GOOGLE_API_KEY or OPENAI_API_KEY is set.
// Dormant by default; static chatbot widget at /chatbot.html continues to work.
export const runtime = 'edge';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages } = await req.json();
  if (!process.env.GOOGLE_API_KEY && !process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Set GOOGLE_API_KEY or OPENAI_API_KEY to enable live chat.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
  // Intentionally minimal — the Dynasty provisioner overlays a full streamText
  // implementation with the generated FAQ as system-prompt grounding when
  // mod_chatbot runs. This stub keeps the route valid until that overlay.
  return new Response(JSON.stringify({ error: 'Activate via provisioner or implement streamText manually.' }), {
    status: 501, headers: { 'Content-Type': 'application/json' },
  });
}
`,

  'prisma/schema.prisma': `// Minimal Prisma schema — extend with your models.
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
`,

  'src/server/auth.ts': `// NextAuth scaffold — extend with providers (GitHub, Google, credentials, etc.).
import type { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  providers: [],
  session: { strategy: 'jwt' },
};
`,
});

// ── HTTP handler ─────────────────────────────────────────────────────────────
// GET/POST /api/template?tmpl=t3 → returns file manifest for the builder
// to push into the customer repo. `?file=<path>` returns one file's raw text.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const tmpl = (req.query?.tmpl || req.body?.tmpl || 't3').toString();
  const file = (req.query?.file || req.body?.file || '').toString();
  if (tmpl !== 't3') return res.status(400).json({ error: `Unknown template: ${tmpl}` });

  if (file) {
    const content = T3_TEMPLATE[file];
    if (typeof content !== 'string') return res.status(404).json({ error: `File not in manifest: ${file}` });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(content);
  }

  // Full manifest — path → file content. The builder iterates entries and
  // pushes each one to the new repo in a single commit.
  return res.json({
    ok: true,
    template: 't3',
    files: T3_TEMPLATE,
    file_count: Object.keys(T3_TEMPLATE).length,
  });
}
