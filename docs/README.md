# Documentation

Technical documentation for the Aftershock Calculator. Each document is
self-contained, with diagrams, worked examples, and pointers into the code.

| Document | What it covers |
| --- | --- |
| [Architecture](architecture.md) | Component map, the results-snapshot design, layering rules, directory reference |
| [The forecast computation](forecast-model.md) | Validation, the Reasenberg–Jones model, magnitude bins, confidence ranges, formatting rules, model presets |
| [Likely-number computation](likely-number-computation.md) | How the Poisson outcome chart turns the model into probability bars, with a worked example |
| [Evaluation methodology](evaluation-methodology.md) | Spatial regions, the GeoNet catalogue, forecast–observation matching, N-test and probability scores, caveats |
| [Date and time handling](date-time-handling.md) | Why dd/mm/yyyy is enforced, the field's behaviour, the calendar picker, storage conventions |

The scientific background (model equations, parameter meanings, references)
is also available inside the application on the **About** tab.
