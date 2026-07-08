# Single-server SQLite for the MVP

The MVP stores family-space data in SQLite or local files on a single deployed server instead of using a hosted database. This keeps the first build simple while still allowing the household to share one data source across devices; moving to a server database can be revisited when multi-household hosting, backup automation, or scale becomes necessary.
