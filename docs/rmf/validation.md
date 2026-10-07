---
route: rmf/validation
title: Validate Models and Data
group: RMF
children:
  - validate-model.md
  - preview-removal.md
  - validate-input.md
  - validate-data.md
  - diagnostics.md
---

# Validate Models and Data

RMF checks the **model** that defines allowed data and the **recorded data** created from it. Use the check that fits the step you are working on:

| When                              | What to do                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------- |
| After a modelling edit            | [Validate the model](validate-model.md) and show errors beside its definitions. |
| Before removing a definition      | [Preview the removal](preview-removal.md) across all open model levels.         |
| While someone enters one value    | [Check that input](validate-input.md) against its type and property rules.      |
| Before accepting records or links | [Validate the complete data graph](validate-data.md) against the model.         |
| When a check finds a problem      | [Read its diagnostics](diagnostics.md) to locate and explain the finding.       |

Model validation resolves imports, inheritance and rules. Data validation first needs a valid model, then checks recorded values and links. A model contains definitions rather than the records collected by a tool.
