import { ITCONT } from "./dados";

export const ITCONT_SEO_ORIGIN = "https://itcont-uefs.onrender.com";
export const ITCONT_SEO_URL = `${ITCONT_SEO_ORIGIN}/`;
export const ITCONT_SEO_TITLE = "ITCONT 2026 UEFS | Imersão Tecnológica Contábil na Bahia";
export const ITCONT_SEO_DESCRIPTION =
  "ITCONT 2026 na UEFS reúne contabilidade e inteligência artificial em Feira de Santana, nos dias 21 e 22 de outubro, com inscrição gratuita. Saiba mais.";
export const GOOGLE_SITE_VERIFICATION_FILE = "google8fb9042c04e35465.html";
export const GOOGLE_SITE_VERIFICATION_CONTENT =
  "google-site-verification: google8fb9042c04e35465.html";

const escapeHtml = (value: unknown): string => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function formatLongDate(date: string): string {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dateTime(date: string, time: string): string {
  return `${date}T${time}:00${ITCONT.offset}`;
}

export function buildItcontPrerenderHtml(): string {
  const sessions = ITCONT.sessoes.map((session) => {
    const start = dateTime(session.data, session.inicio);
    const end = dateTime(session.data, session.fim);
    return `<li><time datetime="${escapeHtml(start)}">${escapeHtml(formatLongDate(session.data))}</time>, das <time datetime="${escapeHtml(start)}">${escapeHtml(session.inicio)}</time> às <time datetime="${escapeHtml(end)}">${escapeHtml(session.fim)}</time>: ${escapeHtml(session.titulo)}.</li>`;
  }).join("");
  const guests = ITCONT.convidados
    .map(({ nome }) => `<li>${escapeHtml(nome)}</li>`)
    .join("");
  const faq = ITCONT.faq.map(({ p, r }) =>
    `<div><dt>${escapeHtml(p)}</dt><dd>${escapeHtml(r)}</dd></div>`,
  ).join("");
  const eventDates = `${formatLongDate(ITCONT.inicio)} e ${formatLongDate(ITCONT.fim)}`;

  return `
    <main id="itcont-seo-prerender" class="itc-seo-prerender" aria-labelledby="itcont-seo-title">
      <div class="itc-seo-prerender__inner">
        <header class="itc-seo-prerender__hero">
          <img class="itc-seo-prerender__logo" src="/itcont-event-logo.png" width="345" height="166" alt="Logomarca da I Imersão Tecnológica Contábil, ITCONT">
          <p class="itc-seo-prerender__eyebrow">UEFS, Feira de Santana, Bahia</p>
          <h1 id="itcont-seo-title">ITCONT 2026: ${escapeHtml(ITCONT.titulo)}</h1>
          <p>${escapeHtml(ITCONT.descricao)}</p>
          <ul class="itc-seo-prerender__facts">
            <li><strong>Datas:</strong> ${escapeHtml(eventDates)}</li>
            <li><strong>Local:</strong> ${escapeHtml(ITCONT.local.nome)}, ${escapeHtml(ITCONT.local.instituicao)}, ${escapeHtml(ITCONT.local.cidade)}, ${escapeHtml(ITCONT.local.uf)}</li>
            <li><strong>Entrada:</strong> gratuita</li>
          </ul>
          <a href="${escapeHtml(ITCONT.inscricaoUrl)}" target="_blank" rel="noopener noreferrer">Inscreva-se gratuitamente no Even3</a>
        </header>
        <section aria-labelledby="itcont-seo-programa">
          <h2 id="itcont-seo-programa">Programação resumida</h2>
          <ul>${sessions}</ul>
        </section>
        <section aria-labelledby="itcont-seo-convidados">
          <h2 id="itcont-seo-convidados">Convidados confirmados</h2>
          <ul>${guests}</ul>
        </section>
        <section aria-labelledby="itcont-seo-faq">
          <h2 id="itcont-seo-faq">Perguntas frequentes</h2>
          <dl>${faq}</dl>
        </section>
        <p>Informações oficiais e inscrições: <a href="${escapeHtml(ITCONT.fonteUrl)}" target="_blank" rel="noopener noreferrer">página do ITCONT no Even3</a>.</p>
      </div>
    </main>`;
}

const structuredData = () => {
  const organizationId = `${ITCONT_SEO_URL}#organization`;
  const websiteId = `${ITCONT_SEO_URL}#website`;
  const eventId = `${ITCONT_SEO_URL}#event`;
  const sessionTimes = ITCONT.sessoes.map((session) => ({
    date: session.data,
    start: session.inicio,
    end: session.fim,
  }));
  const firstSession = [...sessionTimes].sort((a, b) =>
    `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`),
  )[0];
  const lastSession = [...sessionTimes].sort((a, b) =>
    `${b.date}T${b.end}`.localeCompare(`${a.date}T${a.end}`),
  )[0];

  return [
    {
      "@context": "https://schema.org",
      "@type": "Event",
      "@id": eventId,
      name: `ITCONT 2026: ${ITCONT.titulo}`,
      description: ITCONT.descricao,
      url: ITCONT_SEO_URL,
      mainEntityOfPage: ITCONT_SEO_URL,
      inLanguage: "pt-BR",
      startDate: dateTime(firstSession.date, firstSession.start),
      endDate: dateTime(lastSession.date, lastSession.end),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      image: [
        `${ITCONT_SEO_ORIGIN}/og-itcont.png`,
        `${ITCONT_SEO_ORIGIN}/itcont-event-logo.png`,
        ITCONT.banner,
      ],
      location: {
        "@type": "Place",
        name: ITCONT.local.nome,
        address: {
          "@type": "PostalAddress",
          streetAddress: "Av. Transnordestina, s/n, Novo Horizonte",
          addressLocality: ITCONT.local.cidade,
          addressRegion: ITCONT.local.uf,
          postalCode: "44036-900",
          addressCountry: "BR",
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: -12.19997,
          longitude: -38.97132,
        },
      },
      organizer: { "@id": organizationId },
      performer: ITCONT.convidados.map(({ nome, foto }) => ({
        "@type": "Person",
        name: nome,
        image: foto,
      })),
      offers: {
        "@type": "Offer",
        url: ITCONT.inscricaoUrl,
        price: "0",
        priceCurrency: "BRL",
        availability: "https://schema.org/InStock",
      },
      subEvent: ITCONT.sessoes.map((session) => ({
        "@type": "Event",
        name: session.titulo,
        startDate: dateTime(session.data, session.inicio),
        endDate: dateTime(session.data, session.fim),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": organizationId,
      name: ITCONT.local.instituicao,
      url: "https://www.uefs.br/",
      logo: {
        "@type": "ImageObject",
        url: `${ITCONT_SEO_ORIGIN}/itcont-event-logo.png`,
        width: 345,
        height: 166,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": websiteId,
      url: ITCONT_SEO_URL,
      name: ITCONT_SEO_TITLE,
      inLanguage: "pt-BR",
      publisher: { "@id": organizationId },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${ITCONT_SEO_URL}#faq`,
      url: ITCONT_SEO_URL,
      mainEntity: ITCONT.faq.map(({ p, r }) => ({
        "@type": "Question",
        name: p,
        acceptedAnswer: {
          "@type": "Answer",
          text: r,
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": `${ITCONT_SEO_URL}#breadcrumb`,
      itemListElement: [{
        "@type": "ListItem",
        position: 1,
        name: "ITCONT 2026",
        item: ITCONT_SEO_URL,
      }],
    },
  ];
};

export function buildItcontJsonLdHtml(): string {
  return structuredData().map((schema) => {
    const json = JSON.stringify(schema).replaceAll("<", "\\u003c");
    return `<script type="application/ld+json" class="itcont-jsonld">${json}</script>`;
  }).join("\n");
}

export function buildItcontSitemapXml(lastModified = new Date()): string {
  const date = lastModified.toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${ITCONT_SEO_URL}</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`;
}
