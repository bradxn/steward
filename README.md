# Steward prototype

An early responsive web prototype for a personal asset log. It includes:

- a global timeline of completed, overdue, and upcoming events;
- a Things library and individual Thing knowledge pages;
- creation and editing of Things, Events, Rules, and Resources;
- interval Rules that schedule their next Event from the actual completion date;
- attachment references on Events;
- backup export/import, including PouchDB file attachments;
- sample data to make the intended flow immediately explorable.

## Run locally

```sh
npm run dev
```

Then open `http://127.0.0.1:3000`.

## Document model

The browser store contains independent documents with CouchDB-compatible identifiers:

- `thing:<uuid>` — current Thing details, parent relationship, and resource display references.
- `event:<uuid>` — completed or expected event associated with a Thing.
- `rule:<uuid>` — recurrence definition (represented in sample data; rule authoring is the next feature).
- `resource:<uuid>` — standalone document/photo/file metadata that can reference Things.

The prototype stores these documents in a browser-side PouchDB database named `steward`, backed by IndexedDB. On first load it automatically imports data created by the earlier `localStorage` version, then removes that legacy copy. No CouchDB server or synchronization is configured yet.

PouchDB’s `_rev` fields are kept in memory as documents are saved, so the same documents can later be replicated directly to a CouchDB database.

Use **Export backup** before relying on the prototype for important records. **Import backup** replaces the current local database after confirmation.
