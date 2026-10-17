---
name: ITCONT public data scope
description: Agreed limits on information that may be stored from the ITCONT event source.
---

Use only event details and guests publicly listed on the Even3 event page. Keep publicly hosted event and guest image URLs as links; do not download or copy those images. The only approved static-image exception is the user-supplied ITCONT logo used in the Hero and the ITCONT-only favicon. Do not store attendee or registrant lists, payroll, private accounts, or operational records.

**Why:** The user explicitly limited the source and scope to public event information and named guests, then supplied and approved this specific brand logo for the public ITCONT site.

**How to apply:** For ITCONT database, API, or import work, retain only public page data and source-hosted event/guest image links. Keep the approved logo separate from event photos. Do not infer other ITCONT datasets or access private records without a separately authorized source.

The public ITCONT assistant must use only the official event data and published FAQ, run without login or external AI services/API keys/paid calls, and state when it cannot answer while linking to Even3. It must not invent dates, names, or services.

**Why:** The user explicitly required a free, keyless public assistant grounded only in those sources, with an honest fallback.

**How to apply:** Preserve these limits in any assistant or event-Q&A changes. Ask before broadening the knowledge source or connecting a generative model.

The user's promotional photo and the video derived from it must remain on-device. Process and export them in the browser; do not upload or persist them on the server.

**Why:** The user explicitly required a local-only Stories export while retaining local photo handling.

**How to apply:** Use browser canvas/Blob processing and client-side encoding for promotional media. Do not add API endpoints, analytics payloads, or object storage for these files.
