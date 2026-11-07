// Anchor ids for listings (directory, community, churches, resources, visit),
// shared with the site search so its links land on the right entry.
export const slug = (name = "") =>
  name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
