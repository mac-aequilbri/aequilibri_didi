import Link from "next/link";

const CARDS = [
  { href: "/uc1", badge: "uc1-badge", tag: "UC1", title: "Roofing Estimator", desc: "AI roof measurement, Port City pricing, quotes, purchase orders, storm leads, solar & finance." },
  { href: "/app", badge: "uc3-badge", tag: "UC3", title: "MSME Coordinator", desc: "Multi-tenant construction PM on the platform core: projects, risks, variations, client portal, AI reports. Single long-project instances (e.g. Dulong Downs / Didi) live here too." },
];

export default function Home() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-2">æquilibri</h1>
      <p className="text-neutral-600 mb-10">AI-assisted operations platform — two use-cases, one stack.</p>
      <div className="grid gap-6 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="ae-card p-6 block hover:shadow-md transition-shadow">
            <span className={`uc-badge ${c.badge} mb-3 inline-block`}>{c.tag}</span>
            <h2 className="text-lg font-semibold mb-2">{c.title}</h2>
            <p className="text-sm text-neutral-600">{c.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
