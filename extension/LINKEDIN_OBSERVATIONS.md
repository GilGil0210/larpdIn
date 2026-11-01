# LinkedIn form observations

Observed on the signed-in English desktop profile on 2026-11-01. These are UI observations, not stable DOM selectors; adapters must validate their matches at runtime.

- The profile has an Edit intro link. Its editor contains first name, last name, additional name, pronouns, headline, country/region, city, an education selection, industry, and Save. Changes to supported fields must preserve the other controls.
- The profile provides separate Add education, Edit education, and per-record edit links. The education editor contains school, degree, field of study, start and end month and year, grade, activities, description, skills, media, Delete education, and Save. It also has a Notify network switch that was on during inspection.
- Months, skills, and media are outside the generation contract but relevant to restoration. A snapshot that does not capture and restore all associated data is incomplete; replacement must be blocked until it can be verified. Network notification behavior also needs explicit handling.
- The inspected profile has an Add a summary link when About is absent. Existing About editing and autocomplete behaviors remain to be inspected.

No form was saved during inspection.

Additional read-only inspection on 2026-11-01: the education detail view exposes both a record link and an edit link to the same record. Its Add education link uses a detail-page route. The accessibility tree did not expose a total count or an end-of-list indicator, so the single visible record is not evidence of exhaustion. The intro headline appeared as an editable text area in accessibility, but the earlier input/textarea/select-only diagnostic omitted it; the underlying markup and editing behavior still need live verification. No values were changed.
