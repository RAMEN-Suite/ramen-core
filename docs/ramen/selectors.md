---
route: ramen/selectors
title: Use Selectors
group: RAMEN
---

# Use Selectors

`HAS_ANNOTATION` connects a recorded annotation to Text, Image or another permitted node. An optional `selector` points to a **part** of that node. The same annotation shape can be used on different kinds of content.

## Select part of a text

A recorded `person` annotation might use a text position:

```json
{
  "type": "person",
  "selector": { "type": "TextPositionSelector", "start": 4, "end": 9 }
}
```

## Select part of an image

Another `person` annotation might use a [Fragment Selector](https://www.w3.org/TR/annotation-model/#fragment-selector):

```json
{
  "type": "person",
  "selector": { "type": "FragmentSelector", "value": "xywh=50,40,120,90" }
}
```

These snippets show annotation **properties**. The recorded `HAS_ANNOTATION` link is stored separately, as in [Validate RAMEN Data](validation.md).

RAMEN follows the [Web Annotation selector idea](https://www.w3.org/TR/annotation-model/#selectors) without requiring the whole Web Annotation format. `selector` is an object, not a JSON string, and RAMEN permits one selector per annotation. The [Selector data type](data-types.md) accepts a JSON object; RAMEN additionally requires a non-empty `type`. It does not validate selector-specific fields such as `start`, `end` or `value`. The consuming tool interprets and checks those fields.
