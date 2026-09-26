# Learn RAMEN Core

Build a data model first. Tools can later use that model to collect data.
The examples below create types and rules, not individual letters or annotations.

## 1. Generic models

Start with [Documents and folders](../examples/generic-model.ts).
Create a small language, refine Document into Letter and Folder into Archive,
and select their connection. Inspect the actual suggestions before using them.

This introduces RMF without the RAMEN vocabulary.

## 2. One RAMEN project level

Continue with [a small correspondence model](../examples/ramen-basic.ts).
RAMEN already supplies Collection, Content, Entity, Annotation and their relations.
Define Letter, Witness and Text, then select the permitted PART_OF relations.

## 3. Annotation types

Add [text annotations](../examples/ramen-annotations.ts).
Reuse the existing Annotation node and declare five types:

| Type               | Required relations                                         |
| ------------------ | ---------------------------------------------------------- |
| `hi`, `add`, `del` | Attached to exactly one Text                               |
| `person`           | Attached to exactly one Text; refers to exactly one Person |
| `place`            | Attached to exactly one Text; refers to exactly one Place  |

The first three names are inspired by [TEI elements](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/REF-ELEMENTS.html).
These are project rules, not a TEI schema or conversion implementation.

Annotation already has `uuid` and `type`. No extra property is needed here.
A custom property inherited from a refined node can be selected by reference in a type's
`properties`. A property declared inside a type belongs only to that type.

## 4. Two RAMEN project levels

Extend [Correspondence into a specific edition](../examples/ramen-levels.ts).
Refine Letter and Witness, reuse Text, and select the edition's relations again.
The example checks that `title` is inherited without declaring it again.

These are two project levels above RAMEN. Every level can only select relations
permitted by its predecessor.

## Later topics

After these four examples: custom properties and data types, interface suggestions,
validation errors, import and export, and the graph behind model resolution.

Each guide should show one goal, short code, its concrete result and one rejected case.
Keep runnable code in `examples/`; all examples are checked by `npm run verify`.
