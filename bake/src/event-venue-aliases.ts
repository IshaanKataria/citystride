// Common event-page venue names → canonical `feature_name` in data/raw/venues.json.
// Extend this table when the scraper warns about an un-resolvable venue.
export const VENUE_ALIASES: Record<string, string> = {
  "fed square": "Federation Square",
  "federation sq": "Federation Square",
  "ngv": "National Gallery of Victoria",
  "ngv international": "National Gallery of Victoria International",
  "ngv australia": "Ian Potter Centre: NGV Australia",
  "acmi": "Australian Centre for the Moving Image",
  "the arts centre": "Arts Centre Melbourne",
  "arts centre": "Arts Centre Melbourne",
  "hamer hall": "Hamer Hall",
  "state library": "State Library Victoria",
  "state library of victoria": "State Library Victoria",
  "queen vic market": "Queen Victoria Market",
  "qvm": "Queen Victoria Market",
  "royal exhibition building": "Royal Exhibition Building",
  "melbourne museum": "Melbourne Museum",
  "melbourne town hall": "Melbourne Town Hall",
  "town hall": "Melbourne Town Hall",
};
