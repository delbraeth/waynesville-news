// schema.org structured data (JSON-LD) so search engines can show events and
// articles as rich results. Built only from fields already published on the
// page — nothing here adds facts the reader can't see.
const SITE = "https://waynesville.news";
const abs = (u) => (u ? new URL(u, SITE).toString() : undefined);

export const publisher = {
  "@type": "NewsMediaOrganization",
  "@id": `${SITE}/#org`,
  name: "Waynesville News",
  url: `${SITE}/`,
  logo: { "@type": "ImageObject", url: `${SITE}/podcast-cover.jpg`, width: 3000, height: 3000 },
  description: "Daily local news for Waynesville, Ohio, Corwin and Wayne Township: schools, local government, events, businesses and community.",
  email: "editor@waynesville.news",
  areaServed: [
    { "@type": "City", name: "Waynesville", address: { "@type": "PostalAddress", addressLocality: "Waynesville", addressRegion: "OH", postalCode: "45068", addressCountry: "US" } },
    { "@type": "AdministrativeArea", name: "Wayne Township, Warren County, Ohio" },
    { "@type": "City", name: "Corwin, Ohio" },
  ],
  sameAs: ["https://www.facebook.com/WaynesvilleNews/"],
  publishingPrinciples: `${SITE}/about/`,
  correctionsPolicy: `${SITE}/corrections/`,
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
    inLanguage: "en-US",
    isAccessibleForFree: true,
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
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      name: "Waynesville News",
      url: `${SITE}/`,
      inLanguage: "en-US",
      publisher: { "@id": `${SITE}/#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE}/search/?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    publisher,
  ],
};

// Holiday Lights display with dates (undated ones are skipped by the caller).
// Dates are whole days, as the organizer posts them.
export function displayEvent(d) {
  return {
    "@type": "Event",
    name: d.name,
    startDate: d.startDate,
    endDate: d.endDate ?? undefined,
    description: d.about || undefined,
    url: abs(d.website || d.source),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: d.location || d.town, address: /\b(oh|ohio)\b/i.test(d.location ?? "") ? d.location : `${d.location || d.town}, Ohio` },
  };
}

// A church's Christmas Eve service (from christmasEveServices()).
export function serviceEvent(s, year) {
  return {
    "@type": "Event",
    name: `${s.what || "Christmas Eve service"} at ${s.church}`,
    startDate: `${year}-12-24T${s.start}:00-05:00`,
    url: abs(`/churches/#${s.slug}`),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: s.church, address: s.address ? `${s.address}, Ohio` : `${s.town}, Ohio` },
    organizer: { "@type": "Organization", name: s.church, url: s.website || undefined },
  };
}

export const itemList = (items) => ({
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, item })),
});

// Safe to drop into a <script> tag: "<" can't close it early.
export const ldJson = (data) => JSON.stringify(data).replace(/</g, "\\u003c");
