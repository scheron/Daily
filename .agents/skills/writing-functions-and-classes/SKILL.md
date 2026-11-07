---
name: writing-functions-and-classes
description: Use when declaring any function, method, or class — choosing between a `function` declaration, an arrow and an object method, ordering a class's members, or naming and marking its private members. Applies whenever you write `const x = () =>`, `#field`, a `private` member or a `constructor`.
---

# Writing Functions and Classes

Applies to all code.

## A named function is a `function` declaration

Never bind an arrow to a name.

```ts
function formatPercent(value: number) {
  return `${value}%`
}
```

```ts
const formatPercent = (value: number) => `${value}%`
```

The second is wrong: an arrow assigned to a `const` is a named function and must be a declaration.

## An arrow is only an inline callback

An arrow stays where it is passed — as an argument, or as a value inside an object passed as an argument (a getter or a callback in an options object) — and cannot be a declaration:

```ts
const names = users.map((user) => user.name)
useCollapse(panelRef, {disabled: () => props.disabled})
```

A callback that needs a name, or is used twice, becomes a `function` declaration.

## An arrow where lexical `this` is needed

An arrow is allowed when it needs the surrounding `this` and is returned from a function (an unsubscribe). The empty fallback `?? (() => {})` is allowed too.

```ts
on(event: string, handler: Handler) {
  this._handlers.set(event, handler)
  return () => this.off(event, handler)
}
```

## A function-valued property is a method

In an object you declare, a function-valued property is written as a method:

```ts
const formatters = {
  json(value: unknown) {
    return value ? JSON.stringify(value, null, 2) : ""
  },
}
```

Not `json: (value) => …` or `json: function (value) …`.

## Public before private

Public members and exports come first, private members and helpers last. A `<script setup>` block follows **structuring-script-setup** instead (Vue). In a class the fields come first, then the constructor, then the public methods, then the private ones:

```ts
export class Counter {
  readonly step: number
  private _count = 0

  constructor(step: number) {
    this.step = step
  }

  increment() {
    this._count += this.step
    this._notify()
  }

  private _notify() {
    console.log(this._count)
  }
}
```

## Private class members: `private _x`

Privacy is the TypeScript `private` modifier, never the `#x` syntax. **Every** private field and method carries the `_` prefix, so a private member reads as one at the call site.

A member without the `_` prefix is public. A class whose method is private to it is not widened for a test (**writing-tests**).

## Common mistakes

- `const fn = () => …` at module level or inside a function.
- `#field` instead of `private _field`.
- `private field` without the underscore, or `_field` without `private`.
- An arrow as a property of an object you declare, when it does not need lexical `this`.
- A private helper above the public members, or the constructor above the fields.
