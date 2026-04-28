# Event POMs

Empty by design. When event coverage starts, mirror the league pattern:

```
pages/event/
  EventCreatePage.ts
  EventDetailPage.ts
  EventResultsPage.ts
  index.ts
```

Use the league files as templates. The fixture pattern (`fixtures/eventFactory.ts`) and tests (`tests/event/`) follow the same shape — see the top-level e2e [README.md](../../README.md) "How to add tests for a new feature" section.
