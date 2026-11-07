# View, workflow and UI mechanisms

Use this guide when creating or reviewing the boundary between a component and its composables. It does not ask for a ViewModel class, nor for a composable behind every component.

## Decide before moving code

1. Name the behaviour in user or domain terms. Identify its data, its state transitions, its external operations and its visual dependencies.
2. Assign each concern with the table below. One function can hold more than one concern; split the orchestration instead of moving it whole.
3. Check the dependency direction: the View composes workflow state, workflow actions and UI mechanisms. A workflow never finds the View through template names and never manipulates its child instances.

| Concern                            | Owner                                         | Examples                                                                                                                                |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Template and local visual behavior | the `.vue` View                               | template refs, disclosure of an optional field, focus and caret, layout measurements, badge alignment, CSS classes, local captions      |
| Form and application logic         | bounded workflow composable                   | draft and validation, dirty and pending state, `canSave`, data filtering, load, save and delete, cancellation, retry, leave protection  |
| Shared domain data and operations  | cohesive store with bounded local composables | catalog cache, progress, mutations, sync, durable state                                                                                 |
| Earned UI mechanism                | bounded UI composable with explicit inputs    | resize handle, swipe recognition and settling, virtual list measurement and ranges, drag protocol, interruptible animation with cleanup |
| Meaningful pure computation        | narrow utility                                | a domain calculation, parsing, a nontrivial transformation; native operations for transparent queries                                   |

An open flag is not enough to choose an owner. Expanding an extra input is View state. A submission in progress or an unsaved draft is workflow state. Dragging and settling can be the internal protocol state of a UI mechanism. Operation availability such as `canSave` stays with its validation; the View binds that value to its button.

A watcher and a lifecycle hook belong to the concern they serve. Focusing an input after it appears stays in the View. A subscription that reloads the active record belongs with that load workflow. A gesture's listeners, animation handles and disposal stay together in its mechanism. Timer and animation-frame calls alone do not make logic application logic.

## Two pairs

- **A form page and its form workflow.** The page declares its template refs (`formRef`, `alertRef`), binds visual state and calls `watchScrollIntoView(alertRef)`. `useProfileForm` receives what it needs from the form and owns the form state, validation, saving and leave protection. The workflow returns its result and state, and the page decides when to scroll, focus or animate.
- **A bottom sheet and its drag mechanism.** The sheet owns its open model and its close interaction. `useSheetDrag` receives the sheet's element ref and owns the gesture protocol and its cleanup.

Disclosure and focus of a card's optional fields do not earn a composable. A list screen composes filtering and virtualization itself and owns its header geometry. A complex swipe protocol earns a composable that receives its element refs from the View. A child component instance never moves into a workflow just to hide these visual operations.

## Avoid both mechanical extremes

- Do not empty `<script setup>` into a `useScreen` function that just forwards bindings, or mixes DOM, stores, navigation, formatting and unrelated workflows.
- Do not keep every UI mechanism in the View: a complex, cohesive gesture or animation earns an explicit composable, even with one caller.
- Do not replace every DOM argument with a callback to make the dependency look abstract. Separate the actual responsibility; callbacks alone do not make a workflow independent of its View.
- Do not create wrappers for a ref assignment, a native array lookup or a single composable call that add no policy or lifetime of their own.

Done when each moved concern has an explicit owner, named template refs stay discoverable in the matching View, workflow state does not depend on template structure, and existing cancellation, atomic writes, stale guards and UI protocol cleanup are preserved.

## Sources

- [Microsoft: MVVM](https://learn.microsoft.com/en-us/dotnet/architecture/maui/mvvm) separates View structure and visual behavior from bindable state, commands and model coordination, and explicitly leaves visual behavior such as animations in the View.
- [Vue: Composables](https://vuejs.org/guide/reusability/composables) describes composing stateful logic, UI mechanisms and DOM effects included. A composable is not a synonym for a ViewModel.
- [Vue: Template Refs](https://vuejs.org/guide/essentials/template-refs) shows element refs owned by the component and focus behavior. Keeping named refs in the View is the convention here; passing refs into an earned mechanism remains ordinary Vue composition.

The external sources supply the distinction, not a stack to adopt.
