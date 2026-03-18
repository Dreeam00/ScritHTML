/**
 * ScritHTML v2.0-pragmatic
 */

class Scrit {
    static version = '2.0-pragmatic';

    static run(source, container) {
        console.time('Scrit Init');
        const tokens = new Tokenizer(source).tokenize();
        const ast = new Parser(tokens).parse();
        const runtime = new Runtime(container);
        runtime.execute(ast);
        console.timeEnd('Scrit Init');
        if (container === document.body) {
            container.__sc_managed = true;
        }
        window.__ScritRuntime = runtime;
        return runtime;
    }

    static getStore(name) {
        if (!window.__ScritRuntime) {
            console.error('Scrit runtime not initialized');
            return null;
        }
        return window.__ScritRuntime.stores[name] || null;
    }

    static boot() {
        if (window.__ScritBooted) {
            console.warn('Scrit already booted, skipping duplicate initialization');
            return;
        }
        window.__ScritBooted = true;

        document.addEventListener('DOMContentLoaded', () => {
            // Method 1: Check for <script type="text/scrit">
            const scripts = document.querySelectorAll('script[type="text/scrit"]');
            if (scripts.length > 0) {
                scripts.forEach(script => {
                    const containerId = script.getAttribute('data-container');
                    const container = containerId ? document.getElementById(containerId) : document.body;
                    Scrit.run(script.textContent || script.innerHTML, container);
                });
            } else {
                // Method 2: Auto-detect Scrit tags in body
                const body = document.body;
                const bodySource = body.innerHTML;
                const scritTags = ['store', 'component', 'if', 'for', 'await', 'event', 'switch', 'func', 'memo', 'let', 's-state'];

                // Check for Scrit-specific syntax in the raw HTML, which is more reliable
                // for custom syntax like <$var> or {expressions}.
                const hasScritSyntax =
                    /<\$|\s:|\s@|\srev=|\suse:|\{.*?\}/.test(bodySource);

                let hasScritTag = false;
                if (!hasScritSyntax) {
                    // Fallback to querySelector for standard custom tags if no unique syntax patterns are found.
                    for (const tag of scritTags) {
                        if (body.querySelector(tag)) {
                            hasScritTag = true;
                            break;
                        }
                    }
                }

                if (hasScritSyntax || hasScritTag) {
                    if (body.__sc_managed) { // Added check
                        console.warn('Scrit body already managed, skipping auto-re-initialization');
                        return; // Skip if already managed
                    }
                    // Extract body content as Scrit source
                    const source = body.innerHTML;
                    body.innerHTML = ''; // Clear body - only if not managed already
                    Scrit.run(source, body);
                }
            }
        });
    }
}


// --- Reactivity System ---
let activeEffect = null;
const queue = new Set();
let isPending = false;

function flushQueue() {
    isPending = false;
    const jobs = Array.from(queue);
    queue.clear();
    jobs.forEach(job => job());
}

function queueJob(job) {
    queue.add(job);
    if (!isPending) {
        isPending = true;
        Promise.resolve().then(flushQueue);
    }
}

class Dep {
    constructor() {
        this.subscribers = new Set();
    }
    depend() {
        if (activeEffect) {
            this.subscribers.add(activeEffect);
        }
    }
    notify() {
        this.subscribers.forEach(sub => queueJob(sub));
    }
}

function createSignal(initialValue) {
    let value = initialValue;
    const dep = new Dep();

    const getter = () => {
        dep.depend();
        return value;
    };

    const setter = (newValue) => {
        if (value !== newValue) {
            value = newValue;
            dep.notify();
        }
    };

    return [getter, setter];
}

function createEffect(fn) {
    const effect = () => {
        activeEffect = effect;
        try {
            fn();
        } catch (e) {
            console.error("Effect Error:", e);
        } finally {
            activeEffect = null;
        }
    };
    effect();
}

function createMemo(fn) {
    const [get, set] = createSignal();
    createEffect(() => set(fn()));
    return get;
}

// v2.0: Reactive Proxy for State Objects
const proxyCache = new WeakMap();

function createReactiveObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    // Prevent double-proxying or reuse existing proxy
    if (obj.__is_sc_proxy) return obj;
    if (proxyCache.has(obj)) return proxyCache.get(obj);

    const deps = new Map();
    const getDep = (prop) => {
        if (!deps.has(prop)) deps.set(prop, new Dep());
        return deps.get(prop);
    };

    const proxy = new Proxy(obj, {
        get(target, prop) {
            if (prop === '__is_sc_proxy') return true;
            if (prop === '__sc_raw') return target;
            getDep(prop).depend();
            const val = Reflect.get(target, prop);
            return (val && typeof val === 'object') ? createReactiveObject(val) : val;
        },
        set(target, prop, val) {
            const oldVal = target[prop];
            if (oldVal !== val) {
                Reflect.set(target, prop, val);
                getDep(prop).notify();
            }
            return true;
        }
    });
    proxyCache.set(obj, proxy);
    return proxy;
}

// --- Tokenizer ---
class Tokenizer {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.tokens = [];
    }

    tokenize() {
        while (this.pos < this.input.length) {
            const char = this.input[this.pos];

            if (char === '<') {
                // Check if it's actually a tag start or just a less-than sign
                const nextChar = this.input[this.pos + 1];
                const isTag = /[a-zA-Z0-9_\-\$\/!]/.test(nextChar); // Simple heuristic

                if (isTag) {
                    if (this.input.startsWith('</', this.pos)) {
                        this.readCloseTag();
                    } else if (this.input.startsWith('<!--', this.pos)) {
                        this.readComment();
                    } else {
                        this.readOpenTag();
                    }
                } else {
                    // Treat as text
                    this.readText();
                }
            } else if (/\s/.test(char)) {
                this.readText();
            } else {
                this.readText();
            }
        }
        return this.tokens;
    }

    readOpenTag() {
        this.pos++; // skip <

        let isVariableDef = false;
        if (this.input[this.pos] === '$') {
            isVariableDef = true;
            this.pos++;
        }

        let tagName = this.readTagName();
        let attributes = this.readAttributes();
        let isSelfClosing = false;

        while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
            this.pos++;
        }

        if (this.input.startsWith('/>', this.pos)) {
            isSelfClosing = true;
            this.pos += 2;
        } else {
            this.pos++; // skip >
        }

        this.tokens.push({
            type: 'TagOpen',
            name: tagName,
            isVariableDef: isVariableDef,
            attributes: attributes,
            isSelfClosing: isSelfClosing
        });
    }

    readCloseTag() {
        this.pos += 2; // skip </
        let tagName = this.readTagName();
        while (this.pos < this.input.length && this.input[this.pos] !== '>') {
            this.pos++;
        }
        this.pos++; // skip >
        this.tokens.push({
            type: 'TagClose',
            name: tagName
        });
    }

    readTagName() {
        let start = this.pos;
        // Allow dot and colon/at (v2.0) in tag names if needed, though usually for attributes
        while (this.pos < this.input.length && /[a-zA-Z0-9_\-\$\.\:@]/.test(this.input[this.pos])) {
            this.pos++;
        }
        return this.input.slice(start, this.pos);
    }

    readAttributes() {
        const attrs = {};
        while (this.pos < this.input.length) {
            while (/\s/.test(this.input[this.pos])) this.pos++;

            if (this.input[this.pos] === '/' || this.input[this.pos] === '>') break;

            let nameStart = this.pos;
            // Attribute names allow :, @, $, . (v2.0)
            while (this.pos < this.input.length && /[^=\s\/>]/.test(this.input[this.pos])) {
                this.pos++;
            }
            let name = this.input.slice(nameStart, this.pos);
            if (!name) break; // Safety

            while (/\s/.test(this.input[this.pos])) this.pos++;

            if (this.input[this.pos] === '=') {
                this.pos++;
                while (/\s/.test(this.input[this.pos])) this.pos++;

                let value = '';
                if (this.input[this.pos] === '"' || this.input[this.pos] === "'") {
                    let quote = this.input[this.pos];
                    this.pos++;
                    let valStart = this.pos;
                    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
                        // Support escaped quotes
                        if (this.input[this.pos] === '\\' && this.input[this.pos + 1] === quote) {
                            this.pos += 2;
                        } else {
                            this.pos++;
                        }
                    }
                    value = this.input.slice(valStart, this.pos);
                    this.pos++;

                    // Special case: "{expr}" -> treat as expression
                    if (value.startsWith('{') && value.endsWith('}')) {
                        attrs[name] = { type: 'expression', value: value.slice(1, -1) };
                        continue;
                    }
                } else if (this.input[this.pos] === '{') {
                    // Improved nested brace tracking
                    let braceCount = 0;
                    let valStart = this.pos + 1;
                    while (this.pos < this.input.length) {
                        if (this.input[this.pos] === '{') braceCount++;
                        if (this.input[this.pos] === '}') braceCount--;
                        this.pos++;
                        if (braceCount === 0) break;
                    }
                    value = this.input.slice(valStart, this.pos - 1);
                    attrs[name] = { type: 'expression', value };
                    continue;
                } else {
                    let valStart = this.pos;
                    while (this.pos < this.input.length && !/\s/.test(this.input[this.pos]) && this.input[this.pos] !== '>' && this.input[this.pos] !== '/') {
                        this.pos++;
                    }
                    value = this.input.slice(valStart, this.pos);
                }
                attrs[name] = value;
            } else {
                attrs[name] = true;
            }
        }
        return attrs;
    }

    readText() {
        let start = this.pos;
        // Stop at < only if it looks like a tag, OR just stop at < and let main loop decide?
        // If main loop decides it's not a tag, it calls readText again?
        // That would be infinite loop if we don't advance.
        // So: Read until we find a < that LOOKS like a tag.

        while (this.pos < this.input.length) {
            if (this.input[this.pos] === '<') {
                const nextChar = this.input[this.pos + 1];
                if (/[a-zA-Z0-9_\-\$\/!]/.test(nextChar)) {
                    break;
                }
            }
            this.pos++;
        }

        let text = this.input.slice(start, this.pos);
        if (text) {
            this.tokens.push({ type: 'Text', value: text });
        } else if (this.pos < this.input.length && this.input[this.pos] !== '<') {
            // Force advance if stuck? 
            this.pos++;
        }
    }

    readComment() {
        this.pos += 4; // skip <!--
        while (this.pos < this.input.length) {
            if (this.input[this.pos] === '-' && this.input[this.pos + 1] === '-' && this.input[this.pos + 2] === '>') {
                this.pos += 3; // skip -->
                break;
            }
            this.pos++;
        }
    }

    readWhitespace() {
        let start = this.pos;
        while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
            this.pos++;
        }
        this.tokens.push({ type: 'Text', value: this.input.slice(start, this.pos) });
    }
}


// --- Parser ---
class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    parse() {
        const root = { type: 'Fragment', children: [] };
        while (this.pos < this.tokens.length) {
            root.children.push(this.parseNode([]));
        }
        return root;
    }

    parseNode(ancestors = []) {
        const token = this.tokens[this.pos];
        if (token.type === 'Text') {
            this.pos++;
            return { type: 'Text', value: token.value };
        }
        if (token.type === 'TagOpen') {
            this.pos++;
            const node = {
                type: 'Element',
                name: token.name,
                isVariableDef: token.isVariableDef,
                attributes: token.attributes,
                children: []
            };

            if (token.isSelfClosing) {
                return node;
            }

            const voidTags = ['img', 'br', 'input', 'hr', 'meta', 'link'];
            if (voidTags.includes(node.name)) {
                return node;
            }

            while (this.pos < this.tokens.length) {
                const next = this.tokens[this.pos];
                if (next.type === 'TagClose') {
                    // 1. Matches current node?
                    if (next.name === node.name || next.name === '' || (node.isVariableDef && next.name === '$' + node.name)) {
                        this.pos++;
                        break;
                    }
                    // 2. Matches an ancestor? (Missing closing tag for current node)
                    // If next.name is in ancestors, it means current node `node.name` is unclosed.
                    // We should break to return control to the ancestor matching `next.name`.
                    if (ancestors.includes(next.name)) {
                        // Don't consume the token. Let parent handle it.
                        break;
                    }

                    // 3. Orphan closing tag (doesn't match current or any ancestor)
                    // Treat as text or ignore. 
                    // To be safe, consume it so we don't loop forever, but maybe treat as text?
                    // For simplicity, just skip/ignore.
                    this.pos++;
                    continue;
                }
                node.children.push(this.parseNode([...ancestors, node.name]));
            }
            return node;
        }

        return { type: 'Error', value: token };
    }
}

// --- Runtime ---
class Runtime {
    constructor(container) {
        console.log('Runtime constructor called for container:', container);
        this.container = container;
        this.scope = {};
        this.components = {};
        this.stores = {};
        this.directives = {};

        // Default Directives
        this.directives['highlight'] = (el, val) => {
            el.style.backgroundColor = val || '';
            el.style.transition = 'background 0.5s';
        };
        this.directives['tooltip'] = (el, val) => el.title = val;
        this.directives['focus'] = (el) => setTimeout(() => el.focus(), 0);
        this.directives['bind'] = (el, storePath, scope) => {
            if (!storePath || typeof storePath !== 'string') return;
            const parts = storePath.split('.');
            if (parts.length < 2) return;
            
            const storeName = parts[0];
            const propName = parts.slice(1).join('.');
            const store = this.stores[storeName];
            if (!store) return;
            
            let target = store;
            const keys = propName.split('.');
            const lastKey = keys[keys.length - 1];
            
            for (let i = 0; i < keys.length - 1; i++) {
                target = target[keys[i]];
                if (!target) return;
            }
            
            if (el.type === 'range' || el.type === 'number') {
                el.addEventListener('input', (e) => {
                    const val = el.type === 'range' ? parseInt(e.target.value) : parseFloat(e.target.value);
                    target[lastKey] = val;
                });
                createEffect(() => {
                    el.value = target[lastKey];
                });
            } else {
                el.addEventListener('input', (e) => {
                    target[lastKey] = e.target.value;
                });
                createEffect(() => {
                    el.value = target[lastKey];
                });
            }
        };
    }

    decodeEntities(text) {
        if (!text || typeof text !== 'string') return text;
        const entities = {
            '&lt;': '<',
            '&gt;': '>',
            '&amp;': '&',
            '&quot;': '"',
            '&#39;': "'",
            '&apos;': "'"
        };
        return text.replace(/&lt;|&gt;|&amp;|&quot;|&#39;|&apos;/g, m => entities[m]);
    }

    execute(ast) {
        this.renderNode(ast, this.container, this.scope);
    }

    handleError(e, context) {
        // 1. Log to console as before
        console.error("Scrit Error:", e, "Context:", context);

        // 2. Ensure CSS is injected
        if (!document.getElementById('__scrit-error-styles')) {
            const style = document.createElement('style');
            style.id = '__scrit-error-styles';
            style.innerHTML = `
                .sc-error-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.8);
                    color: white;
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: monospace;
                    text-align: left;
                }
                .sc-error-box {
                    background-color: #2a0000;
                    border: 2px solid red;
                    padding: 2em;
                    max-width: 80%;
                    max-height: 80%;
                    overflow: auto;
                }
                .sc-error-box h3 { color: red; margin-top: 0; }
                .sc-error-box pre { white-space: pre-wrap; background-color: #1a0000; padding: 1em; border-radius: 5px; }
            `;
            document.head.appendChild(style);
        }

        // 3. Create and show error overlay
        const existingOverlay = document.querySelector('.sc-error-overlay');
        if (existingOverlay) existingOverlay.remove(); // Remove previous error first

        const overlay = document.createElement('div');
        overlay.className = 'sc-error-overlay';
        overlay.innerHTML = `
            <div class="sc-error-box">
                <h3>ScritHTML Error</h3>
                <p><strong>Failed to evaluate expression:</strong></p>
                <pre>${context}</pre>
                <p><strong>Error:</strong></p>
                <pre>${e.stack || e.message}</pre>
                <p style="text-align:center; opacity: 0.7;">Click anywhere to dismiss.</p>
            </div>
        `;
        // Make it dismissable
        overlay.addEventListener('click', () => overlay.remove());

        // Append to container or body
        (this.container || document.body).appendChild(overlay);
    }

    evaluate(expression, scope, asStatement = false) {
        // Handle expression objects from Tokenizer
        const expr = (typeof expression === 'object' && expression.type === 'expression')
            ? expression.value
            : expression;

        if (!expr) return undefined;
        // Merge stores into scope for evaluation
        const evaluationScope = { ...this.stores, ...scope };

        const SAFELIST = {
            Math: Math,
            JSON: JSON,
            Object: Object,
            Array: Array,
            String: String,
            Number: Number,
            Boolean: Boolean,
            Date: Date,
            parseInt: parseInt,
            parseFloat: parseFloat,
            isNaN: isNaN,
            isFinite: isFinite,
            console: { log: console.log, warn: console.warn, error: console.error },
        };

        const runtime = this;
        const scopeProxy = new Proxy(evaluationScope, {
            get(target, prop) {
                if (prop in target) {
                    const val = target[prop];
                    if (Array.isArray(val) && typeof val[0] === 'function') {
                        return val[0]();
                    }
                    return val;
                }
                if (prop in SAFELIST) {
                    return SAFELIST[prop];
                }
                // Block access to other globals
                if (typeof prop === 'string' && !prop.startsWith('__') && prop !== 'then' && prop !== 'Symbol(Symbol.unscopables)') {
                   console.warn(`[Scrit Security] Blocked access to global property: ${String(prop)}`);
                }
                return undefined;
            },
            has(target, prop) {
                return (prop in target) || (prop in SAFELIST);
            },
            set(target, prop, value) {
                // 1. Try to set in local scope
                if (prop in target) {
                    if (Array.isArray(target[prop]) && typeof target[prop][1] === 'function') {
                        target[prop][1](value);
                        return true;
                    }
                    target[prop] = value;
                    return true;
                }
                // 2. Try to set in global stores
                if (runtime.stores && prop in runtime.stores) {
                    if (Array.isArray(runtime.stores[prop]) && typeof runtime.stores[prop][1] === 'function') {
                        runtime.stores[prop][1](value);
                        return true;
                    }
                    runtime.stores[prop] = value;
                    return true;
                }
                // Default behavior: set on the target (local scope)
                target[prop] = value;
                return true;
            }
        });

        try {
            const trimmed = expr.trim();
            if (asStatement) {
                const body = `with(this) {\n${expr}\n}`;
                return new Function(body).call(scopeProxy);
            }

            // It's an expression
            let body;
            if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
                 body = `with(this) {\nreturn ${expr};\n}`;
            } else {
                // Detection for object literals
                const isObjectLiteral = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.includes(':') && !trimmed.includes(';') && !trimmed.includes('return') && !trimmed.includes('if'));

                body = isObjectLiteral
                    ? `with(this) {\nreturn (\n${trimmed.startsWith('{') ? expr : '{' + expr + '}'}\n); \n}`
                    : `with(this) {\nreturn (\n${expr}\n); \n}`;
            }

            const fn = new Function(body);
            return fn.call(scopeProxy);
        } catch (e) {
            // v2.0 fallback: If it looks like a stripped object literal, try wrapping it
            if (!asStatement && typeof expr === 'string' && expr.includes(':') && !expr.trim().startsWith('{')) {
                try {
                    const retryBody = `with(this) {\nreturn (\n{${expr}}\n); \n}`;
                    const fn = new Function(retryBody);
                    return fn.call(scopeProxy);
                } catch (e2) {}
            }
            this.handleError(e, expr);
            return null;
        }
    }

    // Helper to interpolate strings with {expr}
    interpolate(text, scope) {
        if (!text) return '';
        return text.replace(/\{([\s\S]+?)\}/g, (match, expr) => {
            const val = this.evaluate(expr, scope);
            return (val !== undefined && val !== null) ? val : '';
        });
    }

    executeStatement(statement, scope) {
        if (!statement) return;
        let js = statement;

        // Hide comments to avoid processing Scrit tags inside them
        const comments = [];
        js = js.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, (m) => {
            comments.push(m);
            return `__SC_COMMENT_VAL_${comments.length - 1}__`;
        });

        // 1. Shorthand for increment/decrement: <$var>++</> or <$var>++</$var>
        js = js.replace(/<\$([a-zA-Z0-9_\.]+)>\s*(\+\+|--)\s*(?:<\/\$?\1>|<\/\$>)/g, (m, name, op) => {
            const val = op === '++' ? 1 : -1;
            if (name.includes('.')) return `${name} = (${name} || 0) + (${val})`;
            return `scope['${name}'][1](scope['${name}'][0]() + (${val}))`;
        });

        // 2. Shorthand for assignment: <$var>=expr</>
        js = js.replace(/<\$([a-zA-Z0-9_\.]+)>\s*=(.*?)(?:<\/\$?\1>|<\/\$>)/g, (m, name, expr) => {
            if (name.includes('.')) return `${name} = (${expr})`;
            return `scope['${name}'][1](${expr})`;
        });

        // 3. Shorthand for cumulative ops: <$var>+=expr</>
        js = js.replace(/<\$([a-zA-Z0-9_\.]+)>\s*([+\-*\/%]=)(.*?)(?:<\/\$?\1>|<\/\$>)/g, (m, name, op, expr) => {
            const operator = op.slice(0, 1);
            if (name.includes('.')) return `${name} = ${name} ${operator} (${expr})`;
            return `scope['${name}'][1](scope['${name}'][0]() ${operator} (${expr}))`;
        });

        // 4. Shorthand for array push: <$var>push(item)</>
        js = js.replace(/<\$([a-zA-Z0-9_\.]+)>\s*push\((.*?)\)\s*(?:<\/\$?\1>|<\/\$>)/g, (m, name, expr) => {
            if (name.includes('.')) return `(function(){ const c = ${name}; ${name} = [...(Array.isArray(c)?c:[]), ${expr}]; })()`;
            return `(function(){ const c = scope['${name}'][0](); scope['${name}'][1]([...(Array.isArray(c)?c:[]), ${expr}]); })()`;
        });

        // 5. Generic fallback for variable update: <$var>expr</$var>
        js = js.replace(/<\$([a-zA-Z0-9_\.]+)>([\s\S]*?)(?:<\/\$?\1>|<\/\$>)/g, (m, name, expr) => {
            if (name.includes('.')) return `${name} = (function(){ ${expr} })()`;
            return `scope['${name}'][1]((function(){ ${expr} })())`;
        });

        //Restore comments
        js = js.replace(/__SC_COMMENT_VAL_(\d+)__/g, (m, id) => comments[parseInt(id)]);

        // 6. Declarative Logic: <if>, <switch>
        let prevJs;
        do {
            prevJs = js;
            js = js.replace(/<if\s+rev="([^"]+)"\s*>([\s\S]*?)(?:<else\s*>([\s\S]*?)<\/else>)?<\/if>/g, (m, rev, thenBody, elseBody) => {
                return `if (${rev}) { ${thenBody} } ${elseBody ? `else { ${elseBody} }` : ''}`;
            });
            js = js.replace(/<switch\s*>([\s\S]*?)<\/switch>/g, (m, body) => {
                let cases = body.replace(/<case\s+when="([^"]+)"\s*>([\s\S]*?)<\/case>/g, (m2, when, caseBody) => {
                    return `if (${when}) { ${caseBody} } else `;
                });
                cases = cases.replace(/<default\s*>([\s\S]*?)<\/default>/g, (m3, defBody) => {
                    return `{ ${defBody} }`;
                });
                if (cases.trim().endsWith('else')) cases = cases.trim().slice(0, -4);
                return `(function(){ ${cases} })()`;
            });
        } while (js !== prevJs);

        this.evaluate(js, scope, true);
    }

    // Helper to reconstruct source code from AST node (for <event> content)
    reconstructSource(node) {
        if (node.type === 'Text') return node.value;
        if (node.type === 'Element') {
            if (node.isVariableDef) {
                // <$count>...
                let content = node.children.map(c => this.reconstructSource(c)).join('');
                return `<\$${node.name}>${content}</\$${node.name}>`;
            }
            // Other elements inside event? reconstruct them
            let content = node.children.map(c => this.reconstructSource(c)).join('');
            // attributes? 
            let attrs = Object.entries(node.attributes).map(([k, v]) => {
                if (v === true) return k;
                if (typeof v === 'object') return `${k}="{${v.value}}"`;
                return `${k}="${v}"`;
            }).join(' ');
            if (attrs) attrs = ' ' + attrs;

            // Self closing?
            if (node.children.length === 0) return `<${node.name}${attrs}/>`;
            return `<${node.name}${attrs}>${content}</${node.name}>`;
        }
        return '';
    }

    // slotChildren: Nodes passed from parent to be rendered in <slot>
    // slotScope: Scope of the parent (where slot children were defined)
    renderNode(node, parent, scope, slotChildren = [], slotScope = null, isInsideCodeDisplay = false) {
        if (node.type === 'Fragment' || node.name === 'fragment') {
            node.children.forEach(c => this.renderNode(c, parent, scope, slotChildren, slotScope, isInsideCodeDisplay));
            return;
        }

        if (node.type === 'Text') {
            if (isInsideCodeDisplay) { // If inside a code block, just render text
                parent.appendChild(document.createTextNode(this.decodeEntities(node.value)));
                return;
            }
            // Check for interpolation { expr }
            const regex = /\{([^{}]+)\}/g;
            let lastIndex = 0;
            let match;

            while ((match = regex.exec(node.value)) !== null) {
                // Static text before
                if (match.index > lastIndex) {
                    const staticText = node.value.slice(lastIndex, match.index);
                    parent.appendChild(document.createTextNode(this.decodeEntities(staticText)));
                }

                // Expression
                const expr = match[1];
                const textNode = document.createTextNode('');
                parent.appendChild(textNode);
                createEffect(() => {
                    try {
                        const val = this.evaluate(expr, scope);
                        textNode.textContent = (val !== undefined && val !== null) ? val : '';
                    } catch (e) { textNode.textContent = match[0]; }
                });

                lastIndex = regex.lastIndex;
            }

            // Remaining text
            if (lastIndex < node.value.length) {
                parent.appendChild(document.createTextNode(this.decodeEntities(node.value.slice(lastIndex))));
            }
            return;
        }

        if (node.type === 'Element') {
            const currentIsInsideCodeDisplay = isInsideCodeDisplay || node.name === 'pre' || node.name === 'code';

            // New Feature: <slot>
            if (node.name === 'slot') {
                if (slotChildren && slotChildren.length > 0) {
                    slotChildren.forEach(child => {
                        this.renderNode(child, parent, slotScope || scope, undefined, undefined, currentIsInsideCodeDisplay);
                    });
                }
                return;
            }


            // New Feature v2.0: <script type="scrit/state"> or <s-state>
            if ((node.name === 'script' && node.attributes.type === 'scrit/state') || node.name === 's-state') {
                const rawJs = node.children.map(c => c.value).join('');
                try {
                    const stateObj = this.evaluate(rawJs, scope);
                    if (stateObj && typeof stateObj === 'object') {
                        Object.entries(stateObj).forEach(([key, val]) => {
                            // If it's already a signal/reactive (unlikely here but for safety)
                            if (Array.isArray(val) && typeof val[0] === 'function') {
                                scope[key] = val;
                                this.stores[key] = val;
                            } else {
                                const reactive = (val && typeof val === 'object' && !Array.isArray(val)) ? createReactiveObject(val) : createSignal(val);
                                scope[key] = reactive;
                                this.stores[key] = reactive; // Sync to stores for external access
                            }
                        });
                    }
                } catch (e) {
                    console.error("State Init Error:", e);
                }
                return;
            }

            // New Feature: <style> (Reactive)
            if (node.name === 'style') {
                const styleEl = document.createElement('style');
                // Collect text content
                const rawText = node.children.map(c => c.value).join('');

                // Initial render: evaluate once and set content immediately
                let initialReplaced = rawText.replace(/\{([^{}]+)\}/g, (match, expr) => {
                    try {
                        const val = this.evaluate(expr.trim(), scope);
                        if (val !== undefined && val !== null) return val;
                    } catch (e) {
                        // Fail silently and keep original match for initial render if expression is invalid
                    }
                    return match;
                });
                styleEl.textContent = initialReplaced; // Set initial content

                parent.appendChild(styleEl); // Append AFTER content is set
                
                createEffect(() => {
                    const replaced = rawText.replace(/\{([^{}]+)\}/g, (match, expr) => {
                        try {
                            const val = this.evaluate(expr.trim(), scope);
                            if (val !== undefined && val !== null) return val;
                        } catch (e) {
                            // Syntax error -> likely standard CSS block
                        }
                        return match; // Keep original
                    });
                    styleEl.textContent = replaced;
                });
                return;
            }

            // New Feature: <event> (Tag-based)
            if (node.name === 'event') {
                // Must apply to parent Element
                if (parent instanceof Element) {
                    const eventName = node.attributes.name;
                    // Reconstruct from children recursively
                    const stmt = node.children.map(c => this.reconstructSource(c)).join('');

                    parent.addEventListener(eventName, (e) => {
                        this.executeStatement(stmt, { ...scope, $event: e });
                    });
                }
                return;
            }

            // New Feature: <switch>
            if (node.name === 'switch') {
                const anchor = document.createTextNode('');
                parent.appendChild(anchor);
                let renderedNodes = [];

                createEffect(() => {
                    renderedNodes.forEach(n => n.remove());
                    renderedNodes = [];

                    let targetChildren = [];
                    let matched = false;

                    // Iterate cases
                    for (const child of node.children) {
                        if (child.name === 'case') {
                            const whenExpr = child.attributes.when;
                            if (this.evaluate(whenExpr, scope)) {
                                targetChildren = child.children;
                                matched = true;
                                break;
                            }
                        }
                    }

                    if (!matched) {
                        const def = node.children.find(c => c.name === 'default');
                        if (def) targetChildren = def.children;
                    }

                    const frag = document.createDocumentFragment();
                    targetChildren.forEach(child => this.renderNode(child, frag, scope, slotChildren, slotScope, currentIsInsideCodeDisplay));
                    renderedNodes = Array.from(frag.childNodes);
                    if (anchor.parentNode) anchor.parentNode.insertBefore(frag, anchor.nextSibling);
                });
                return;
            }

            // New Feature: <func> definition
            if (node.name === 'func') {
                const name = node.attributes.name;
                const args = node.attributes.arg ? node.attributes.arg.split(',').map(s => s.trim()) : [];
                this.components[name] = { template: node.children, args: args, type: 'func' };
                return;
            }

            // Variable Definition <$varName> (v2.0)
            if (node.name.startsWith('$')) {
                const varName = node.name.slice(1); // Remove $ prefix
                const expr = node.children.map(c => c.value).join('').trim();
                const val = this.evaluate(expr, scope);
                const signal = createSignal(val);
                scope[varName] = signal;
                // Also add to stores for global access
                this.stores[varName] = signal;
                console.log(`✅ Variable defined: ${varName} =`, val, 'Signal:', signal);
                return;
            }

            // 10. Store Definition <store> (v1.2)
            if (node.name === 'store') {
                const name = node.attributes.name;
                const storeObj = {};
                // Parse children <value name="x">val</value>
                node.children.forEach(child => {
                    if (child.name === 'value') {
                        const key = child.attributes.name;
                        const expr = child.children.map(c => c.value).join('');
                        const val = this.evaluate(expr, scope);
                        // Make it reactive? Spec doesn't strictly say, but "Reactive UI" implies yes.
                        // Stores usually hold signals or are deep proxies.
                        // For simplicity v1.2: Store properties are Signals.
                        const signal = createSignal(val);
                        storeObj[key] = signal;
                    }
                });
                // Wrap store in Proxy to auto-unwrap signals
                const storeProxy = new Proxy(storeObj, {
                    get(target, prop) {
                        const val = target[prop];
                        if (Array.isArray(val) && typeof val[0] === 'function') {
                            return val[0]();
                        }
                        return val;
                    },
                    set(target, prop, value) {
                        // Allow setting signal value?
                        const val = target[prop];
                        if (Array.isArray(val) && typeof val[1] === 'function') {
                            val[1](value);
                            return true;
                        }
                        target[prop] = value;
                        return true;
                    }
                });
                this.stores[name] = storeProxy;
                return;
            }

            // 11. Memoization <memo> (v1.2)
            if (node.name === 'memo') {
                const name = node.attributes.name;
                const expr = node.attributes.rev;

                // Create memoized signal
                const memoGetter = createMemo(() => this.evaluate(expr, scope));

                // Add to current scope (like <$var> definitions)
                scope[name] = [memoGetter, () => { }]; // Read-only signal interface

                // If it has children, render them (though definition remains in scope)
                node.children.forEach(c => this.renderNode(c, parent, scope, slotChildren, slotScope, currentIsInsideCodeDisplay));
                return;
            }

            // 12. Async Await <await> (v1.2)
            if (node.name === 'await') {
                const promiseExpr = node.attributes.rev;
                const anchor = document.createTextNode('');
                parent.appendChild(anchor);
                let renderedNodes = [];

                const clear = () => {
                    renderedNodes.forEach(n => n.remove());
                    renderedNodes = [];
                };

                const renderBlock = (blockName, extraScope = {}) => {
                    clear();
                    const block = node.children.find(c => c.name === blockName);
                    if (block) {
                        const frag = document.createDocumentFragment();
                        const s = { ...scope, ...extraScope };
                        block.children.forEach(c => this.renderNode(c, frag, s, slotChildren, slotScope, currentIsInsideCodeDisplay));
                        renderedNodes = Array.from(frag.childNodes);
                        anchor.parentNode.insertBefore(frag, anchor.nextSibling);
                    }
                };

                createEffect(() => {
                    const promise = this.evaluate(promiseExpr, scope);
                    if (promise instanceof Promise) {
                        renderBlock('pending');
                        promise.then(data => {
                            renderBlock('then', { data: createSignal(data) });
                        }).catch(err => {
                            renderBlock('catch', { error: createSignal(err) });
                        });
                    }
                });
                return;
            }

            // 1. Variable Definition <$name>
            if (node.isVariableDef) {
                const name = node.name;
                const type = node.attributes.type || 'string';
                let rawText = node.children.map(c => c.value || '').join('');
                let val;

                const trimmedRawText = rawText.trim();

                // If it's explicitly an expression (e.g., starts with { or [), or a number, evaluate it.
                // Otherwise, treat as a string literal.
                if (
                    trimmedRawText.startsWith('{') || trimmedRawText.startsWith('[') ||
                    !isNaN(Number(trimmedRawText)) // Is a number
                ) {
                    try {
                        val = this.evaluate(rawText, scope);
                    } catch (e) {
                        this.handleError(e, `Failed to evaluate expression in variable definition for '${name}': ${rawText}`);
                        val = rawText; // Fallback to literal string if evaluation fails
                    }
                } else {
                    // Treat as a plain string literal
                    val = rawText;
                }

                const signal = createSignal(val);
                scope[name] = signal;
                this.stores[name] = signal; // Add to stores as well
                return;
            }

            // 2. Control Flow: <if>
            if (node.name === 'if') {
                const conditionExpr = node.attributes.rev;
                const anchor = document.createTextNode('');
                parent.appendChild(anchor);
                let renderedNodes = [];

                createEffect(() => {
                    console.log('IF Effect [START]: Clearing previous content for condition:', conditionExpr);
                    renderedNodes.forEach(n => n.remove()); // (1) Content is removed here
                    const condition = this.evaluate(conditionExpr, scope); // (2) Condition is evaluated
                    console.log('IF Effect [EVAL]: Evaluated condition:', condition, 'from expression:', conditionExpr, 'Current scope (docs.section):', scope.docs && scope.docs[0] ? scope.docs[0]() : 'N/A');
                    let targetChildren = [];
                    const elseNode = node.children.find(c => c.type === 'Element' && c.name === 'else');
                    const thenChildren = node.children.filter(c => c !== elseNode);
                    if (condition) targetChildren = thenChildren;
                    else if (elseNode) targetChildren = elseNode.children;

                    const fragment = document.createDocumentFragment();
                    targetChildren.forEach(child => this.renderNode(child, fragment, scope, slotChildren, slotScope, currentIsInsideCodeDisplay));
                    renderedNodes = Array.from(fragment.childNodes); // (3) New content is rendered and stored
                    if (renderedNodes.length > 0) {
                        anchor.parentNode.insertBefore(fragment, anchor.nextSibling); // (4) New content is inserted
                        console.log('IF Effect [END]: Rendered content for condition:', conditionExpr);
                    } else {
                        console.log('IF Effect [END]: Not rendering content for condition:', conditionExpr, ' (condition was false or no children)');
                    }
                });
                return;
            }

            // 3. Control Flow: <for>
            if (node.name === 'for') {
                let eachAttr = node.attributes['@each'];
                if (eachAttr && typeof eachAttr === 'object') eachAttr = eachAttr.value;

                // Flexible regex: support <$item in items>, <$item in="items">, <$item in="<items/>">
                const match = /^\s*<\s*\$([a-zA-Z0-9_]+)\s+in(?:="([^"]+)"|\s+([^>]+))\s*>\s*$/.exec(eachAttr);

                if (match) {
                    const iterName = match[1];
                    const collectionExprRef = (match[2] || match[3] || '').trim();
                    const varMatch = /<([a-zA-Z0-9_]+)\s*\/?>/.exec(collectionExprRef);
                    const collectionName = varMatch ? varMatch[1] : collectionExprRef;

                    const anchor = document.createTextNode('');
                    parent.appendChild(anchor);
                    let renderedItems = [];

                    createEffect(() => {
                        renderedItems.forEach(item => item.nodes.forEach(n => n.remove()));
                        renderedItems = [];

                        const collection = this.evaluate(collectionName, scope) || [];
                        if (Array.isArray(collection)) {
                            collection.forEach((itemVal) => {
                                const childScope = { ...scope };
                                childScope[iterName] = createSignal(itemVal);
                                const frag = document.createDocumentFragment();
                                node.children.forEach(child => this.renderNode(child, frag, childScope, slotChildren, slotScope, currentIsInsideCodeDisplay));
                                const nodes = Array.from(frag.childNodes);
                                renderedItems.push({ nodes });
                                // Insert logic
                                const lastItem = renderedItems[renderedItems.length - 2];
                                const lastNode = lastItem ? lastItem.nodes.at(-1) : anchor;
                                lastNode.parentNode.insertBefore(frag, lastNode.nextSibling);
                            });
                        }
                    });
                }
                return;
            }

            // 4. Pattern Match (<match>) - simplified to reuse switch logic style if rewriting, but keep existing
            if (node.name === 'match') {
                const valExpr = node.attributes.value;
                const anchor = document.createTextNode('');
                parent.appendChild(anchor);
                let renderedNodes = [];

                createEffect(() => {
                    renderedNodes.forEach(n => n.remove());

                    const val = this.evaluate(valExpr, scope);
                    const cases = node.children.filter(c => c.name === 'case');
                    const def = node.children.find(c => c.name === 'default');

                    let targetChildren = [];
                    let matched = false;

                    for (const c of cases) {
                        const isValString = c.attributes.is;
                        if (String(val) === String(isValString)) {
                            matched = true;
                            targetChildren = c.children;
                            break;
                        }
                    }
                    if (!matched && def) targetChildren = def.children;

                    if (targetChildren.length > 0) {
                        const frag = document.createDocumentFragment();
                        targetChildren.forEach(child => this.renderNode(child, frag, scope, slotChildren, slotScope, currentIsInsideCodeDisplay));
                        renderedNodes = Array.from(frag.childNodes);
                        anchor.parentNode.insertBefore(frag, anchor.nextSibling);
                    }
                });
                return;
            }

            // 5. Watch <watch>
            if (node.name === 'watch') {
                const varName = node.attributes.var;
                if (scope[varName]) {
                    let firstRun = true;
                    createEffect(() => {
                        scope[varName][0]();
                        if (firstRun) { firstRun = false; return; }
                        const dummyParent = document.createElement('div');
                        node.children.forEach(child => {
                            if (child.name === 'log') {
                                const content = child.children.map(c => c.value).join('');
                                console.log(`[Watch ${varName}]`, content);
                            } else this.renderNode(child, dummyParent, scope, undefined, undefined, currentIsInsideCodeDisplay);
                        });
                    });
                }
                return;
            }

            // 6. Local Variable <let>
            if (node.name === 'let') {
                const name = node.attributes.name;
                const expr = node.attributes.rev;
                const childScope = { ...scope };
                const signal = createSignal(null);
                childScope[name] = signal;
                const [get, set] = signal;
                createEffect(() => set(this.evaluate(expr, scope)));
                node.children.forEach(c => this.renderNode(c, parent, childScope, slotChildren, slotScope, currentIsInsideCodeDisplay));
                return;
            }

            // 7. Component Definition
            if (node.name === 'component') {
                const name = node.attributes.name.toLowerCase();
                this.components[name] = { template: node.children, type: 'component' };
                return;
            }

            // 8. Variable Reference <name/> or <obj.prop/>
            // ...
            
            // 9. Component/Func Instantiation
            const compName = node.name.toLowerCase();
            if (this.components[compName]) {
                const compDef = this.components[compName];
                const childScope = { ...scope };

                // Props
                if (compDef.type === 'func') {
                    // Map attributes to args
                    // "a" -> arg name
                    Object.entries(node.attributes).forEach(([key, val]) => {
                        // For Funcs, arguments might be expressions passed as strings
                        // <SumLine a="3" b="5"/> or <SumLine a="{x}" ... >
                        // If it's `a="<item/>"`?
                        // If it contains `<.../>`, we should perhaps resolve it?
                        // v1.1 Spec: `a="<item/>"` -> `evaluate` scope.
                        // Or if value is just "3", treat as string "3" or int?

                        // Heuristic: Try eval?
                        let evaluated = val;
                        // Check if it looks like variable ref `<item/>` or `{expr}`
                        if (typeof val === 'object' && val.type === 'expression') {
                            evaluated = this.evaluate(val.value, scope);
                        } else if (typeof val === 'string') {
                            if (val.match(/^<.+>$/)) {
                                // <item/> -> resolve
                                // Extract name
                                const m = /<([a-zA-Z0-9_]+)\/>/.exec(val);
                                if (m) evaluated = this.evaluate(m[1], scope);
                            } else if (!isNaN(parseFloat(val))) {
                                evaluated = parseFloat(val);
                            } else if (val.includes('{')) {
                                evaluated = this.interpolate(val, scope);
                            }
                        }
                        childScope[key] = createSignal(evaluated);
                    });
                } else {
                    // Normal component props
                    Object.entries(node.attributes).forEach(([key, val]) => {
                        let evaluated = val;
                        if (typeof val === 'object' && val.type === 'expression') {
                            evaluated = this.evaluate(val.value, scope);
                        } else if (typeof val === 'string' && val.includes('{')) {
                            evaluated = this.interpolate(val, scope);
                        }
                        childScope[key] = createSignal(evaluated);
                    });
                }

                // Pass Children as Slot Content
                // node.children are the 'slotChildren' for this new component instance.
                // We must pass 'scope' as 'slotScope' so they can digest their own variables.

                compDef.template.forEach(c => this.renderNode(c, parent, childScope, node.children, scope, currentIsInsideCodeDisplay));
                return;
            }

            // --- Directive Pre-processing (s-if, s-for) ---
            if (node.attributes['s-for']) {
                const expr = node.attributes['s-for'];
                const match = /^\s*(?:\(?\s*([a-zA-Z0-9_]+)\s*(?:,\s*([a-zA-Z0-9_]+))?\s*\)?)\s+in\s+([\s\S]+)$/.exec(expr);
                if (match) {
                    const iterName = match[1];
                    const indexName = match[2];
                    const collectionExpr = match[3];
                    const anchor = document.createTextNode('');
                    parent.appendChild(anchor);
                    let renderedItems = [];

                    createEffect(() => {
                        renderedItems.forEach(item => item.nodes.forEach(n => n.remove()));
                        renderedItems = [];
                        const collection = this.evaluate(collectionExpr, scope) || [];
                        if (Array.isArray(collection)) {
                            collection.forEach((val, idx) => {
                                const childScope = { ...scope };
                                childScope[iterName] = createSignal(val);
                                if (indexName) childScope[indexName] = createSignal(idx);
                                const newNode = { ...node, attributes: { ...node.attributes } };
                                delete newNode.attributes['s-for'];
                                const frag = document.createDocumentFragment();
                                this.renderNode(newNode, frag, childScope, slotChildren, slotScope, currentIsInsideCodeDisplay);
                                const nodes = Array.from(frag.childNodes);
                                renderedItems.push({ nodes });
                                const lastNode = renderedItems[renderedItems.length - 2]?.nodes.at(-1) || anchor;
                                lastNode.parentNode.insertBefore(frag, lastNode.nextSibling);
                            });
                        }
                    });
                    return;
                }
            }

            if (node.attributes['s-if']) {
                const conditionExpr = node.attributes['s-if'];
                const anchor = document.createTextNode('');
                parent.appendChild(anchor);
                let renderedNodes = [];

                createEffect(() => {
                    renderedNodes.forEach(n => n.remove());
                    const condition = this.evaluate(conditionExpr, scope);
                    if (condition) {
                        const newNode = { ...node, attributes: { ...node.attributes } };
                        delete newNode.attributes['s-if'];
                        const frag = document.createDocumentFragment();
                        this.renderNode(newNode, frag, scope, slotChildren, slotScope, currentIsInsideCodeDisplay);
                        renderedNodes = Array.from(frag.childNodes);
                        anchor.parentNode.insertBefore(frag, anchor.nextSibling);
                    }
                });
                return;
            }

            // Standard HTML Element
            const el = document.createElement(node.name);
            Object.entries(node.attributes).forEach(([key, val]) => {
                if (key.startsWith('@')) {
                    const eventName = key.slice(1);
                    let handlerCode = typeof val === 'object' ? val.value : val;
                    el.addEventListener(eventName, (e) => this.executeStatement(handlerCode, { ...scope, $event: e }));
                } else if (key.startsWith(':')) {
                    const attrName = key.slice(1);
                    let expr = typeof val === 'object' ? val.value : val;
                    createEffect(() => {
                        const evaluatedVal = this.evaluate(expr, scope);
                        if (attrName === 'style' && typeof evaluatedVal === 'object') {
                            Object.assign(el.style, evaluatedVal);
                        } else if (attrName === 'class' && typeof evaluatedVal === 'object') {
                            const staticClass = node.attributes['class'] || '';
                            const dynamicClasses = Object.entries(evaluatedVal)
                                .filter(([_, active]) => active)
                                .map(([name, _]) => name)
                                .join(' ');
                            el.className = (staticClass + ' ' + dynamicClasses).trim();
                        } else {
                            el.setAttribute(attrName, evaluatedVal);
                        }
                    });
                } else if (key.startsWith('use:')) {
                    // Directives (v1.2)
                    const dirName = key.slice(4);
                    if (this.directives[dirName]) {
                        if (typeof val === 'object' && val.type === 'expression') {
                            createEffect(() => this.directives[dirName](el, this.evaluate(val.value, scope), scope));
                        } else if (typeof val === 'string' && val.includes('{')) {
                            createEffect(() => this.directives[dirName](el, this.interpolate(val, scope), scope));
                        } else {
                            this.directives[dirName](el, val, scope);
                        }
                    }
                } else {
                    // General attribute (including style)
                    if (typeof val === 'object' && val.type === 'expression') {
                        createEffect(() => el.setAttribute(key, this.evaluate(val.value, scope)));
                    } else if (typeof val === 'string' && val.includes('{')) {
                        createEffect(() => el.setAttribute(key, this.interpolate(val, scope)));
                    } else {
                        el.setAttribute(key, val);
                    }
                }
            });

            parent.appendChild(el);
            node.children.forEach(child => this.renderNode(child, el, scope, slotChildren, slotScope, currentIsInsideCodeDisplay));
        }
    }
}

// Auto-boot if not disabled
if (typeof window !== 'undefined' && !window.ScritNoAutoBoot) {
    Scrit.boot();
}

// Export to window
window.Scrit = Scrit;
