# Architecture

Defines the intended layered architecture and separation of concerns. Routes select HTTP method/path/middleware/controller; controllers adapt transport; validators constrain input; services implement business rules; repositories perform data access; configuration centralizes runtime settings.

Dependencies should point inward toward domain abstractions where practical. Cross-domain coordination should occur through services rather than direct controller-to-repository shortcuts. Acceptance criteria: each business capability has a clear owner layer, no giant utility module exists, and domain boundaries remain testable.
