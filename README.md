# ScritHTML v2.0 (Pragmatic Era)

> **The Pragmatic Reactive UI Utility.** Familiar syntax, zero build steps, and maximum maintainability.

Scrit v2.0 shifts toward industry-standard patterns like `@event` and `:attribute` directives, drastically reducing learning cost while maintaining its ultra-lightweight (under 5KB) footprint.

## 💎 Why Scrit v2.0?

- **Familiar Patterns**: Uses `@click`, `:style`, and `s-if` syntax aligned with Vue/Alpine/Svelte.
- **Pure HTML**: No JSX or complex templating. Logic lives in attributes and standard tags.
- **Zero Build Debt**: No npm, no webpack. Just a script tag for instant reactivity.
- **State Blocks**: Declare application state using standard JS objects in `<script type="scrit/state">`.

## ⚡ Quick Start

Simply include the runtime and start writing Scrit attributes.

```html
<script src="scrit.js"></script>

<script type="text/scrit">
  <!-- Define State -->
  <script type="scrit/state">{ count: 0 }</script>

  <section class="counter-ui">
    <h1>Count is: {count}</h1>
    
    <button @click="count++">
      Increment
    </button>
  </section>

  <!-- Conditional Logic -->
  <p s-if="count > 10">
    Wow, that's a high number!
  </p>
</script>
```

## 🌟 Key Features

| Feature | Description |
| :--- | :--- |
| **Directives** | `@event`, `:class`, `:style` and more for declarative UI. |
| **Structural Logic** | `s-if` and `s-for` directly on standard HTML elements. |
| **Unified State** | Standard JS objects via `<script type="scrit/state">`. |
| **Components** | Create reusable UI elements with `<component>` and `<slot>`. |
| **Performance** | Automated update batching at 60fps with zero build step. |
| **Pure JS Logic** | Native JS within event handlers and attribute expressions. |

## 📂 Project Structure

- `scrit.js`: The core runtime engine.
- `/website`: Official premium portal & documentation.
  - `index.html`: Main landing page with interactive demos.
  - `Learn.html`: 3-step interactive tutorial.
  - `Docs.html`: Complete API reference.
- `LICENSE`: Open-source MIT License.

## 🛠️ Roadmap

- [x] v2.0: Pragmatic Era (Directives, Unified State, Batching).
- [ ] v2.1: Server-side rendering bridge.
- [ ] v2.2: DevTools browser extension.

---

Built with ❤️ for the web.
