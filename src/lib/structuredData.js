// schema.org structured data (JSON-LD) so search engines can show events and
// articles as rich results. Built only from fields already published on the
// page — nothing here adds facts the reader can't see.
const SITE = "https://waynesville.news";
const abs = (u) => (u ? new URL(u, SITE).toString() : undefined);

export const publisher = {
  "@type": "NewsMediaOrganization",
  name: "Waynesville News",
  url: `${SITE}/`,
  logo: { "@type": "ImageObject", url: `${SITE}/podcast-cover.jpg` },
};

// Brief or story page. `date` is the content collection's Date (UTC midnight
// for the edition's calendar day), so only its YYYY-MM-DD part is used.
export function newsArticle({ title, dek, date, updated, url, image }) {
  const day = (d) => (d ? d.toISOString().slice(0, 10) : undefined);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description: dek || undefined,
    datePublished: day(date),
    dateModified: day(updated ?? date),
    mainEntityOfPage: abs(url),
    url: abs(url),
    image: [abs(image || "/og.png")],
    author: { "@type": "Organization", name: "Waynesville News", url: `${SITE}/` },
    publisher,
  };
}

// One Event per calendar entry. Venue strings are free text ("Mary L. Cook
// Public Library, 381 Old Stage Rd, Waynesville"), so they are used as both the
// place name and a text address rather than guessing at street/city parts.
export function eventItem(e) {
  const online = /^online$/i.test(e.venue ?? "");
  const address = /\b(oh|ohio)\b/i.test(e.venue ?? "") ? e.venue : `${e.venue}, Ohio`;
  return {
    "@type": "Event",
    name: e.title,
    startDate: e.dateISO,
    endDate: e.endISO ?? undefined,
    description: e.note || undefined,
    url: abs(e.source),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: online ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location: online
      ? { "@type": "VirtualLocation", url: abs(e.source) }
      : { "@type": "Place", name: e.venue, address },
  };
}

export const eventList = (events) => ({
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: events.map((e, i) => ({ "@type": "ListItem", position: i + 1, item: eventItem(e) })),
});

export const website = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: "Waynesville News", url: `${SITE}/` },
    publisher,
  ],
};

// Safe to drop into a <script> tag: "<" can't close it early.
export const ldJson = (data) => JSON.stringify(data).replace(/</g, "\\u003c");
