# Inbox review feedback

Local import data. The `PR-*` folders and `last-import-report.json` are not committed.

Each PR folder contains:

- `metadata.json`: PR card and import status; the `notes` field is never overwritten
- `comments.json`: original comments
- `feedback.md`: generated readable view; edit it only if you removed the first marker line, otherwise the next import overwrites the file
- `context.md`: notes about the task; the import creates the template once and never touches it again

Comments in these files are not yet classified.
