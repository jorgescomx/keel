import type {
  CustomFieldDef,
  ItemType,
  StatusColumn,
  WorkItem,
} from "@/types";

export interface QueryContext {
  itemTypes: ItemType[];
  statuses: StatusColumn[];
  customFields: CustomFieldDef[];
  allItems: WorkItem[];
}

export type QueryParseResult =
  | { ok: true; matches: (item: WorkItem) => boolean }
  | { ok: false; error: string };

type Token =
  | { type: "IDENT"; value: string }
  | { type: "STRING"; value: string }
  | { type: "OP"; value: string }
  | { type: "LPAREN" }
  | { type: "RPAREN" }
  | { type: "COMMA" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "LPAREN" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "COMMA" });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = "";
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < input.length) {
          str += input[i + 1];
          i += 2;
        } else {
          str += input[i];
          i++;
        }
      }
      if (i >= input.length) {
        throw new Error(`Unterminated string literal`);
      }
      i++; // closing quote
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    // Multi-char operators
    const two = input.slice(i, i + 2);
    if (two === "!=" || two === "!~" || two === ">=" || two === "<=") {
      tokens.push({ type: "OP", value: two });
      i += 2;
      continue;
    }
    if (ch === "=" || ch === "~" || ch === ">" || ch === "<") {
      tokens.push({ type: "OP", value: ch });
      i++;
      continue;
    }

    // Identifier / bare value
    let word = "";
    while (
      i < input.length &&
      !/[\s(),=!~<>'"]/.test(input[i])
    ) {
      word += input[i];
      i++;
    }
    if (word) {
      tokens.push({ type: "IDENT", value: word });
    } else {
      throw new Error(`Unexpected character '${ch}'`);
    }
  }

  return tokens;
}

type Expr =
  | { kind: "AND"; left: Expr; right: Expr }
  | { kind: "OR"; left: Expr; right: Expr }
  | {
      kind: "CLAUSE";
      field: string;
      op: "=" | "!=" | "~" | "!~" | ">" | ">=" | "<" | "<=" | "IN" | "NOT_IN" | "IS_EMPTY" | "IS_NOT_EMPTY";
      values: string[];
    };

const MAX_QUERY_LENGTH = 2_000;
const MAX_NESTING_DEPTH = 20;

class Parser {
  private pos = 0;
  private depth = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new Error("Unexpected end of query");
    this.pos++;
    return t;
  }

  private peekIdent(upper: string): boolean {
    const t = this.peek();
    return t?.type === "IDENT" && t.value.toUpperCase() === upper;
  }

  parse(): Expr {
    const expr = this.parseOr();
    if (this.pos < this.tokens.length) {
      const extra = this.tokens[this.pos];
      throw new Error(
        `Unexpected token '${"value" in extra ? extra.value : extra.type}'`
      );
    }
    return expr;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.peekIdent("OR")) {
      this.consume();
      const right = this.parseAnd();
      left = { kind: "OR", left, right };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parsePrimary();
    while (this.peekIdent("AND")) {
      this.consume();
      const right = this.parsePrimary();
      left = { kind: "AND", left, right };
    }
    return left;
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (!t) throw new Error("Expected condition");
    if (t.type === "LPAREN") {
      if (this.depth >= MAX_NESTING_DEPTH) {
        throw new Error("Query nesting depth limit exceeded");
      }
      this.depth++;
      this.consume();
      const inner = this.parseOr();
      const close = this.consume();
      if (close.type !== "RPAREN") throw new Error("Expected ')'");
      this.depth--;
      return inner;
    }
    return this.parseClause();
  }

  private parseValue(): string {
    const t = this.consume();
    if (t.type === "STRING" || t.type === "IDENT") return t.value;
    throw new Error("Expected a value");
  }

  private parseList(): string[] {
    const open = this.consume();
    if (open.type !== "LPAREN") throw new Error("Expected '(' after IN");
    const values: string[] = [];
    if (this.peek()?.type !== "RPAREN") {
      values.push(this.parseValue());
      while (this.peek()?.type === "COMMA") {
        this.consume();
        values.push(this.parseValue());
      }
    }
    const close = this.consume();
    if (close.type !== "RPAREN") throw new Error("Expected ')'");
    return values;
  }

  private parseClause(): Expr {
    const fieldTok = this.consume();
    if (fieldTok.type !== "IDENT" && fieldTok.type !== "STRING") {
      throw new Error("Expected field name");
    }
    const field = fieldTok.value;

    // IS [NOT] EMPTY
    if (this.peekIdent("IS")) {
      this.consume();
      let negated = false;
      if (this.peekIdent("NOT")) {
        this.consume();
        negated = true;
      }
      if (!this.peekIdent("EMPTY") && !this.peekIdent("NULL")) {
        throw new Error("Expected EMPTY after IS");
      }
      this.consume();
      return {
        kind: "CLAUSE",
        field,
        op: negated ? "IS_NOT_EMPTY" : "IS_EMPTY",
        values: [],
      };
    }

    // NOT IN (...)
    if (this.peekIdent("NOT")) {
      this.consume();
      if (!this.peekIdent("IN")) throw new Error("Expected IN after NOT");
      this.consume();
      return { kind: "CLAUSE", field, op: "NOT_IN", values: this.parseList() };
    }

    // IN (...)
    if (this.peekIdent("IN")) {
      this.consume();
      return { kind: "CLAUSE", field, op: "IN", values: this.parseList() };
    }

    const opTok = this.consume();
    if (opTok.type !== "OP") {
      throw new Error(
        `Expected operator (=, !=, ~, in, is empty) after '${field}'`
      );
    }
    const val = this.parseValue();
    return {
      kind: "CLAUSE",
      field,
      op: opTok.value as "=" | "!=" | "~" | "!~" | ">" | ">=" | "<" | "<=",
      values: [val],
    };
  }
}

function getFieldValues(
  item: WorkItem,
  rawField: string,
  ctx: QueryContext
): string[] {
  const f = rawField.trim().toLowerCase();

  if (f === "key") return [item.key];
  if (f === "title" || f === "summary") return [item.title];
  if (f === "description" || f === "desc") return [item.description];
  if (f === "priority") return [item.priority];
  if (f === "label" || f === "labels") return item.labels;
  if (f === "due" || f === "duedate" || f === "due_date") {
    return item.dueDate ? [item.dueDate] : [];
  }
  if (f === "type") {
    const t = ctx.itemTypes.find((x) => x.id === item.typeId);
    return t ? [t.name, t.pluralName] : [];
  }
  if (f === "level" || f === "tier") {
    const t = ctx.itemTypes.find((x) => x.id === item.typeId);
    return t ? [String(t.level)] : [];
  }
  if (f === "status") {
    const s = ctx.statuses.find((x) => x.id === item.statusId);
    return s ? [s.name, s.category] : [];
  }
  if (f === "parent") {
    if (!item.parentId) return [];
    const p = ctx.allItems.find((x) => x.id === item.parentId);
    return p ? [p.key, p.title] : [];
  }

  // Match custom field by name (case-insensitive)
  const cf = ctx.customFields.find((c) => c.name.toLowerCase() === f);
  if (cf) {
    const val = item.customFields[cf.id];
    if (val === undefined || val === null || val === "") return [];
    if (cf.fieldType === "select" && typeof val === "string") {
      const opt = cf.options.find((o) => o.id === val);
      return opt ? [opt.label, opt.id] : [val];
    }
    if (cf.fieldType === "multi_select" && Array.isArray(val)) {
      const out: string[] = [];
      for (const id of val) {
        const opt = cf.options.find((o) => o.id === id);
        if (opt) out.push(opt.label, opt.id);
        else out.push(String(id));
      }
      return out;
    }
    if (cf.fieldType === "checkbox") {
      return [val ? "true" : "false"];
    }
    return [String(val)];
  }

  return [];
}

function evalExpr(expr: Expr, item: WorkItem, ctx: QueryContext): boolean {
  if (expr.kind === "AND") {
    return evalExpr(expr.left, item, ctx) && evalExpr(expr.right, item, ctx);
  }
  if (expr.kind === "OR") {
    return evalExpr(expr.left, item, ctx) || evalExpr(expr.right, item, ctx);
  }

  const fieldVals = getFieldValues(item, expr.field, ctx);
  const lowerVals = fieldVals.map((v) => v.toLowerCase());

  switch (expr.op) {
    case "IS_EMPTY":
      return fieldVals.length === 0 || fieldVals.every((v) => v === "");
    case "IS_NOT_EMPTY":
      return fieldVals.some((v) => v !== "");
    case "=": {
      const target = expr.values[0].toLowerCase();
      return lowerVals.some((v) => v === target);
    }
    case "!=": {
      const target = expr.values[0].toLowerCase();
      return lowerVals.every((v) => v !== target);
    }
    case "~": {
      const target = expr.values[0].toLowerCase();
      return lowerVals.some((v) => v.includes(target));
    }
    case "!~": {
      const target = expr.values[0].toLowerCase();
      return lowerVals.every((v) => !v.includes(target));
    }
    case "IN": {
      const set = new Set(expr.values.map((v) => v.toLowerCase()));
      return lowerVals.some((v) => set.has(v));
    }
    case "NOT_IN": {
      const set = new Set(expr.values.map((v) => v.toLowerCase()));
      return lowerVals.every((v) => !set.has(v));
    }
    case ">":
    case ">=":
    case "<":
    case "<=": {
      if (fieldVals.length === 0) return false;
      const aNum = Number(fieldVals[0]);
      const bNum = Number(expr.values[0]);
      const cmp =
        !Number.isNaN(aNum) && !Number.isNaN(bNum)
          ? aNum - bNum
          : fieldVals[0].localeCompare(expr.values[0]);
      if (expr.op === ">") return cmp > 0;
      if (expr.op === ">=") return cmp >= 0;
      if (expr.op === "<") return cmp < 0;
      return cmp <= 0;
    }
  }
}

export function compileQuery(
  query: string,
  ctx: QueryContext
): QueryParseResult {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: true, matches: () => true };
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return {
      ok: false,
      error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
    };
  }
  try {
    const tokens = tokenize(trimmed);
    const ast = new Parser(tokens).parse();
    return {
      ok: true,
      matches: (item: WorkItem) => evalExpr(ast, item, ctx),
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid query",
    };
  }
}
