// Syntax highlighting for the site's code blocks. No dependencies.
//
// Each <pre> names its language in data-lang: sql, shell, yaml, ini, xml,
// plan, tree, gitout, hs or plain. Spans already in the markup (diff lines,
// hazards, prompts, hand-marked comments) are kept: text inside .c, .w, .b,
// .o and .p is left alone, text inside .add, .del and .hl is highlighted too.
(() => {
  const words = (s) => new Set(s.split(/\s+/).filter(Boolean));

  const SQL_KEYWORDS = words(`
    select from where and or not null is in as on create table index view
    function trigger alter add drop column type using begin commit rollback set
    if exists replace returns return language declare end comment schema grant
    usage all tables default insert into values update delete group by order
    limit primary key references foreign constraint check valid validate
    concurrently lock mode share access exclusive each row execute before after
    perform raise exception message plpgsql security definer volatile generated
    always identity do then else when case extension cascade role nologin
    privileges distinct join left inner outer union true false of nulls
    deferrable restrict sql stable immutable`);
  const SQL_TYPES = words(`
    bigint integer int int2 int4 int8 smallint text numeric date timestamptz
    timestamp boolean bool jsonb json void uuid serial bigserial varchar char
    ltree regclass interval real double precision fsm_event_payload`);
  // Lines of tool output that are SQL start with one of these.
  const SQL_STARTS = words(`
    select alter create drop comment begin commit set do raise end from where
    group insert update grant revoke declare if perform return`);
  const COMMANDS = words(`
    sqiff sqint sqitch git nix psql psql-retry create-migration hasql-check
    cabal mkdir docker curl find rm cp sh bash exec export echo cd tail awk
    cat sed declare for done do if fi then pgxn make`);

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const span = (cls, text) => `<span class="tk-${cls}">${esc(text)}</span>`;

  // Run a list of [regex, class or function] rules over text, first match wins.
  function tokenize(text, rules) {
    let out = "";
    let i = 0;
    while (i < text.length) {
      let best = null;
      for (const [re, kind] of rules) {
        re.lastIndex = i;
        const m = re.exec(text);
        if (m && (best === null || m.index < best.m.index)) best = { m, kind };
        if (m && m.index === i) break;
      }
      if (!best) { out += esc(text.slice(i)); break; }
      out += esc(text.slice(i, best.m.index));
      const t = best.m[0];
      out += typeof best.kind === "function" ? best.kind(t, best.m) : span(best.kind, t);
      i = best.m.index + Math.max(t.length, 1);
    }
    return out;
  }

  const g = (src) => new RegExp(src, "g");

  function sql(text) {
    return tokenize(text, [
      [g(String.raw`--.*`), "c"],
      [g(String.raw`'(?:[^']|'')*'?`), "s"],
      [g(String.raw`\$\w*\$`), "k"],
      [g(String.raw`\b\d+(?:\.\d+)?(?:ms|s)?\b`), "n"],
      [g(String.raw`[A-Za-z_][\w.]*(?=\s*\()`), (t) => {
        const last = t.split(".").pop().toLowerCase();
        if (SQL_KEYWORDS.has(last)) return span("k", t);
        if (SQL_TYPES.has(last)) return span("t", t);
        return span("fn", t);
      }],
      [g(String.raw`[A-Za-z_]\w*`), (t) => {
        const w = t.toLowerCase();
        if (SQL_KEYWORDS.has(w)) return span("k", t);
        if (SQL_TYPES.has(w)) return span("t", t);
        return esc(t);
      }],
    ]);
  }

  function shellCommand(text, st) {
    // The first word of a command, after any VAR=value assignments.
    let first = !st.cmdStarted;
    return tokenize(text, [
      [g(String.raw`(?:^|(?<=\s))#.*`), "c"],
      [g(String.raw`"(?:[^"\\]|\\.)*"?`), (t) => {
        if (!t.endsWith('"') || t.length === 1) st.inDQ = !st.inDQ;
        return span("s", t);
      }],
      [g(String.raw`'[^']*'?`), "s"],
      [g(String.raw`\$\{[^}]*\}|\$\(|\$[\w@#?*]+`), "v"],
      [g(String.raw`(?<=^|\s)--?[A-Za-z][\w-]*(?:=[^\s"']*)?`), "f"],
      [g(String.raw`[A-Za-z_]\w*=`), (t) => span("v", t)],
      [g(String.raw`[^\s"'$#]+`), (t) => {
        if (first) { first = false; st.cmdStarted = true; return span("cmd", t); }
        return esc(t);
      }],
    ]);
  }

  function inDoubleQuotes(text, st) {
    // The rest of a quoted string carried over from an earlier line.
    const end = text.search(/(?<!\\)"/);
    if (end === -1) return span("s", text);
    st.inDQ = false;
    return span("s", text.slice(0, end + 1)) + shellCommand(text.slice(end + 1), st);
  }

  function severity(text) {
    return text.replace(/^(\s*)(BLOCK|WARN|INFO|SUPPRESSED)\b/, (_, ws, w) =>
      ws + `\u0000${w}\u0001`);
  }
  function withSeverity(text, inner) {
    const marked = severity(text);
    if (!marked.includes("\u0000")) return inner(text);
    const [, before, word, after] = marked.match(/^([^\u0000]*)\u0000(\w+)\u0001(.*)$/s);
    const cls = { BLOCK: "sev-b", WARN: "sev-w", INFO: "sev-i", SUPPRESSED: "sev-i" }[word];
    return esc(before) + span(cls, word) + inner(after);
  }

  function yaml(text) {
    return tokenize(text, [
      [g(String.raw`(?:^|(?<=\s))#.*`), "c"],
      [g(String.raw`^(\s*-?\s*)[\w.\-]+(?=:(\s|$))`), (t) => {
        const m = t.match(/^(\s*-?\s*)(.*)$/);
        return esc(m[1]) + span("k", m[2]);
      }],
      [g(String.raw`"(?:[^"\\]|\\.)*"|'[^']*'`), "s"],
      [g(String.raw`\$\{\{[^}]*\}\}|\$\w+`), "v"],
      [g(String.raw`\b\d+\b`), "n"],
    ]);
  }

  function ini(text) {
    return tokenize(text, [
      [g(String.raw`#.*`), "c"],
      [g(String.raw`^\s*\[[^\]]*\]`), "k"],
      [g(String.raw`^\s*[\w.]+(?=\s*=)`), "t"],
    ]);
  }

  function xml(text) {
    return tokenize(text, [
      [g(String.raw`</?[\w:]+|/?>`), "k"],
      [g(String.raw`[\w:]+(?==)`), "t"],
      [g(String.raw`"[^"]*"`), "s"],
    ]);
  }

  function plan(text) {
    return tokenize(text, [
      [g(String.raw`^(<{7}|={7}|>{7}).*`), "conflict"],
      [g(String.raw`\s#.*`), "c"],
      [g(String.raw`^%.*`), "k"],
      [g(String.raw`@[\w.\-]+`), "t"],
      [g(String.raw`\[[^\]]*\]`), "f"],
      [g(String.raw`<[^>\s]+@[^>\s]+>`), "c"],
    ]);
  }

  function tree(text) {
    return tokenize(text, [
      [g(String.raw`(?:^|(?<=\s))#.*`), "c"],
      [g(String.raw`^\s*[MAD](?=\s)`), "f"],
      [g(String.raw`[\w.\-…{}]+/`), "k"],
      [g(String.raw`[\w\-.]+@[\w\-.]+\.sql`), "dim"],
    ]);
  }

  function hs(text) {
    return tokenize(text, [
      [g(String.raw`--.*`), "c"],
      [g(String.raw`"(?:[^"\\]|\\.)*"`), "s"],
      [g(String.raw`<-|->|\\|\.(?=\s)`), "k"],
      [g(String.raw`\b[A-Z][\w]*(?:\.[A-Z][\w]*)*\.?[a-z]\w*`), "fn"],
      [g(String.raw`\b[A-Z][\w.]*`), "t"],
    ]);
  }

  function md(text) {
    if (/^#{1,6} /.test(text)) return span("md-h", text);
    if (/^```/.test(text)) return span("c", text);
    return tokenize(text, [
      [g(String.raw`^\s*(?:[-*]|\d+\.)(?=\s)`), "f"],
      [g(String.raw`\|`), "c"],
      [g(String.raw`\x60[^\x60]+\x60`), "s"],
      [g(String.raw`\*\*[^*]+\*\*`), "t"],
      [g(String.raw`<[^>\s][^>]*>`), "v"],
    ]);
  }

  function gitLine(text) {
    // git blame / log lines: a hash, then metadata, then code.
    let m = text.match(/^(\^?[0-9a-f]{7,8})( \([^)]*\))?(.*)$/s);
    if (m) return span("h", m[1]) + (m[2] ? span("dim", m[2]) : "") +
      (m[2] ? sql(m[3]) : esc(m[3]));
    m = text.match(/^(@@[^@]*@@)(.*)$/s);
    if (m) return span("t", m[1]) + sql(m[2]);
    m = text.match(/^(.*\|\s*\d+ )(\+*)(-*)$/s);
    if (m) return esc(m[1]) + span("plus", m[2]) + span("minus", m[3]);
    return esc(text);
  }

  // One line of a block, given the block's language and the line's state.
  function line(text, lang, st, lineStart) {
    if (lang === "plain") return withSeverity(text, esc);
    if (lang === "sql") return sql(text);
    if (lang === "yaml") return yaml(text);
    if (lang === "ini") return ini(text);
    if (lang === "xml") return xml(text);
    if (lang === "hs") return hs(text);
    if (lang === "tree") return tree(text);
    if (lang === "md") return md(text);

    // shell, gitout and plan blocks mix commands with their output.
    if (lineStart) {
      const firstWord = (text.trim().split(/\s+/)[0] || "");
      st.isCmd = st.afterPrompt || st.continued || st.inDQ ||
        (lang === "shell" && (st.pure || COMMANDS.has(firstWord) || /^[A-Z_]+=/.test(firstWord)));
      st.cmdStarted = st.continued || st.inDQ;
      if (!st.isCmd) {
        const w = firstWord.toLowerCase().replace(/[^a-z_]/g, "");
        const indented = /^\s/.test(text) && text.trim() !== "";
        st.sqlCtx = SQL_STARTS.has(w) || (indented && st.sqlCtx) ||
          /^[A-Z]{2,}\b.*\b(ON|AS|FROM)\b/.test(text.trim());
      }
    }
    if (st.isCmd) {
      if (st.inDQ) return inDoubleQuotes(text, st);
      return shellCommand(text, st);
    }
    if (lang === "plan") return plan(text);
    if (lang === "gitout" && /^(\^?[0-9a-f]{7,8}\b|@@)|\|\s*\d+ [+-]/.test(text)) return gitLine(text);
    if (st.sqlCtx) return sql(text);
    return withSeverity(text, esc);
  }

  const SKIP = ".c, .w, .b, .o, .p";

  function highlight(pre) {
    const lang = pre.dataset.lang;
    if (!lang) return;
    const st = {
      pure: !pre.querySelector(".p"),
      afterPrompt: false, continued: false, inDQ: false,
      isCmd: false, cmdStarted: false, sqlCtx: false,
    };
    let atLineStart = true;
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const parent = node.parentElement;
      const skipped = parent !== pre && parent.closest(SKIP) && pre.contains(parent.closest(SKIP));
      const text = node.nodeValue;
      if (skipped) {
        // A prompt marks the rest of its line as a command, still at line start.
        if (parent.closest(".p")) { st.afterPrompt = true; continue; }
        if (text.includes("\n")) { atLineStart = true; st.afterPrompt = false; }
        else atLineStart = false;
        continue;
      }
      const parts = text.split("\n");
      let html = "";
      parts.forEach((part, idx) => {
        if (idx > 0) {
          html += "\n";
          // Remember whether the line just finished continues the command.
          st.continued = st.isCmd && /\\\s*$/.test(parts[idx - 1]);
          st.afterPrompt = false;
          atLineStart = true;
        }
        if (part === "") return;
        html += line(part, lang, st, atLineStart);
        atLineStart = false;
      });
      const holder = document.createElement("span");
      holder.innerHTML = html;
      node.replaceWith(...holder.childNodes);
    }
  }

  document.querySelectorAll("pre[data-lang]").forEach(highlight);
  // For blocks filled in after load, such as a file fetched by the page.
  window.highlightPre = highlight;
})();
