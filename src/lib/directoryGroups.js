// Subgroups inside the bigger directory sections, so a 45-listing section reads
// as a few short lists. Each listing goes to the FIRST rule in its section
// that matches its tags ("kinds"), then its name, then its description; anything
// left over goes to "More". A listing can be pinned to a subgroup with
// "group": "<label>" (or {"<section id>": "<label>"} for a listing in several
// sections) in directory-manual.json, on an item or a recategorize entry.
// Sections with fewer than MIN_FOR_GROUPS listings stay one plain list.
export const MIN_FOR_GROUPS = 10;

// strong: matched against tags + name first, in rule order. weak: a looser
// pattern tried only if no strong pattern matched anywhere (so generic Chamber
// tags like "Repair/Maintenance" don't outrank specific ones like "Plumbing").
const R = (label, strong, weak) => ({ label, strong, weak });
export const GROUPS = {
  food: [
    R("Coffee, ice cream & treats", /coffee|ice cream|creamery|bakery|dessert|candy|donut/i),
    R("Pizza, burgers & carryout", /pizza|carry ?out|domino|mcdonald|burger|sub shop/i),
    R("Bars & grills", /\bbar\b(?!-b)|sports bar|pub\b|brew|winery|grille?\b/i),
    R("Groceries & markets", /grocer|market|bulk food/i),
    R("Restaurants & cafes", /restaurant|cafe|café|tea room|barbecue|bar-b-q|tavern|diner/i),
  ],
  home: [
    R("Plumbing, electric & HVAC", /plumb|electric services|electrical|mr\. electric|a\/c & heating|hvac|heating|propane/i),
    R("Painting & cleaning", /paint|clean|steam/i),
    R("Roofing, gutters & windows", /roof|gutter|window|siding|leaffilter/i),
    R("Lawn, landscaping & tree care", /lawn|landscap|tree|nursery|garden|pest|wildlife|power equipment/i),
    R("Builders & remodeling", /remodel|renovat|restoration|bath|tub|excavat|lumber|construction supplies|builder|properties/i, /construction|home improvement/i),
    R("Repair & handyman", /garage door|handyman|salvage/i, /repair|maintenance|facilities/i),
  ],
  shop: [
    R("Antiques & vintage", /antique|vintage|collectible/i, /novelty/i),
    R("Home décor & furniture", /decor|furniture|salvage|table company|colonial|fabric/i),
    R("Clothing & boutiques", /boutique|western|clothing|apparel|wear\b/i),
    R("Art, crafts & handmade", /art shop|art gallery|gallery|soap|bath & body|handmade|craft|wormwood|mercantile/i, /arts\/culture|custom|creative/i),
    R("Gifts & specialty", /gift|tea\/coffee|apothecary|charm|clock|garden art|cutco|electronics|pinball/i),
    R("Everyday & convenience", /gas station|convenience|grocer|discount|dollar|hardware|power equipment/i),
  ],
  fun: [
    R("Outdoors & adventure", /zipline|canoe|kayak|skydiv|glid|soaring|rodeo|visitor center|nature|trail|golf/i, /sports\/recreation|outdoor/i),
    R("History & museums", /museum|histor|pioneer|library/i),
    R("Music, dance & the arts", /dance|music|theat|gallery|live music/i, /arts\/culture/i),
    R("Attractions & events", /festival|attraction|dragons|renaissance|aircraft/i, /fun\/entertainment|tourism/i),
  ],
  pro: [
    R("Banking, mortgages & investing", /bank|mortgage|invest|retirement|financial|edward jones|studer/i, /finance/i),
    R("Insurance", /insurance/i),
    R("Accounting, tax & payroll", /account|tax|payroll|brixey/i),
    R("Legal", /\blaw\b|law office|law,|legal\b|attorney/i),
    R("Travel planning", /travel|cruise/i),
    R("Printing, signs & marketing", /print|sign|embroider|promotional|marketing/i),
    R("Business services", /notary|license bureau|small business|business support|consult|leadership|brightspeed/i),
  ],
  health: [
    R("Doctors, urgent care & dental", /dental|dentist|d\.d\.s|orthodont|medical|urgent care|family practice|health care|chiropract|cervical|integrative|therapy/i),
    R("Fitness & wellness", /fitness|yoga|ymca|dance|massage|wellness|personal train/i),
    R("Hair, beauty & spa", /hair|salon|barber|beauty|spa\b|nail/i),
    R("Senior living & care", /assisted|senior|nursing|aging|home care|hospice|angels/i),
  ],
  other: [
    R("Clubs & organizations", /veteran|legion|service club|lions|fraternal|masonic|camp|scout/i),
    R("Utilities", /utilit|aes\b|propane|brightspeed/i),
    R("Manufacturing & distribution", /manufactur|industrial|production|distribut|pepsi|kraut/i),
    R("Funeral homes", /funeral/i),
  ],
};

export function groupFor(sectionId, item) {
  const rules = GROUPS[sectionId];
  if (!rules) return null;
  const pin = typeof item.group === "string" ? item.group : item.group?.[sectionId];
  if (pin && rules.some((r) => r.label === pin)) return pin;
  const head = `${(item.kinds ?? []).join(" | ")} | ${item.name}`;
  for (const r of rules) if (r.strong.test(head)) return r.label;
  for (const r of rules) if (r.weak?.test(head)) return r.label;
  for (const r of rules) if (r.strong.test(item.about ?? "")) return r.label;
  return "More";
}

// [{ label, items }] in rule order, "More" last, empty groups dropped.
export function groupItems(sectionId, items) {
  const rules = GROUPS[sectionId];
  if (!rules || items.length < MIN_FOR_GROUPS) return null;
  const labels = [...rules.map((r) => r.label), "More"];
  const by = new Map(labels.map((l) => [l, []]));
  for (const it of items) by.get(groupFor(sectionId, it)).push(it);
  return labels.map((label) => ({ label, items: by.get(label) })).filter((g) => g.items.length > 0);
}
